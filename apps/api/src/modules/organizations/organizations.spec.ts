import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Organization, Plan, Role } from '@prisma/client';
import { OrgParamGuard, RolesGuard } from '../../common/guards';
import { OrganizationsController } from './organizations.controller';
import { toPublicOrg } from './organizations.service';

const org: Organization = {
  id: 'org-a',
  name: 'Almacén',
  slug: 'almacen',
  plan: Plan.FREE,
  baseCurrency: 'MN',
  inviteToken: 'secret-invite-token',
  telegramChatId: BigInt('-1001234567890'),
  defaultAccountId: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
} as Organization;

describe('toPublicOrg', () => {
  it('gives the invite token only to the OWNER', () => {
    expect(toPublicOrg(org, Role.OWNER)).toHaveProperty('inviteToken', 'secret-invite-token');
    for (const role of [Role.ADMIN, Role.ACCOUNTANT, Role.VIEWER, null, undefined]) {
      expect(toPublicOrg(org, role)).not.toHaveProperty('inviteToken');
    }
  });

  it('replaces the BigInt telegramChatId with telegramConnected so it serializes', () => {
    const out = toPublicOrg(org, Role.OWNER);
    expect(out).not.toHaveProperty('telegramChatId');
    expect(out.telegramConnected).toBe(true);
    expect(() => JSON.stringify(out)).not.toThrow();
    expect(toPublicOrg({ ...org, telegramChatId: null }, Role.VIEWER).telegramConnected).toBe(false);
  });
});

describe('OrganizationsController guards', () => {
  const routesById = [
    'findOne',
    'update',
    'remove',
    'regenerateToken',
    'disconnectTelegram',
    'getMembers',
    'updateMemberRole',
    'removeMember',
  ] as const;

  it.each(routesById)('%s checks that :id is the org in X-Organization-Id', (method) => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, OrganizationsController.prototype[method]);
    expect(guards).toEqual([RolesGuard, OrgParamGuard]);
  });
});
