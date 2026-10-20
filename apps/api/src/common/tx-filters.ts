import { Prisma, Role, TransactionStatus, TransactionType } from '@prisma/client';

/**
 * Que movimientos cuentan para saldos, estadisticas y presupuestos: los no
 * borrados y aprobados. Lo pendiente o rechazado no mueve ningun numero.
 *
 * Una sola definicion para todo el backend: antes cada servicio escribia su
 * propio `deletedAt: null` y el resumen de movimientos y el `/resumen` del bot
 * contaban cosas distintas que el panel. `tx-filters.guard.spec.ts` falla si
 * aparece otro filtro suelto.
 */
export const COUNTED = { deletedAt: null, status: TransactionStatus.APPROVED } satisfies Prisma.TransactionWhereInput;

/** Pendientes de aprobar (no borrados). */
export const PENDING_LIVE = { deletedAt: null, status: TransactionStatus.PENDING } satisfies Prisma.TransactionWhereInput;

/**
 * Una fila por entrada: un traspaso o cambio se cuenta por la pierna que sale
 * (la que tiene `linkedTransactionId`), no dos veces.
 */
export const ENTRY_HEAD = {
  OR: [{ type: { in: [TransactionType.INCOME, TransactionType.EXPENSE] } }, { linkedTransactionId: { not: null } }],
} satisfies Prisma.TransactionWhereInput;

/** Quien mira una lista: de su rol depende que pendientes y rechazados ve. */
export interface Actor {
  userId: string;
  role: Role;
}

export const canApprove = (role: Role) => role === Role.OWNER || role === Role.ADMIN;

/**
 * Que movimientos (por estado) puede ver alguien.
 *
 * - Propietario y admin: todo.
 * - Contador: lo aprobado y lo suyo pendiente o rechazado.
 * - Visualizador: solo lo aprobado.
 *
 * `statuses` es lo que se pide; por defecto aprobado y pendiente (lo rechazado
 * solo se ve si se pide).
 */
export function visibleWhere(
  actor: Actor,
  statuses: TransactionStatus[] = [TransactionStatus.APPROVED, TransactionStatus.PENDING],
): Prisma.TransactionWhereInput {
  if (actor.role === Role.VIEWER) {
    return { status: statuses.includes(TransactionStatus.APPROVED) ? TransactionStatus.APPROVED : { in: [] } };
  }
  if (canApprove(actor.role)) return { status: { in: statuses } };
  const others = statuses.filter((s) => s !== TransactionStatus.APPROVED);
  return {
    OR: [
      ...(statuses.includes(TransactionStatus.APPROVED) ? [{ status: TransactionStatus.APPROVED }] : []),
      ...(others.length ? [{ status: { in: others }, createdBy: actor.userId }] : []),
    ],
  };
}

/** Solo INCOME/EXPENSE son flujo. TRANSFER/EXCHANGE mueven dinero entre cuentas propias. */
export const FLOW_TYPES: TransactionType[] = [TransactionType.INCOME, TransactionType.EXPENSE];

/**
 * De lo pendiente, que le toca ver a alguien: quien aprueba, todo; el contador,
 * lo suyo; el visualizador, nada (null).
 */
export function pendingScope(actor: Actor): Prisma.TransactionWhereInput | null {
  if (canApprove(actor.role)) return {};
  if (actor.role === Role.VIEWER) return null;
  return { createdBy: actor.userId };
}

/**
 * Flujo real de ingresos y gastos.
 *
 * - Sin deudas: prestar no es gastar y que te devuelvan no es ingresar.
 * - Sin categorias de ajuste (saldos iniciales, correcciones): mueven saldo
 *   pero no son consumo ni renta. Va como OR explicito y no con `notIn`: en
 *   SQL, `categoryId NOT IN (...)` descarta tambien las filas sin categoria.
 *
 * Todo va dentro de un AND para que el `where` de quien llama (que puede traer
 * su propio OR) no pise estas condiciones al combinarse.
 */
export function flowWhere(extra: Prisma.TransactionWhereInput = {}): Prisma.TransactionWhereInput {
  return {
    AND: [
      COUNTED,
      { debtId: null, type: { in: FLOW_TYPES } },
      { OR: [{ categoryId: null }, { category: { isAdjustment: false } }] },
      extra,
    ],
  };
}

/** `COUNTED` para SQL a mano. `alias` es el alias de la tabla `transactions`. */
export function countedSql(alias = 't'): Prisma.Sql {
  const t = Prisma.raw(alias);
  return Prisma.sql`${t}."deletedAt" IS NULL AND ${t}."status" = 'APPROVED'`;
}

/** `flowWhere` para SQL a mano (sin el filtro de tipo, que cada consulta pone). */
export function flowSql(alias = 't'): Prisma.Sql {
  const t = Prisma.raw(alias);
  return Prisma.sql`${countedSql(alias)}
    AND ${t}."debtId" IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM "categories" cc
      WHERE cc."id" = ${t}."categoryId" AND cc."isAdjustment"
    )`;
}
