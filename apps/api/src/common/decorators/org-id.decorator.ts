import { createParamDecorator, ExecutionContext, BadRequestException } from '@nestjs/common';

/**
 * Extrae el orgId que `RolesGuard` resuelve desde la cabecera X-Organization-Id.
 * Uso: @OrgId() orgId: string
 *
 * Falla CERRADO a proposito: `RolesGuard` solo resuelve el tenant si la cabecera
 * viene, y sin un `@Roles()` deja pasar igual. Si `orgId` llegara `undefined`,
 * un `where: { orgId: undefined }` en Prisma equivale a NO filtrar, devolviendo
 * datos de todas las organizaciones. Lanzar aqui cubre de una vez los ~30 call
 * sites sin depender de que cada uno se acuerde de comprobarlo.
 */
export const OrgId = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  const orgId = request.orgId;
  if (!orgId || typeof orgId !== 'string') {
    throw new BadRequestException('X-Organization-Id header is required');
  }
  return orgId;
});
