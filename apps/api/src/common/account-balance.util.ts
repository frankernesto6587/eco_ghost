import { Prisma } from '@prisma/client';

/** Prisma normal o el cliente de una transaccion en curso. */
type Db = {
  transaction: {
    groupBy: (args: any) => Promise<any>;
    aggregate: (args: any) => Promise<any>;
  };
};

/**
 * Saldo de una cuenta, con la misma regla que usa el dashboard.
 *
 * Existia una segunda copia en `debts.service.ts` que solo restaba
 * INCOME/EXPENSE y se olvidaba de traspasos y cambios: en la cuenta Home (MN)
 * anunciaba -3.659.570 cuando el saldo real era 0. Una sola implementacion
 * para que no vuelvan a divergir.
 *
 * `db` acepta el cliente de una transaccion abierta: pasandolo, el saldo ya
 * incluye el movimiento que se acaba de crear. Con `this.prisma` desde dentro
 * de un `$transaction` se lee fuera de ella y el importe nuevo no aparece.
 */
export async function computeAccountBalance(
  db: Db,
  accountId: string,
  orgId: string,
): Promise<number> {
  const baseWhere = { accountId, orgId, deletedAt: null };

  const rows: { type: string; _sum: { amount: number | null } }[] = await db.transaction.groupBy({
    by: ['type'],
    where: { ...baseWhere, type: { in: ['INCOME', 'EXPENSE'] } },
    _sum: { amount: true },
  });

  let balance = 0;
  for (const row of rows) {
    const amount = row._sum.amount ?? 0;
    balance += row.type === 'INCOME' ? amount : -amount;
  }

  // TRANSFER/EXCHANGE: la pierna sin `linkedTransactionId` es la que entra;
  // la que lo tiene es la que sale.
  const [incoming, outgoing] = await Promise.all([
    db.transaction.aggregate({
      where: { ...baseWhere, type: { in: ['TRANSFER', 'EXCHANGE'] }, linkedTransactionId: null },
      _sum: { amount: true },
    }),
    db.transaction.aggregate({
      where: {
        ...baseWhere,
        type: { in: ['TRANSFER', 'EXCHANGE'] },
        linkedTransactionId: { not: null },
      },
      _sum: { amount: true },
    }),
  ]);

  return balance + ((incoming._sum.amount ?? 0) - (outgoing._sum.amount ?? 0));
}

export type { Prisma };
