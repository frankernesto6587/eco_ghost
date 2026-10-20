import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUser, OrgId } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';

export class MarkReadDto {
  @ApiPropertyOptional({ description: 'Ids a marcar como leidos; sin ids, todos' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ids?: string[];
}

/** Avisos para el usuario en la organizacion activa (p. ej. "tu gasto fue aprobado"). */
@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Mis avisos, los mas nuevos primero' })
  list(@OrgId() orgId: string, @CurrentUser('id') userId: string) {
    return this.prisma.notification.findMany({
      where: { orgId, userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  @Post('read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Marcar como leidos' })
  async markRead(@OrgId() orgId: string, @CurrentUser('id') userId: string, @Body() dto: MarkReadDto) {
    await this.prisma.notification.updateMany({
      where: { orgId, userId, isRead: false, ...(dto.ids?.length && { id: { in: dto.ids } }) },
      data: { isRead: true },
    });
  }
}
