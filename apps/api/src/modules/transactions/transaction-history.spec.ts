import { describeChanges, referencedIds, snapsOf } from './transaction-history';

const names = {
  accounts: new Map([
    ['mn', { name: 'Efectivo MN', currency: 'MN' }],
    ['bandec', { name: 'BANDEC', currency: 'MN' }],
    ['usd', { name: 'Efectivo USD', currency: 'USD' }],
  ]),
  categories: new Map([
    ['mercado', 'Mercado'],
    ['agro', 'Agro'],
  ]),
};

const snap = (over: Record<string, unknown> = {}) => ({
  date: '2026-10-21T16:00:00.000Z',
  description: 'agro',
  amount: 640000,
  type: 'EXPENSE',
  accountId: 'mn',
  categoryId: 'mercado',
  projectId: null,
  debtId: null,
  notes: null,
  ...over,
});

describe('historial de un movimiento', () => {
  it('solo salen los campos que cambiaron, con nombres y la moneda del importe', () => {
    const changes = describeChanges(snap(), snap({ amount: 650000, accountId: 'bandec', categoryId: 'agro' }), names);
    expect(changes).toEqual([
      { field: 'amount', before: 640000, after: 650000, currency: 'MN' },
      { field: 'account', before: 'Efectivo MN', after: 'BANDEC' },
      { field: 'category', before: 'Mercado', after: 'Agro' },
    ]);
  });

  it('sin cambios no sale nada; quitar la categoria sale como vacia', () => {
    expect(describeChanges(snap(), snap(), names)).toEqual([]);
    expect(describeChanges(snap(), snap({ categoryId: null }), names)).toEqual([{ field: 'category', before: 'Mercado', after: null }]);
  });

  it('en un cambio de moneda sale tambien lo que entra', () => {
    const before = snap({ type: 'EXCHANGE', accountId: 'usd', categoryId: null, amount: 10000, toAccountId: 'mn', toAmount: 3800000 });
    const after = { ...before, amount: 20000, toAmount: 7000000, date: '2026-10-04T16:00:00.000Z' };
    expect(describeChanges(before, after, names)).toEqual([
      { field: 'date', before: '2026-10-21T16:00:00.000Z', after: '2026-10-04T16:00:00.000Z' },
      { field: 'amount', before: 10000, after: 20000, currency: 'USD' },
      { field: 'toAmount', before: 3800000, after: 7000000, currency: 'MN' },
    ]);
  });

  it('un cambio en lote solo guarda lo nuevo', () => {
    const { before, after } = snapsOf('BULK_UPDATE', { categoryId: 'agro' });
    expect(describeChanges(before, after, names)).toEqual([{ field: 'category', before: null, after: 'Agro' }]);
    expect(snapsOf('APPROVE', undefined)).toEqual({});
  });

  it('reune los ids para traer sus nombres', () => {
    expect(referencedIds([snap(), snap({ accountId: 'usd', toAccountId: 'mn', categoryId: 'agro' }), undefined])).toEqual({
      accounts: ['mn', 'usd'],
      categories: ['mercado', 'agro'],
    });
  });
});
