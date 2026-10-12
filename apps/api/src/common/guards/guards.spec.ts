import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from './roles.guard';
import { OrgParamGuard } from './org-param.guard';

function ctx(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

function rolesGuard(required: Role[] | undefined, membershipRole: Role | null) {
  const reflector = { getAllAndOverride: () => required } as unknown as Reflector;
  const prisma = {
    orgMember: {
      findUnique: jest.fn().mockResolvedValue(membershipRole ? { role: membershipRole } : null),
    },
  };
  return { guard: new RolesGuard(reflector, prisma as never), prisma };
}

describe('RolesGuard', () => {
  it('resolves the role from X-Organization-Id and lets an allowed role through', async () => {
    const { guard } = rolesGuard([Role.OWNER, Role.ADMIN], Role.ADMIN);
    const req: Record<string, any> = { headers: { 'x-organization-id': 'org-a' }, user: { id: 'u1' } };

    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
    expect(req.orgId).toBe('org-a');
    expect(req.orgRole).toBe(Role.ADMIN);
  });

  it('rejects a role that is not in @Roles', async () => {
    const { guard } = rolesGuard([Role.OWNER, Role.ADMIN], Role.ACCOUNTANT);
    const req = { headers: { 'x-organization-id': 'org-a' }, user: { id: 'u1' } };

    await expect(guard.canActivate(ctx(req))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a user who is not a member of the org in the header', async () => {
    const { guard } = rolesGuard(undefined, null);
    const req = { headers: { 'x-organization-id': 'org-b' }, user: { id: 'u1' } };

    await expect(guard.canActivate(ctx(req))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('fails closed when a @Roles route gets no X-Organization-Id', async () => {
    const { guard, prisma } = rolesGuard([Role.OWNER], Role.OWNER);
    const req = { headers: {}, user: { id: 'u1' } };

    await expect(guard.canActivate(ctx(req))).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.orgMember.findUnique).not.toHaveBeenCalled();
  });
});

describe('OrgParamGuard', () => {
  const guard = new OrgParamGuard();

  it('allows acting on the org selected in the header', () => {
    expect(guard.canActivate(ctx({ orgId: 'org-a', params: { id: 'org-a' } }))).toBe(true);
  });

  it('blocks acting on another org with your own header (IDOR)', () => {
    expect(() => guard.canActivate(ctx({ orgId: 'org-a', params: { id: 'org-b' } }))).toThrow(
      ForbiddenException,
    );
  });

  it('blocks requests without X-Organization-Id', () => {
    expect(() => guard.canActivate(ctx({ params: { id: 'org-a' } }))).toThrow(ForbiddenException);
  });
});
