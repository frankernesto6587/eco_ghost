import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { monthKey } from './date-range.util';

/**
 * Impide anotar, cambiar o aprobar algo con fecha en un mes cerrado.
 *
 * Cerrar un mes congela sus numeros (tambien los valorados en USD): si se
 * pudiera tocar algo de ese mes, el cierre no valdria nada. Para cambiarlo hay
 * que reabrir el mes (solo el propietario, y queda en el historial).
 */
export async function assertOpenPeriod(db: Prisma.TransactionClient, orgId: string, dates: (Date | null | undefined)[]) {
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { closedThrough: true } });
  const closed = org?.closedThrough;
  if (!closed) return;
  const hit = dates.filter((d): d is Date => !!d).map((d) => monthKey(d)).find((m) => m <= closed);
  if (hit) {
    throw new ConflictException(`El mes ${hit} está cerrado; para cambiar algo de ese mes hay que reabrirlo`);
  }
}
