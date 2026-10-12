import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

/**
 * Guard for routes that act on an organization by URL (`/organizations/:id`).
 *
 * RolesGuard resolves the membership and role from the X-Organization-Id
 * header, so the route param must be that same organization. Without this
 * check, an OWNER of org A could send A's header and act on org B's `:id`.
 *
 * Must run AFTER RolesGuard: `@UseGuards(RolesGuard, OrgParamGuard)`.
 */
@Injectable()
export class OrgParamGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const paramId: string | undefined = request.params?.id;

    if (!request.orgId) {
      throw new ForbiddenException('Missing X-Organization-Id header');
    }

    if (!paramId || paramId !== request.orgId) {
      throw new ForbiddenException(
        'The organization in the URL does not match X-Organization-Id',
      );
    }

    return true;
  }
}
