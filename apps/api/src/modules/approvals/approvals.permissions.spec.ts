import { Role } from '@prisma/client';
import { ROLES_KEY } from '../../common/decorators';
import { ApprovalsController } from './approvals.controller';
import { DebtsController } from '../debts/debts.controller';

const rolesOf = (ctrl: any, method: string) => Reflect.getMetadata(ROLES_KEY, ctrl.prototype[method]);

describe('ApprovalsController permissions', () => {
  it.each(['approve', 'reject'])('%s is for OWNER and ADMIN only', (method) => {
    expect(rolesOf(ApprovalsController, method)).toEqual([Role.OWNER, Role.ADMIN]);
  });

  it.each(['edit', 'resubmit', 'withdraw'])('%s is for whoever writes (the service checks it is the author)', (method) => {
    expect(rolesOf(ApprovalsController, method)).toEqual([Role.OWNER, Role.ADMIN, Role.ACCOUNTANT]);
  });

  it('borrar una deuda es de propietario o admin', () => {
    expect(rolesOf(DebtsController, 'remove')).toEqual([Role.OWNER, Role.ADMIN]);
  });
});
