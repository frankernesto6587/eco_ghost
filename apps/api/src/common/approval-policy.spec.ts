import { Role } from '@prisma/client';
import { decideStatus } from './approval-policy';

const member = (role: Role, autoApprove = false, autoApproveLimits: Record<string, number> | null = null) => ({
  role,
  autoApprove,
  autoApproveLimits,
});
const mn = (amount: number) => ({ currency: 'MN', amount });
const usd = (amount: number) => ({ currency: 'USD', amount });

describe('decideStatus', () => {
  it('propietario y admin entran aprobados siempre', () => {
    expect(decideStatus(member(Role.OWNER), [mn(99_999_999)])).toBe('APPROVED');
    expect(decideStatus(member(Role.ADMIN), [usd(1)])).toBe('APPROVED');
  });

  it('contador sin autoconfirmar espera', () => {
    expect(decideStatus(member(Role.ACCOUNTANT), [mn(100)])).toBe('PENDING');
  });

  it('autoconfirmar sin topes: todo entra', () => {
    expect(decideStatus(member(Role.ACCOUNTANT, true), [mn(99_999_999)])).toBe('APPROVED');
    expect(decideStatus(member(Role.ACCOUNTANT, true, {}), [usd(99_999)])).toBe('APPROVED');
  });

  it('con topes: dentro del tope entra, por encima espera', () => {
    const carlos = member(Role.ACCOUNTANT, true, { USD: 5000, MN: 2_000_000 });
    expect(decideStatus(carlos, [mn(2_000_000)])).toBe('APPROVED');
    expect(decideStatus(carlos, [mn(2_000_001)])).toBe('PENDING');
    expect(decideStatus(carlos, [usd(4999)])).toBe('APPROVED');
  });

  it('una moneda sin tope espera aunque otras lo tengan', () => {
    const carlos = member(Role.ACCOUNTANT, true, { MN: 2_000_000 });
    expect(decideStatus(carlos, [usd(1)])).toBe('PENDING');
  });

  it('en un par, las dos piernas tienen que estar dentro de su tope', () => {
    const carlos = member(Role.ACCOUNTANT, true, { USD: 5000, MN: 2_000_000 });
    expect(decideStatus(carlos, [usd(5000), mn(1_950_000)])).toBe('APPROVED');
    expect(decideStatus(carlos, [usd(5000), mn(2_100_000)])).toBe('PENDING');
  });
});
