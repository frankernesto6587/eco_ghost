import { BadRequestException } from '@nestjs/common';
import { Prisma, TransactionType } from '@prisma/client';
import { categoryFits } from '@ecoghost/shared';

type Db = Prisma.TransactionClient;

const KIND_LABEL = { EXPENSE: 'gasto', INCOME: 'ingreso' } as const;

/**
 * Una categoria solo vale para los movimientos de su tipo: "Salario" no puede
 * ir en un gasto. Transferencias y cambios no llevan categoria.
 */
export async function assertCategoryFits(db: Db, orgId: string, categoryId: string | null | undefined, type: TransactionType) {
  if (!categoryId) return;
  if (type !== 'INCOME' && type !== 'EXPENSE') {
    throw new BadRequestException('Las transferencias y los cambios no llevan categoría');
  }
  const category = await db.category.findFirst({ where: { id: categoryId, orgId }, select: { name: true, kind: true } });
  if (!category) throw new BadRequestException('Category not found in this organization');
  if (!categoryFits(category.kind, type)) {
    throw new BadRequestException(
      `"${category.name}" es una categoría de ${KIND_LABEL[category.kind as 'EXPENSE' | 'INCOME']}; elige una de ${KIND_LABEL[type]}`,
    );
  }
}
