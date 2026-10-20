import { Prisma, Role, TransactionStatus } from '@prisma/client';
import { canApprove } from './tx-filters';

/** Lo que mueve un alta: una pierna por cuenta (un par trae dos). */
export interface Leg {
  currency: string;
  amount: number;
}

/**
 * Estado con el que entra un alta.
 *
 * - Propietario y admin: aprobado (lo suyo entra directo).
 * - Contador con autoconfirmar: aprobado si cada pierna esta dentro del tope
 *   de su moneda. Una moneda sin tope espera; sin ningun tope, todo entra.
 * - El resto: pendiente.
 */
export function decideStatus(
  member: { role: Role; autoApprove: boolean; autoApproveLimits: Prisma.JsonValue | null },
  legs: Leg[],
): TransactionStatus {
  if (canApprove(member.role)) return TransactionStatus.APPROVED;
  if (!member.autoApprove) return TransactionStatus.PENDING;

  const limits = (member.autoApproveLimits ?? {}) as Record<string, number>;
  if (Object.keys(limits).length === 0) return TransactionStatus.APPROVED;
  const within = legs.every((l) => typeof limits[l.currency] === 'number' && l.amount <= limits[l.currency]);
  return within ? TransactionStatus.APPROVED : TransactionStatus.PENDING;
}

/** `decideStatus` leyendo la membresia de la base. */
export async function decideStatusFor(
  db: Prisma.TransactionClient,
  orgId: string,
  userId: string,
  legs: Leg[],
): Promise<TransactionStatus> {
  const member = await db.orgMember.findUnique({
    where: { userId_orgId: { userId, orgId } },
    select: { role: true, autoApprove: true, autoApproveLimits: true },
  });
  if (!member) return TransactionStatus.PENDING;
  return decideStatus(member, legs);
}

/** Campos de estado al dar de alta. */
export function statusFields(status: TransactionStatus, userId: string) {
  const now = new Date();
  return status === TransactionStatus.APPROVED
    ? { status, reviewedBy: userId, reviewedAt: now }
    : { status, submittedAt: now };
}
