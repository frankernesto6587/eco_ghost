import { Role } from '@prisma/client';
import { ROLES_KEY } from '../../common/decorators';
import { TransactionsController } from './transactions.controller';

const rolesOf = (method: keyof TransactionsController) =>
  Reflect.getMetadata(ROLES_KEY, TransactionsController.prototype[method]);

describe('TransactionsController permissions', () => {
  it.each(['update', 'remove', 'restore', 'bulkDelete'] as const)(
    '%s is allowed to OWNER and ADMIN only',
    (method) => {
      expect(rolesOf(method)).toEqual([Role.OWNER, Role.ADMIN]);
    },
  );

  it.each(['create', 'bulkUpdate'] as const)('%s is allowed to every role that writes', (method) => {
    expect(rolesOf(method)).toEqual([Role.OWNER, Role.ADMIN, Role.ACCOUNTANT]);
  });
});
