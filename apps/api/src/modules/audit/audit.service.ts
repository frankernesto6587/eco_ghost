import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditLogParams {
  action: string;
  entity: string;
  entityId: string;
  changes?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
  userId: string;
  orgId: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(params: AuditLogParams) {
    return this.prisma.auditLog.create({
      data: {
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        changes: params.changes ?? undefined,
        metadata: params.metadata ?? undefined,
        userId: params.userId,
        orgId: params.orgId,
      },
    });
  }

  async findByEntity(orgId: string, entityId: string) {
    return this.prisma.auditLog.findMany({
      where: { orgId, entityId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
