import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

type Db = Prisma.TransactionClient;

export interface OrgRefs {
  /** Cuentas en las que se anota algo nuevo: deben ser de la org y estar activas. */
  accountIds?: (string | undefined | null)[];
  categoryId?: string | null;
  projectId?: string | null;
  debtId?: string | null;
  tagIds?: string[];
}

/**
 * Comprueba que todo lo que un movimiento referencia es de la organizacion.
 *
 * Sin esto, con el id de una cuenta o categoria de otra organizacion se podia
 * anotar contra ella: el `X-Organization-Id` solo protegia el movimiento, no
 * sus referencias. Devuelve las cuentas para no volver a leerlas.
 */
export async function assertOrgRefs(db: Db, orgId: string, refs: OrgRefs) {
  const accountIds = [...new Set(refs.accountIds?.filter((id): id is string => !!id) ?? [])];
  const tagIds = [...new Set(refs.tagIds ?? [])];

  const [accounts, category, project, debt, tags] = await Promise.all([
    accountIds.length
      ? db.account.findMany({ where: { id: { in: accountIds }, orgId }, select: { id: true, currency: true, isActive: true, name: true } })
      : [],
    refs.categoryId ? db.category.findFirst({ where: { id: refs.categoryId, orgId }, select: { id: true } }) : true,
    refs.projectId ? db.project.findFirst({ where: { id: refs.projectId, orgId }, select: { id: true } }) : true,
    refs.debtId ? db.debt.findFirst({ where: { id: refs.debtId, orgId, deletedAt: null }, select: { id: true } }) : true,
    tagIds.length ? db.tag.count({ where: { id: { in: tagIds }, orgId } }) : 0,
  ]);

  if (accounts.length !== accountIds.length) throw new BadRequestException('Account not found in this organization');
  if (accounts.some((a) => !a.isActive)) throw new BadRequestException('Account is archived');
  if (!category) throw new BadRequestException('Category not found in this organization');
  if (!project) throw new BadRequestException('Project not found in this organization');
  if (!debt) throw new BadRequestException('Debt not found in this organization');
  if (tags !== tagIds.length) throw new BadRequestException('Tag not found in this organization');

  return new Map(accounts.map((a) => [a.id, a]));
}
