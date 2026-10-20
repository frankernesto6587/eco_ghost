import { Prisma, TransactionType } from '@prisma/client';

/**
 * Que movimientos cuentan para saldos, estadisticas y presupuestos.
 *
 * Una sola definicion para todo el backend: antes cada servicio escribia su
 * propio `deletedAt: null` y el resumen de movimientos y el `/resumen` del bot
 * contaban cosas distintas que el panel. Cuando llegue la aprobacion de
 * movimientos, el estado "aprobado" se anade aqui y en `countedSql`.
 */
export const COUNTED = { deletedAt: null } satisfies Prisma.TransactionWhereInput;

/** Solo INCOME/EXPENSE son flujo. TRANSFER/EXCHANGE mueven dinero entre cuentas propias. */
export const FLOW_TYPES: TransactionType[] = [TransactionType.INCOME, TransactionType.EXPENSE];

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
  return Prisma.sql`${Prisma.raw(alias)}."deletedAt" IS NULL`;
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
