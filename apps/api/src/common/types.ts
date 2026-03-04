import { Role } from '@prisma/client';

/** JWT token payload stored in the access token */
export interface JwtPayload {
  sub: string; // userId
  email: string;
}

/** Extended request with tenant context (set by TenantInterceptor) */
export interface RequestWithOrg {
  user: JwtPayload & { id: string };
  orgId?: string;
  orgRole?: Role;
  headers: Record<string, string>;
}
