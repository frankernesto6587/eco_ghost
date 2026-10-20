import { Prisma, TransactionStatus } from '@prisma/client';
import { COUNTED } from './tx-filters';

/** Prisma normal o el cliente de una transaccion en curso. */
type Db = {
  transaction: {
    groupBy: (args: any) => Promise<any>;
  };
};

interface BalanceOptions {
  /** Limitar a estas cuentas. Sin ella, todas las de la organizacion. */
  accountIds?: string[];
  /** Condiciones extra (p. ej. `date: { lt: inicio }` para el saldo a una fecha). */
  extraWhere?: Prisma.TransactionWhereInput;
  /**
   * Sumar movimientos en estos estados en vez de lo que cuenta (aprobado).
   * Con `[PENDING]` da lo que movera cada cuenta cuando se apruebe lo pendiente.
   */
  statuses?: TransactionStatus[];
}

/**
 * Saldo por cuenta: INCOME suma, EXPENSE resta y en TRANSFER/EXCHANGE la pierna
 * sin `linkedTransactionId` es la que entra y la que lo tiene, la que sale.
 *
 * Habia cuatro copias de este calculo (cuentas, panel, bot y deudas) y una de
 * ellas se olvidaba de traspasos y cambios: en la cuenta Home (MN) anunciaba
 * -3.659.570 cuando el saldo real era 0. Una sola implementacion para que no
 * vuelvan a divergir.
 *
 * `db` acepta el cliente de una transaccion abierta: pasandolo, el saldo ya
 * incluye el movimiento que se acaba de crear. Con `this.prisma` desde dentro
 * de un `$transaction` se lee fuera de ella y el importe nuevo no aparece.
 */
export async function computeAccountBalances(
  db: Db,
  orgId: string,
  { accountIds, extraWhere = {}, statuses }: BalanceOptions = {},
): Promise<Map<string, number>> {
  const counted = statuses ? { deletedAt: null, status: { in: statuses } } : COUNTED;
  const base = { orgId, ...counted, ...(accountIds && { accountId: { in: accountIds } }) };
  const where = (w: Prisma.TransactionWhereInput) => ({ AND: [base, extraWhere, w] });
  type Row = { accountId: string; type?: string; _sum: { amount: number | null } };

  const [flows, incoming, outgoing]: Row[][] = await Promise.all([
    db.transaction.groupBy({
      by: ['accountId', 'type'],
      where: where({ type: { in: ['INCOME', 'EXPENSE'] } }),
      _sum: { amount: true },
    }),
    db.transaction.groupBy({
      by: ['accountId'],
      where: where({ type: { in: ['TRANSFER', 'EXCHANGE'] }, linkedTransactionId: null }),
      _sum: { amount: true },
    }),
    db.transaction.groupBy({
      by: ['accountId'],
      where: where({ type: { in: ['TRANSFER', 'EXCHANGE'] }, linkedTransactionId: { not: null } }),
      _sum: { amount: true },
    }),
  ]);

  const map = new Map<string, number>();
  const add = (rows: Row[], sign: (r: Row) => number) => {
    for (const r of rows) map.set(r.accountId, (map.get(r.accountId) ?? 0) + sign(r) * (r._sum.amount ?? 0));
  };
  add(flows, (r) => (r.type === 'INCOME' ? 1 : -1));
  add(incoming, () => 1);
  add(outgoing, () => -1);
  return map;
}

/** Saldo de una sola cuenta. */
export async function computeAccountBalance(db: Db, accountId: string, orgId: string): Promise<number> {
  const map = await computeAccountBalances(db, orgId, { accountIds: [accountId] });
  return map.get(accountId) ?? 0;
}
