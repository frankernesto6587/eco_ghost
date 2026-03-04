import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import slugify from 'slugify';
import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_CATEGORIES } from '@ecoghost/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { CreateOrgDto, UpdateOrgDto, UpdateRoleDto } from './dto';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
  ) {}

  /**
   * Create a new organization, add the creating user as OWNER,
   * and seed default categories.
   */
  async create(userId: string, dto: CreateOrgDto) {
    const slug = slugify(dto.name, { lower: true, strict: true });

    // Check for slug uniqueness
    const existing = await this.prisma.organization.findUnique({
      where: { slug },
    });
    if (existing) {
      throw new ConflictException(
        `Organization with slug "${slug}" already exists`,
      );
    }

    const org = await this.prisma.organization.create({
      data: {
        name: dto.name,
        slug,
        baseCurrency: dto.baseCurrency,
        members: {
          create: {
            userId,
            role: Role.OWNER,
          },
        },
      },
    });

    // Seed default categories
    await this.seedDefaultCategories(org.id);

    return org;
  }

  /**
   * List all organizations the user belongs to, including their role.
   */
  async findAllForUser(userId: string) {
    const memberships = await this.prisma.orgMember.findMany({
      where: { userId },
      include: {
        org: true,
      },
    });

    return memberships.map((m) => ({
      ...m.org,
      role: m.role,
    }));
  }

  /**
   * Get a single organization by ID.
   * Includes inviteToken only if the requesting user is OWNER.
   */
  async findOne(orgId: string, userId?: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
    });

    if (!org) {
      throw new NotFoundException(`Organization with ID "${orgId}" not found`);
    }

    const telegramConnected = org.telegramChatId !== null;
    // Strip BigInt field to avoid serialization issues
    const { telegramChatId: _, inviteToken, ...rest } = org;

    // Check if user is OWNER to decide whether to expose inviteToken
    if (userId) {
      const membership = await this.prisma.orgMember.findUnique({
        where: { userId_orgId: { userId, orgId } },
      });
      if (membership?.role === Role.OWNER) {
        return { ...rest, inviteToken, telegramConnected };
      }
    }

    return { ...rest, telegramConnected };
  }

  /**
   * Update organization name and/or baseCurrency.
   */
  async update(orgId: string, dto: UpdateOrgDto) {
    await this.findOne(orgId);

    const data: Record<string, unknown> = {};

    if (dto.name !== undefined) {
      const newSlug = slugify(dto.name, { lower: true, strict: true });
      const existing = await this.prisma.organization.findFirst({
        where: { slug: newSlug, id: { not: orgId } },
      });
      if (existing) {
        throw new ConflictException(`Organization with slug "${newSlug}" already exists`);
      }
      data.name = dto.name;
      data.slug = newSlug;
    }

    if (dto.baseCurrency !== undefined) {
      data.baseCurrency = dto.baseCurrency;
    }

    return this.prisma.organization.update({
      where: { id: orgId },
      data,
    });
  }

  /**
   * Delete an organization (cascades to all related data).
   */
  async remove(orgId: string) {
    await this.findOne(orgId);

    return this.prisma.organization.delete({
      where: { id: orgId },
    });
  }

  /**
   * Join an organization using its invite token.
   * User is added as VIEWER.
   */
  async join(token: string, userId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { inviteToken: token },
    });

    if (!org) {
      throw new NotFoundException('Token de invitacion invalido');
    }

    // Check if user is already a member
    const existingMember = await this.prisma.orgMember.findUnique({
      where: { userId_orgId: { userId, orgId: org.id } },
    });

    if (existingMember) {
      throw new ConflictException('Ya eres miembro de esta organizacion');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });

    await this.prisma.orgMember.create({
      data: {
        userId,
        orgId: org.id,
        role: Role.VIEWER,
      },
    });

    this.telegram.notify(org.id, `👋 *Nuevo miembro*\n${user?.name ?? user?.email ?? 'Usuario'} se unio a la organizacion`);

    return { id: org.id, name: org.name, slug: org.slug, plan: org.plan, baseCurrency: org.baseCurrency };
  }

  /**
   * Regenerate the invite token for an organization.
   * Optionally expel specified members.
   */
  async regenerateToken(orgId: string, expelMemberIds?: string[]) {
    const newToken = uuidv4();

    await this.prisma.$transaction(async (tx) => {
      // Expel selected members (skip OWNER just in case)
      if (expelMemberIds && expelMemberIds.length > 0) {
        await tx.orgMember.deleteMany({
          where: {
            id: { in: expelMemberIds },
            orgId,
            role: { not: Role.OWNER },
          },
        });
      }

      // Set new token
      await tx.organization.update({
        where: { id: orgId },
        data: { inviteToken: newToken },
      });
    });

    return { inviteToken: newToken };
  }

  /**
   * List all members of an organization with user info.
   */
  async getMembers(orgId: string) {
    await this.findOne(orgId);

    return this.prisma.orgMember.findMany({
      where: { orgId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });
  }

  /**
   * Update a member's role. Cannot change the OWNER role.
   */
  async updateMemberRole(
    orgId: string,
    memberId: string,
    dto: UpdateRoleDto,
  ) {
    const member = await this.prisma.orgMember.findFirst({
      where: { id: memberId, orgId },
    });

    if (!member) {
      throw new NotFoundException(
        `Member with ID "${memberId}" not found in this organization`,
      );
    }

    if (member.role === Role.OWNER) {
      throw new ForbiddenException('Cannot change the role of the owner');
    }

    if (dto.role === Role.OWNER) {
      throw new ForbiddenException('Cannot assign the OWNER role');
    }

    const updated = await this.prisma.orgMember.update({
      where: { id: memberId },
      data: { role: dto.role },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
    });

    this.telegram.notify(orgId, `🔄 *Rol actualizado*\n${updated.user.name ?? updated.user.email}: ${dto.role}`);

    return updated;
  }

  /**
   * Remove a member from an organization. Cannot remove the OWNER.
   */
  async removeMember(orgId: string, memberId: string) {
    const member = await this.prisma.orgMember.findFirst({
      where: { id: memberId, orgId },
    });

    if (!member) {
      throw new NotFoundException(
        `Member with ID "${memberId}" not found in this organization`,
      );
    }

    if (member.role === Role.OWNER) {
      throw new ForbiddenException('Cannot remove the owner of the organization');
    }

    const deleted = await this.prisma.orgMember.delete({
      where: { id: memberId },
      include: {
        user: {
          select: { name: true, email: true },
        },
      },
    });

    this.telegram.notify(orgId, `❌ *Miembro eliminado*\n${deleted.user.name ?? deleted.user.email}`);

    return deleted;
  }

  /**
   * Disconnect Telegram from an organization.
   */
  async disconnectTelegram(orgId: string) {
    await this.prisma.organization.update({
      where: { id: orgId },
      data: { telegramChatId: null },
    });

    return { ok: true };
  }

  /**
   * Seed default categories for a new organization.
   * Creates parent categories first, then their children with parentId.
   */
  private async seedDefaultCategories(orgId: string) {
    for (const category of DEFAULT_CATEGORIES) {
      const parent = await this.prisma.category.create({
        data: {
          name: category.name,
          icon: category.icon,
          color: category.color,
          orgId,
        },
      });

      if (category.children && category.children.length > 0) {
        await this.prisma.category.createMany({
          data: category.children.map((child) => ({
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
