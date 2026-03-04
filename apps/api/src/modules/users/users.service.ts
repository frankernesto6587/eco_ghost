import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateProfileDto, ChangePasswordDto } from './dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  /** Get user by ID with their organization memberships */
  async findById(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        provider: true,
        isVerified: true,
        createdAt: true,
        memberships: {
          include: {
            org: {
              select: {
                id: true,
                name: true,
                slug: true,
                plan: true,
                baseCurrency: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  /** Update user profile fields */
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        provider: true,
        isVerified: true,
        createdAt: true,
      },
    });
  }

  /** Change password (only for LOCAL provider users) */
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.passwordHash) {
      throw new BadRequestException(
        'No se puede cambiar la contrasena de una cuenta OAuth',
      );
    }

    const isValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!isValid) {
      throw new BadRequestException('Contrasena actual incorrecta');
    }

    const newHash = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    return { message: 'Contrasena actualizada' };
  }

  /** Generate a 6-digit code to link Telegram account (expires in 10 min) */
  async generateTelegramLinkToken(userId: string) {
    // Delete any existing tokens for this user
    await this.prisma.telegramLinkToken.deleteMany({ where: { userId } });

    const code = String(randomInt(100000, 999999));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await this.prisma.telegramLinkToken.create({
      data: { code, expiresAt, userId },
    });

    return { code, expiresAt };
  }

  /** Get current Telegram link status */
  async getTelegramStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { telegramId: true },
    });
    return { linked: !!user?.telegramId };
  }

  /** Unlink Telegram account */
  async unlinkTelegram(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { telegramId: null },
    });
    return { message: 'Telegram desvinculado' };
  }
}
