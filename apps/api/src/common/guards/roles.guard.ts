import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Guard that:
 * 1. Resolves the user's organization membership from X-Organization-Id header
 * 2. Attaches orgId + orgRole to request
 * 3. Checks if the user's role matches the required @Roles() decorator
 *
 * This combines tenant resolution and role checking in a single guard
 * to avoid execution order issues between interceptors and guards.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const orgId = request.headers['x-organization-id'];
    const userId = request.user?.id;

    // Resolve tenant if header present and user authenticated
    if (orgId && userId && !request.orgRole) {
      const membership = await this.prisma.orgMember.findUnique({
        where: { userId_orgId: { userId, orgId } },
      });

      if (!membership) {
        throw new ForbiddenException('Not a member of this organization');
      }

      request.orgId = orgId;
      request.orgRole = membership.role;
    }

    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No @Roles() decorator = allow all authenticated users
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const userRole: Role = request.orgRole;

    if (!userRole) {
      throw new ForbiddenException('No organization role found');
    }

    if (!requiredRoles.includes(userRole)) {
      throw new ForbiddenException(
        `Role ${userRole} is not authorized. Required: ${requiredRoles.join(', ')}`,
      );
    }

    return true;
  }
}
