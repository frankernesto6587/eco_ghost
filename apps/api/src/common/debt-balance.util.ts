import { DebtStatus, DebtType, Prisma, TransactionType } from '@prisma/client';
import { COUNTED } from './tx-filters';

/** El movimiento que abre la deuda y el de sus pagos van en sentidos opuestos. */
export const debtInitialType = (t: DebtType): TransactionType => (t === 'RECEIVABLE' ? 'EXPENSE' : 'INCOME');
export const debtPaymentType = (t: DebtType): TransactionType => (t === 'RECEIVABLE' ? 'INCOME' : 'EXPENSE');

/**
 * Recalcula total, pagado y estado de una deuda a partir de sus movimientos.
 *
 * Antes `paidAmount` era un contador que solo subia al registrar un pago:
 * borrar o editar ese pago no lo corregia y la deuda quedaba "pagada" con el
 * dinero de vuelta en la cuenta. Ahora se deriva siempre de lo que cuenta.
 */
export async function recomputeDebt(db: Prisma.TransactionClient, debtId: string) {
  const debt = await db.debt.findUnique({ where: { id: debtId } });
  if (!debt) return;

  const sums = await db.transaction.groupBy({
    by: ['type'],
    where: { debtId, ...COUNTED },
    _sum: { amount: true },
  });
  const sum = (t: TransactionType) => sums.find((s) => s.type === t)?._sum.amount ?? 0;

  // Si se edito el importe del movimiento inicial, el total de la deuda lo sigue.
  const total = sum(debtInitialType(debt.type)) || debt.totalAmount;
  const paid = sum(debtPaymentType(debt.type));
  const status: DebtStatus = paid >= total ? 'PAID' : paid > 0 ? 'PARTIAL' : 'PENDING';

  if (total !== debt.totalAmount || paid !== debt.paidAmount || status !== debt.status) {
    await db.debt.update({ where: { id: debtId }, data: { totalAmount: total, paidAmount: paid, status } });
  }
}
