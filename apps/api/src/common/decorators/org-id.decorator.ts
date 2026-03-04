import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Extracts the organization ID set by TenantInterceptor.
 * Usage: @OrgId() orgId: string
 */
export const OrgId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.orgId;
  },
);
