import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators';

/**
 * Intercepts requests to extract X-Organization-Id header,
 * validates user membership, and attaches orgId + orgRole to request.
 *
 * Skipped for routes marked with @Public() or routes without the header
 * (like auth routes or /organizations listing).
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(
    private prisma: PrismaService,
    private reflector: Reflector,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const orgId = request.headers['x-organization-id'];

    // If no org header, allow the request through (some routes don't need it)
    if (!orgId) {
      return next.handle();
    }

    const userId = request.user?.id;
    if (!userId) {
      return next.handle();
    }

    // Validate the user is a member of this organization
    const membership = await this.prisma.orgMember.findUnique({
      where: { userId_orgId: { userId, orgId } },
    });

    if (!membership) {
      throw new ForbiddenException('Not a member of this organization');
    }

    // Attach org context to request
    request.orgId = orgId;
    request.orgRole = membership.role;

    return next.handle();
  }
}
