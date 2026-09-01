import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { TransactionType } from '@prisma/client';
import type { BudgetProgress, BudgetProgressItem, BudgetStatus } from '@ecoghost/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { currentMonth, monthProgress, resolveMonth } from '../../common/date-range.util';
import {
  BudgetProgressQueryDto,
  BudgetQueryDto,
  CreateBudgetDto,
  UpdateBudgetDto,
} from './dto';

const WARN_RATIO = 0.8;

interface CategoryRow {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  parentId: string | null;
}

/** Una regla aplica al mes M si startMonth <= M y (endMonth es null o endMonth >= M). */
function appliesTo(budget: { startMonth: string; endMonth: string | null }, month: string): boolean {
  if (budget.startMonth > month) return false;
  if (budget.endMonth && budget.endMonth < month) return false;
  return true;
}

/** Dos ventanas [aStart, aEnd] y [bStart, bEnd] (fin abierto = null) se solapan. */
function windowsOverlap(
  a: { startMonth: string; endMonth: string | null },
  b: { startMonth: string; endMonth: string | null },
): boolean {
  const aEnd = a.endMonth ?? '9999-12';
  const bEnd = b.endMonth ?? '9999-12';
  return a.startMonth <= bEnd && b.startMonth <= aEnd;
}

@Injectable()
export class BudgetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async categories(orgId: string): Promise<CategoryRow[]> {
    return this.prisma.category.findMany({
      where: { orgId },
      select: { id: true, name: true, icon: true, color: true, parentId: true },
    });
  }

  /** IDs del subarbol de `rootId`, incluido el propio. */
  private descendantIds(categories: CategoryRow[], rootId: string): string[] {
    const childrenOf = new Map<string, string[]>();
    for (const c of categories) {
      if (!c.parentId) continue;
      const list = childrenOf.get(c.parentId) ?? [];
      list.push(c.id);
      childrenOf.set(c.parentId, list);
    }
    const out: string[] = [];
    const stack = [rootId];
    const seen = new Set<string>();
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue; // corta ciclos: el schema no los impide
      seen.add(id);
      out.push(id);
      stack.push(...(childrenOf.get(id) ?? []));
    }
    return out;
  }

  /** Cadena de ancestros de `id`, sin incluirlo. */
  private ancestorIds(categories: CategoryRow[], id: string): string[] {
    const byId = new Map(categories.map((c) => [c.id, c]));
    const out: string[] = [];
    const seen = new Set<string>([id]);
    let cur = byId.get(id)?.parentId ?? null;
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      out.push(cur);
      cur = byId.get(cur)?.parentId ?? null;
    }
    return out;
  }

  /**
   * Rechaza presupuestos que se pisan.
   *
   * Dos motivos, ambos producen doble conteo y dos barras que se contradicen:
   *  1. Un presupuesto en una categoria cubre todo su subarbol, asi que no puede
   *     coexistir con otro en un ancestro o descendiente para la misma moneda y
   *     meses solapados.
   *  2. Un presupuesto total (categoryId = null) cubre TODO.
   *
   * Se valida aqui y no con @@unique porque Postgres trata los NULL como
   * distintos: `@@unique([orgId, categoryId, currency, startMonth])` no
   * impediria dos presupuestos totales con el mismo startMonth, y
   * `UNIQUE NULLS NOT DISTINCT` (PG 15+) no esta expuesto por Prisma.
   */
  private async assertNoOverlap(
    orgId: string,
    dto: { categoryId?: string | null; currency: string; startMonth: string; endMonth?: string | null },
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.prisma.budget.findMany({
      where: {
        orgId,
        currency: dto.currency,
        isActive: true,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, categoryId: true, startMonth: true, endMonth: true },
    });
    if (existing.length === 0) return;

    const window = { startMonth: dto.startMonth, endMonth: dto.endMonth ?? null };
    const targetId = dto.categoryId ?? null;

    let conflictScope: Set<string | null>;
    if (targetId === null) {
      // El total choca con cualquier otro presupuesto de la misma moneda.
      conflictScope = new Set(existing.map((e) => e.categoryId));
      conflictScope.add(null);
    } else {
      const cats = await this.categories(orgId);
      conflictScope = new Set<string | null>([
        null, // un total existente ya cubre esta categoria
        ...this.descendantIds(cats, targetId),
        ...this.ancestorIds(cats, targetId),
      ]);
    }

    const clash = existing.find(
      (e) => conflictScope.has(e.categoryId) && windowsOverlap(e, window),
    );
    if (clash) {
      throw new ConflictException(
        'Ya existe un presupuesto activo que cubre esa categoria y esos meses. ' +
          'Cierra el vigente (endMonth) o edita su tope en lugar de crear otro.',
      );
    }
  }

  // ─── CRUD ─────────────────────────────────────────────────────────

  async findAll(orgId: string, q: BudgetQueryDto) {
    const budgets = await this.prisma.budget.findMany({
      where: {
        orgId,
        ...(q.currency ? { currency: q.currency } : {}),
        ...(q.includeInactive ? {} : { isActive: true }),
      },
      include: {
        category: { select: { id: true, name: true, icon: true, color: true } },
      },
      orderBy: [{ startMonth: 'desc' }, { createdAt: 'desc' }],
    });

    return q.month ? budgets.filter((b) => appliesTo(b, q.month!)) : budgets;
  }

  async create(orgId: string, userId: string, dto: CreateBudgetDto) {
    if (dto.categoryId) {
      const cat = await this.prisma.category.findFirst({
        where: { id: dto.categoryId, orgId },
        select: { id: true },
      });
      if (!cat) throw new NotFoundException('Categoria no encontrada');
    }
    if (dto.endMonth && dto.endMonth < dto.startMonth) {
      throw new ConflictException('endMonth no puede ser anterior a startMonth');
    }

    await this.assertNoOverlap(orgId, dto);

    const budget = await this.prisma.budget.create({
      data: {
        categoryId: dto.categoryId ?? null,
        currency: dto.currency,
        amount: dto.amount,
        startMonth: dto.startMonth,
        endMonth: dto.endMonth ?? null,
        rollover: dto.rollover ?? false,
        notes: dto.notes,
        orgId,
        createdBy: userId,
      },
      include: { category: { select: { id: true, name: true, icon: true, color: true } } },
    });

    await this.audit.log({
      action: 'CREATE',
      entity: 'Budget',
      entityId: budget.id,
      changes: { amount: budget.amount, currency: budget.currency, categoryId: budget.categoryId },
      userId,
      orgId,
    });

    return budget;
  }

  async update(orgId: string, userId: string, id: string, dto: UpdateBudgetDto) {
    const existing = await this.prisma.budget.findFirst({ where: { id, orgId } });
    if (!existing) throw new NotFoundException('Presupuesto no encontrado');

    if (dto.endMonth && dto.endMonth < existing.startMonth) {
      throw new ConflictException('endMonth no puede ser anterior a startMonth');
    }
    // Reabrir o alargar la ventana puede crear un solape que antes no existia.
    if (dto.endMonth !== undefined || dto.isActive === true) {
      await this.assertNoOverlap(
        orgId,
        {
          categoryId: existing.categoryId,
          currency: existing.currency,
          startMonth: existing.startMonth,
          endMonth: dto.endMonth !== undefined ? dto.endMonth : existing.endMonth,
        },
        id,
      );
    }

    const budget = await this.prisma.budget.update({
      where: { id },
      data: {
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        ...(dto.endMonth !== undefined ? { endMonth: dto.endMonth } : {}),
        ...(dto.rollover !== undefined ? { rollover: dto.rollover } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      include: { category: { select: { id: true, name: true, icon: true, color: true } } },
    });

    await this.audit.log({
      action: 'UPDATE',
      entity: 'Budget',
      entityId: id,
      changes: { ...dto },
      userId,
      orgId,
    });

    return budget;
  }

  async remove(orgId: string, userId: string, id: string) {
    const existing = await this.prisma.budget.findFirst({ where: { id, orgId } });
    if (!existing) throw new NotFoundException('Presupuesto no encontrado');

    const budget = await this.prisma.budget.delete({ where: { id } });

    await this.audit.log({
      action: 'DELETE',
      entity: 'Budget',
      entityId: id,
      changes: { amount: existing.amount, currency: existing.currency },
      userId,
      orgId,
    });

    return budget;
  }

  // ─── GET /budgets/progress ────────────────────────────────────────

  /**
   * Avance de cada presupuesto vigente en el mes.
   *
   * 3 consultas: presupuestos, categorias y UN groupBy por categoria sobre el
   * mes. El cruce presupuesto->subarbol se hace en memoria, sobre tablas
   * diminutas (una familia tiene decenas de categorias, no miles).
   */
  async getProgress(orgId: string, q: BudgetProgressQueryDto): Promise<BudgetProgress> {
    const month = q.month ?? currentMonth();
    const range = resolveMonth(month);

    const budgets = (
      await this.prisma.budget.findMany({
        where: { orgId, currency: q.currency, isActive: true },
        include: { category: { select: { id: true, name: true, icon: true, color: true } } },
      })
    ).filter((b) => appliesTo(b, month));

    const empty: BudgetProgress = {
      month,
      currency: q.currency,
      items: [],
      totals: { limit: 0, spent: 0, overCount: 0 },
    };
    if (budgets.length === 0) return empty;

    const accounts = await this.prisma.account.findMany({
      where: { orgId, currency: q.currency },
      select: { id: true },
    });
    const accountIds = accounts.map((a) => a.id);
    if (accountIds.length === 0) {
      // Hay presupuestos pero ninguna cuenta en esa moneda: gasto 0, no error.
      return {
        month,
        currency: q.currency,
        items: budgets.map((b) => this.toProgressItem(b, 0, month)),
        totals: { limit: budgets.reduce((s, b) => s + b.amount, 0), spent: 0, overCount: 0 },
      };
    }

    const [cats, rows] = await Promise.all([
      this.categories(orgId),
      this.prisma.transaction.groupBy({
        by: ['categoryId'],
        where: {
          orgId,
          deletedAt: null,
          accountId: { in: accountIds },
          type: TransactionType.EXPENSE,
          date: { gte: range.from, lt: range.to },
        },
        _sum: { amount: true },
      }),
    ]);

    const spentByCategory = new Map<string | null, number>();
    let totalSpent = 0;
    for (const row of rows) {
      const amount = row._sum.amount ?? 0;
      spentByCategory.set(row.categoryId, amount);
      totalSpent += amount;
    }

    const items = budgets.map((b) => {
      let spent: number;
      if (b.categoryId === null) {
        // Presupuesto total: todo el gasto de la moneda, incluido lo sin categorizar
        spent = totalSpent;
      } else {
        spent = this.descendantIds(cats, b.categoryId).reduce(
          (sum, id) => sum + (spentByCategory.get(id) ?? 0),
          0,
        );
      }
      return this.toProgressItem(b, spent, month);
    });

    items.sort((a, b) => b.ratio - a.ratio);

    return {
      month,
      currency: q.currency,
      items,
      totals: {
        limit: items.reduce((s, i) => s + i.limit, 0),
        spent: items.reduce((s, i) => s + i.spent, 0),
        overCount: items.filter((i) => i.status === 'OVER').length,
      },
    };
  }

  private toProgressItem(
    budget: {
      id: string;
      categoryId: string | null;
      amount: number;
      category: { id: string; name: string; icon: string | null; color: string | null } | null;
    },
    spent: number,
    month: string,
  ): BudgetProgressItem {
    const ratio = budget.amount > 0 ? spent / budget.amount : 0;
    const status: BudgetStatus = ratio > 1 ? 'OVER' : ratio >= WARN_RATIO ? 'WARN' : 'OK';
    const progress = monthProgress(month);

    return {
      budgetId: budget.id,
      categoryId: budget.categoryId,
      categoryName: budget.category?.name ?? 'Todos los gastos',
      icon: budget.category?.icon ?? null,
      color: budget.category?.color ?? null,
      limit: budget.amount,
      spent,
      remaining: budget.amount - spent,
      ratio,
      status,
      // Extrapolacion lineal: solo tiene sentido mientras el mes corre.
      projectedSpend: progress > 0 && progress < 1 ? Math.round(spent / progress) : null,
    };
  }
}
