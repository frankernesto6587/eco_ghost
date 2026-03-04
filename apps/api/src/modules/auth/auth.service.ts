import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthProvider, User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import slugify from 'slugify';
import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_CATEGORIES } from '@ecoghost/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../../common/types';
import { RegisterDto } from './dto';

const BCRYPT_ROUNDS = 10;
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_DAYS = 7;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  // ─── Registration ──────────────────────────────────────────────────

  async register(dto: RegisterDto) {
    // Check if user already exists
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    // Create user, default org, membership, and seed categories in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          name: dto.name,
          passwordHash,
          provider: AuthProvider.LOCAL,
        },
      });

      const orgSlug = this.generateSlug(dto.name);
      const organization = await tx.organization.create({
        data: {
          name: `${dto.name}'s Organization`,
          slug: orgSlug,
        },
      });

      await tx.orgMember.create({
        data: {
          userId: user.id,
          orgId: organization.id,
          role: 'OWNER',
        },
      });

      // Seed default categories for the new organization
      await this.seedDefaultCategories(tx, organization.id);

      return { user, organization };
    });

    const tokens = await this.generateTokens(result.user);

    return {
      user: this.sanitizeUser(result.user),
      tokens,
      organizations: [
        {
          id: result.organization.id,
          name: result.organization.name,
          slug: result.organization.slug,
          plan: result.organization.plan,
          baseCurrency: result.organization.baseCurrency,
          role: 'OWNER' as const,
        },
      ],
    };
  }

  // ─── Login ─────────────────────────────────────────────────────────

  async login(user: User) {
    const tokens = await this.generateTokens(user);

    const memberships = await this.prisma.orgMember.findMany({
      where: { userId: user.id },
      include: { org: true },
    });

    return {
      user: this.sanitizeUser(user),
      tokens,
      organizations: memberships.map((m) => ({
        id: m.org.id,
        name: m.org.name,
        slug: m.org.slug,
        plan: m.org.plan,
        baseCurrency: m.org.baseCurrency,
        role: m.role,
      })),
    };
  }

  // ─── Validation (Local Strategy) ──────────────────────────────────

  async validateLocalUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.passwordHash) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      return null;
    }

    return user;
  }

  // ─── Validation (OAuth Strategy) ──────────────────────────────────

  async validateOAuthUser(profile: {
    provider: string;
    providerId: string;
    email: string;
    name: string;
    avatarUrl: string | null;
  }) {
    const provider = profile.provider as AuthProvider;

    // Try to find existing user by provider + providerId
    let user = await this.prisma.user.findFirst({
      where: {
        provider,
        providerId: profile.providerId,
      },
    });

    if (user) {
      return user;
    }

    // Try to find by email (might exist as LOCAL user)
    user = await this.prisma.user.findUnique({
      where: { email: profile.email },
    });

    if (user) {
      // Link the OAuth provider to the existing account
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          provider,
          providerId: profile.providerId,
          avatarUrl: user.avatarUrl ?? profile.avatarUrl,
          isVerified: true,
        },
      });
      return user;
    }

    // Create a brand-new user + default org
    const result = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: profile.email,
          name: profile.name,
          avatarUrl: profile.avatarUrl,
          provider,
          providerId: profile.providerId,
          isVerified: true,
        },
      });

      const orgSlug = this.generateSlug(profile.name);
      const organization = await tx.organization.create({
        data: {
          name: `${profile.name}'s Organization`,
          slug: orgSlug,
        },
      });

      await tx.orgMember.create({
        data: {
          userId: newUser.id,
          orgId: organization.id,
          role: 'OWNER',
        },
      });

      await this.seedDefaultCategories(tx, organization.id);

      return newUser;
    });

    return result;
  }

  // ─── Token Refresh ────────────────────────────────────────────────

  async refreshTokens(refreshToken: string) {
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (storedToken.expiresAt < new Date()) {
      // Clean up expired token
      await this.prisma.refreshToken.delete({
        where: { id: storedToken.id },
      });
      throw new UnauthorizedException('Refresh token has expired');
    }

    // Rotate: delete the old token, then issue new pair
    await this.prisma.refreshToken.delete({
      where: { id: storedToken.id },
    });

    const tokens = await this.generateTokens(storedToken.user);
    return tokens;
  }

  // ─── Logout ───────────────────────────────────────────────────────

  async logout(refreshToken: string) {
    await this.prisma.refreshToken.deleteMany({
      where: { token: refreshToken },
    });
  }

  // ─── Token Generation ─────────────────────────────────────────────

  async generateTokens(user: Pick<User, 'id' | 'email'>) {
    const payload: JwtPayload = { sub: user.id, email: user.email };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: ACCESS_TOKEN_EXPIRY,
    });

    const refreshTokenValue = uuidv4();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_DAYS);

    await this.prisma.refreshToken.create({
      data: {
        token: refreshTokenValue,
        userId: user.id,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken: refreshTokenValue,
    };
  }

  // ─── Profile ──────────────────────────────────────────────────────

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        memberships: {
          include: { org: true },
        },
      },
    });

    return {
      user: this.sanitizeUser(user),
      organizations: user.memberships.map((m) => ({
        id: m.org.id,
        name: m.org.name,
        slug: m.org.slug,
        plan: m.org.plan,
        baseCurrency: m.org.baseCurrency,
        role: m.role,
      })),
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  private sanitizeUser(user: User) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      provider: user.provider,
      isVerified: user.isVerified,
      createdAt: user.createdAt.toISOString(),
    };
  }

  private generateSlug(name: string): string {
    const base = slugify(name, { lower: true, strict: true });
    const suffix = uuidv4().slice(0, 8);
    return `${base}-${suffix}`;
  }

  /**
   * Seeds the DEFAULT_CATEGORIES (with parent/children hierarchy)
   * for a newly created organization.
   */
  private async seedDefaultCategories(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    orgId: string,
  ) {
    for (const parentCat of DEFAULT_CATEGORIES) {
      const parent = await tx.category.create({
        data: {
          name: parentCat.name,
          icon: parentCat.icon,
          color: parentCat.color,
          orgId,
        },
      });

      if (parentCat.children.length > 0) {
        await tx.category.createMany({
          data: parentCat.children.map((child) => ({
            name: child.name,
            icon: child.icon,
            color: child.color,
            parentId: parent.id,
            orgId,
          })),
        });
      }
    }
  }
}
