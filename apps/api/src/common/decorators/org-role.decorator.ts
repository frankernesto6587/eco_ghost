import { createParamDecorator, ExecutionContext, ForbiddenException } from '@nestjs/common';
import type { Role } from '@prisma/client';

/** Rol en la organizacion activa (lo resuelve RolesGuard a partir de X-Organization-Id). */
export const OrgRole = createParamDecorator((_data: unknown, ctx: ExecutionContext): Role => {
  const role = ctx.switchToHttp().getRequest().orgRole;
  if (!role) throw new ForbiddenException('No organization role found');
  return role;
});
