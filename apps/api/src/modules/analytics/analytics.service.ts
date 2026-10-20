import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, TransactionType } from '@prisma/client';
import type {
  AnalyticsRecurring,
  AnalyticsSummary,
  AnalyticsTrend,
  CategoryRollupNode,
  TopCategoriesWidget,
} from '@ecoghost/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { COUNTED, countedSql, flowSql, flowWhere } from '../../common/tx-filters';
import { ValuationService } from '../valuation/valuation.service';
import {
  APP_TZ,
  resolveRange,
  resolveTrailingMonths,
  ResolvedRange,
} from '../../common/date-range.util';
import {
  AnalyticsRecurringQueryDto,
  AnalyticsSummaryQueryDto,
  AnalyticsTrendQueryDto,
  TopCategoriesQueryDto,
} from './dto';


interface CategoryRow {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  parentId: string | null;
}

interface Bucket {
  amount: number;
  count: number;
}

const UNCATEGORIZED_KEY = '__none__';

/** Porcentaje de variacion. null cuando la base es 0: no hay porcentaje que calcular. */
function pct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly valuation: ValuationService,
  ) {}

  /**
   * Que se suma y de que cuentas. NATIVE: los importes de las cuentas de una
   * moneda. REPORT: todas las cuentas, a la tasa de mercado de su dia en la
   * moneda de estadisticas (NIC 21; la diferencia con el coste FIFO va aparte,
   * en `fxTotals`); lo que no se pudo valorar (falta una tasa) no suma.
   */
  private async scope(orgId: string, q: { currency: string; accountId?: string[]; basis?: 'NATIVE' | 'REPORT' }) {
    if (q.basis !== 'REPORT') {
      return { accountIds: await this.resolveAccountIds(orgId, q.currency, q.accountId), currency: q.currency, field: 'amount' as const };
    }
    const cfg = await this.valuation.ensureFresh(orgId);
    if (!cfg.valuationEnabled) throw new BadRequestException('La valoracion en la moneda de estadisticas no esta activa');
    const accounts = await this.prisma.account.findMany({
      where: { orgId, ...(q.accountId?.length ? { id: { in: q.accountId } } : {}) },
      select: { id: true },
    });
    return { accountIds: accounts.map((a) => a.id), currency: cfg.reportCurrency, field: 'marketAmount' as const };
  }

  /** Filas de groupBy con `_sum` del campo elegido, como si fuera `amount`. */
  private static asAmount(
    rows: { categoryId: string | null; type: TransactionType; _sum: { amount?: number | null; marketAmount?: number | null }; _count?: { _all: number } }[],
    field: 'amount' | 'marketAmount',
  ) {
    return rows.map((r) => ({ ...r, _sum: { amount: r._sum[field] ?? 0 } }));
  }

  // ─── Resolucion de cuentas por moneda ─────────────────────────────

  /**
   * Cuentas de la org en esa moneda.
   *
   * La moneda no vive en Transaction sino en Account, y Prisma `groupBy` no
   * puede agrupar por un campo de relacion. Resolviendo las cuentas ANTES y
   * filtrando por `accountId` sacamos `accountId` del `by`, lo que elimina el
   * mapeo accountId->moneda en memoria.
   *
   * NO filtra `isActive`: el gasto historico de una cuenta archivada sigue
   * siendo gasto. (`getOverview` si lo filtra y por eso pierde historico.)
   */
  private async resolveAccountIds(
    orgId: string,
    currency: string,
    accountId?: string[],
  ): Promise<string[]> {
    const accounts = await this.prisma.account.findMany({
      where: {
        orgId,
        currency,
        ...(accountId?.length ? { id: { in: accountId } } : {}),
      },
      select: { id: true },
    });
    return accounts.map((a) => a.id);
  }

  /** Flujo (ver `flowWhere`) de esas cuentas en el rango [from, to). */
  private flowWhere(
    orgId: string,
    accountIds: string[],
    from: Date,
    to: Date,
  ): Prisma.TransactionWhereInput {
    return flowWhere({ orgId, accountId: { in: accountIds }, date: { gte: from, lt: to } });
  }

  /**
   * Diferencias de cambio de un rango (solo REPORT): la linea que, sumada a
   * ingresos y gastos a mercado, da el neto al coste real. Cuentan todos los
   * movimientos aprobados que la tengan: gastos, ventas de moneda y los cambios
   * que cubrieron deficits.
   */
  private async fxTotals(orgId: string, accountIds: string[], from: Date, to: Date) {
    const r = await this.prisma.transaction.aggregate({
      where: { orgId, ...COUNTED, accountId: { in: accountIds }, date: { gte: from, lt: to }, fxResult: { not: 0 } },
      _sum: { fxResult: true, fxExchange: true, fxHolding: true },
    });
    return { total: r._sum.fxResult ?? 0, exchange: r._sum.fxExchange ?? 0, holding: r._sum.fxHolding ?? 0 };
  }

  // ─── Rollup del arbol de categorias ───────────────────────────────

  /**
   * Construye el ranking con rollup padre/hijo mediante DFS post-order.
   *
   * `Category` no tiene campo `type` (INCOME/EXPENSE): la distincion es
   * convencional, por el nombre de la raiz. Por eso la clasificacion viene
   * SIEMPRE de `Transaction.type` y una misma categoria puede aparecer en
   * ambos rankings.
   *
   * Invariante: node.amount === node.ownAmount + suma de children[].amount
   */
  private buildRollup(
    categories: CategoryRow[],
    current: Map<string, Bucket>,
    previous: Map<string, number>,
    total: number,
  ): CategoryRollupNode[] {
    const childrenOf = new Map<string | null, CategoryRow[]>();
    const byId = new Map(categories.map((c) => [c.id, c]));

    for (const cat of categories) {
      // Un parentId que apunte fuera de la org se trata como raiz
      const parent = cat.parentId && byId.has(cat.parentId) ? cat.parentId : null;
      const list = childrenOf.get(parent) ?? [];
      list.push(cat);
      childrenOf.set(parent, list);
    }

    const visit = (cat: CategoryRow): CategoryRollupNode => {
      const own = current.get(cat.id) ?? { amount: 0, count: 0 };
      const kids = (childrenOf.get(cat.id) ?? []).map(visit);

      const amount = own.amount + kids.reduce((sum, k) => sum + k.amount, 0);
      const count = own.count + kids.reduce((sum, k) => sum + k.count, 0);
      const previousAmount =
        (previous.get(cat.id) ?? 0) + kids.reduce((sum, k) => sum + k.previousAmount, 0);

      return {
        categoryId: cat.id,
        name: cat.name,
        icon: cat.icon,
        color: cat.color,
        amount,
        ownAmount: own.amount,
        count,
        share: total > 0 ? amount / total : 0,
        previousAmount,
        delta: amount - previousAmount,
        deltaPct: pct(amount, previousAmount),
        children: kids.filter((k) => k.amount > 0).sort((a, b) => b.amount - a.amount),
      };
    };

    const roots = (childrenOf.get(null) ?? [])
      .map(visit)
      .filter((n) => n.amount > 0)
      .sort((a, b) => b.amount - a.amount);

    // Bucket sintetico: siempre al final, sin importar su monto.
    const none = current.get(UNCATEGORIZED_KEY);
    const nonePrev = previous.get(UNCATEGORIZED_KEY) ?? 0;
    if (none && none.amount > 0) {
      roots.push({
        categoryId: null,
        name: 'Sin categorizar',
        icon: null,
        color: null,
        amount: none.amount,
        ownAmount: none.amount,
        count: none.count,
        share: total > 0 ? none.amount / total : 0,
        previousAmount: nonePrev,
        delta: none.amount - nonePrev,
        deltaPct: pct(none.amount, nonePrev),
        children: [],
      });
    }

    return roots;
  }

  private static splitRows(
    rows: { categoryId: string | null; type: TransactionType; _sum: { amount: number | null }; _count?: { _all: number } }[],
  ) {
    const expense = new Map<string, Bucket>();
    const income = new Map<string, Bucket>();
    let expenseTotal = 0;
    let incomeTotal = 0;
    let txCount = 0;

    for (const row of rows) {
      const key = row.categoryId ?? UNCATEGORIZED_KEY;
      const amount = row._sum.amount ?? 0;
      const count = row._count?._all ?? 0;
      txCount += count;

      const target = row.type === TransactionType.EXPENSE ? expense : income;
      const prev = target.get(key) ?? { amount: 0, count: 0 };
      target.set(key, { amount: prev.amount + amount, count: prev.count + count });

      if (row.type === TransactionType.EXPENSE) expenseTotal += amount;
      else incomeTotal += amount;
    }

    return { expense, income, expenseTotal, incomeTotal, txCount };
  }

  private static flatten(map: Map<string, Bucket>): Map<string, number> {
    const out = new Map<string, number>();
    for (const [k, v] of map) out.set(k, v.amount);
    return out;
  }

  private static emptySummary(currency: string, r: ResolvedRange): AnalyticsSummary {
    return {
      currency,
      range: { from: r.fromLabel, to: r.toLabel },
      previousRange: { from: r.prevFromLabel, to: r.prevToLabel },
      totals: {
        income: 0, expense: 0, net: 0,
        previousIncome: 0, previousExpense: 0, previousNet: 0,
        expenseDelta: 0, expenseDeltaPct: null,
        incomeDelta: 0, incomeDeltaPct: null,
        transactionCount: 0,
      },
      expenseByCategory: [],
      incomeByCategory: [],
      dataQuality: {
        uncategorizedExpense: 0,
        uncategorizedExpenseCount: 0,
        uncategorizedExpenseShare: 0,
      },
      topTransactions: [],
    };
  }

  // ─── GET /analytics/summary ───────────────────────────────────────

  async getSummary(orgId: string, q: AnalyticsSummaryQueryDto): Promise<AnalyticsSummary> {
    const r = resolveRange(q.from, q.to);
    const { accountIds, currency, field } = await this.scope(orgId, q);
    if (accountIds.length === 0) return AnalyticsService.emptySummary(currency, r);

    const topLimit = q.topLimit ?? 8;

    // 4 consultas, todas de salida acotada: el groupBy devuelve como mucho
    // (numero de categorias x 2 tipos) filas, no una por transaccion.
    const [curRows, prevRows, categories, topTx] = await Promise.all([
      this.prisma.transaction.groupBy({
        by: ['categoryId', 'type'],
        where: this.flowWhere(orgId, accountIds, r.from, r.to),
        _sum: { [field]: true },
        _count: { _all: true },
      }),
      this.prisma.transaction.groupBy({
        by: ['categoryId', 'type'],
        where: this.flowWhere(orgId, accountIds, r.prevFrom, r.prevTo),
        _sum: { [field]: true },
      }),
      this.prisma.category.findMany({
        where: { orgId },
        select: { id: true, name: true, icon: true, color: true, parentId: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.transaction.findMany({
        where: {
          ...this.flowWhere(orgId, accountIds, r.from, r.to),
          type: TransactionType.EXPENSE,
          ...(field === 'marketAmount' && { marketAmount: { not: null } }),
        },
        orderBy: { [field]: 'desc' },
        take: topLimit,
        select: {
          id: true, date: true, description: true, amount: true, marketAmount: true, type: true,
          category: { select: { id: true, name: true, color: true } },
          account: { select: { id: true, name: true, currency: true } },
        },
      }),
    ]);

    const cur = AnalyticsService.splitRows(AnalyticsService.asAmount(curRows, field));
    const prev = AnalyticsService.splitRows(AnalyticsService.asAmount(prevRows, field));
    const [fx, prevFx] =
      field === 'marketAmount'
        ? await Promise.all([
            this.fxTotals(orgId, accountIds, r.from, r.to),
            this.fxTotals(orgId, accountIds, r.prevFrom, r.prevTo),
          ])
        : [null, null];
    const net = cur.incomeTotal - cur.expenseTotal + (fx?.total ?? 0);
    const previousNet = prev.incomeTotal - prev.expenseTotal + (prevFx?.total ?? 0);

    const expenseByCategory = this.buildRollup(
      categories, cur.expense, AnalyticsService.flatten(prev.expense), cur.expenseTotal,
    );
    const incomeByCategory = this.buildRollup(
      categories, cur.income, AnalyticsService.flatten(prev.income), cur.incomeTotal,
    );

    const uncategorized = cur.expense.get(UNCATEGORIZED_KEY) ?? { amount: 0, count: 0 };

    return {
      currency,
      range: { from: r.fromLabel, to: r.toLabel },
      previousRange: { from: r.prevFromLabel, to: r.prevToLabel },
      totals: {
        income: cur.incomeTotal,
        expense: cur.expenseTotal,
        net,
        previousIncome: prev.incomeTotal,
        previousExpense: prev.expenseTotal,
        previousNet,
        expenseDelta: cur.expenseTotal - prev.expenseTotal,
        expenseDeltaPct: pct(cur.expenseTotal, prev.expenseTotal),
        incomeDelta: cur.incomeTotal - prev.incomeTotal,
        incomeDeltaPct: pct(cur.incomeTotal, prev.incomeTotal),
        transactionCount: cur.txCount,
        ...(fx && { fx: { ...fx, previousTotal: prevFx!.total } }),
      },
      expenseByCategory,
      incomeByCategory,
      dataQuality: {
        uncategorizedExpense: uncategorized.amount,
        uncategorizedExpenseCount: uncategorized.count,
        uncategorizedExpenseShare:
          cur.expenseTotal > 0 ? uncategorized.amount / cur.expenseTotal : 0,
      },
      topTransactions: topTx.map((t) => ({
        id: t.id,
        date: t.date.toISOString(),
        description: t.description,
        amount: field === 'marketAmount' ? t.marketAmount ?? 0 : t.amount,
        type: t.type,
        category: t.category,
        account: t.account,
      })),
    };
  }

  // ─── GET /analytics/top-categories ────────────────────────────────

  /** Version ligera para el widget del dashboard: 3 consultas, sin top movimientos. */
  async getTopCategories(orgId: string, q: TopCategoriesQueryDto): Promise<TopCategoriesWidget> {
    const r = resolveRange(q.from, q.to);
    const limit = q.limit ?? 5;
    const { accountIds, currency, field } = await this.scope(orgId, q);
    const empty: TopCategoriesWidget = {
      currency,
      range: { from: r.fromLabel, to: r.toLabel },
      totalExpense: 0,
      items: [],
      uncategorizedShare: 0,
    };

    if (accountIds.length === 0) return empty;

    const [curRows, prevRows, categories] = await Promise.all([
      this.prisma.transaction.groupBy({
        by: ['categoryId', 'type'],
        where: {
          ...this.flowWhere(orgId, accountIds, r.from, r.to),
          type: TransactionType.EXPENSE,
        },
        _sum: { [field]: true },
        _count: { _all: true },
      }),
      this.prisma.transaction.groupBy({
        by: ['categoryId', 'type'],
        where: {
          ...this.flowWhere(orgId, accountIds, r.prevFrom, r.prevTo),
          type: TransactionType.EXPENSE,
        },
        _sum: { [field]: true },
      }),
      this.prisma.category.findMany({
        where: { orgId },
        select: { id: true, name: true, icon: true, color: true, parentId: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const cur = AnalyticsService.splitRows(AnalyticsService.asAmount(curRows, field));
    const prev = AnalyticsService.splitRows(AnalyticsService.asAmount(prevRows, field));
    const roots = this.buildRollup(
      categories, cur.expense, AnalyticsService.flatten(prev.expense), cur.expenseTotal,
    );

    const uncategorized = cur.expense.get(UNCATEGORIZED_KEY) ?? { amount: 0, count: 0 };

    return {
      currency,
      range: { from: r.fromLabel, to: r.toLabel },
      totalExpense: cur.expenseTotal,
      items: roots.slice(0, limit).map((n) => ({
        categoryId: n.categoryId,
        name: n.name,
        icon: n.icon,
        color: n.color,
        amount: n.amount,
        share: n.share,
        deltaPct: n.deltaPct,
      })),
      uncategorizedShare:
        cur.expenseTotal > 0 ? uncategorized.amount / cur.expenseTotal : 0,
    };
  }

  // ─── GET /analytics/trend ─────────────────────────────────────────

  /**
   * Serie mensual de flujo. Unico agregado que justifica SQL crudo: su version
   * en memoria tendria salida NO acotada (12-36 meses de findMany materializan
   * miles de objetos hidratados para producir como mucho 72 numeros).
   *
   * Cuidado al tocar esta consulta:
   *  - `Prisma.join([])` genera SQL invalido -> hay que cortar antes si no hay cuentas.
   *  - Siempre `Prisma.sql` con interpolacion parametrizada; `$queryRawUnsafe`
   *    con `orgId` seria inyeccion directa.
   *  - `t."date"` es `timestamp without time zone` que guarda UTC: el doble cast
   *    `AT TIME ZONE 'UTC' AT TIME ZONE APP_TZ` lo reinterpreta como instante y
   *    lo baja a hora local antes de truncar el mes.
   *  - `SUM(int)` en Postgres devuelve `bigint` -> Prisma entrega BigInt -> Number().
   *  - El GROUP BY omite los meses sin movimiento: se rellenan en Node.
   */
  async getTrend(orgId: string, q: AnalyticsTrendQueryDto): Promise<AnalyticsTrend> {
    const months = q.months ?? 12;
    const { from, to, monthKeys } = resolveTrailingMonths(months);

    const zero = monthKeys.map((month) => ({ month, income: 0, expense: 0, net: 0 }));
    const { accountIds, currency, field } = await this.scope(orgId, q);
    const col = Prisma.raw(`t."${field}"`);
    if (accountIds.length === 0) {
      return { currency, points: zero, averages: { income: 0, expense: 0, net: 0 } };
    }

    const rows = await this.prisma.$queryRaw<
      { month: string; type: string; total: bigint }[]
    >(Prisma.sql`
      SELECT to_char(
               date_trunc('month', (t."date" AT TIME ZONE 'UTC') AT TIME ZONE ${APP_TZ}),
               'YYYY-MM'
             )                       AS month,
             t."type"::text          AS type,
             COALESCE(SUM(${col}), 0)::bigint AS total
      FROM "transactions" t
      WHERE t."orgId" = ${orgId}
        AND ${flowSql('t')}
        AND t."type" IN ('INCOME', 'EXPENSE')
        AND t."accountId" IN (${Prisma.join(accountIds)})
        AND t."date" >= ${from}
        AND t."date" < ${to}
      GROUP BY 1, 2
      ORDER BY 1
    `);

    // REPORT: la diferencia de cambio de cada mes entra en su neto.
    const fxRows =
      field === 'marketAmount'
        ? await this.prisma.$queryRaw<{ month: string; total: bigint }[]>(Prisma.sql`
            SELECT to_char(
                     date_trunc('month', (t."date" AT TIME ZONE 'UTC') AT TIME ZONE ${APP_TZ}),
                     'YYYY-MM'
                   )                                  AS month,
                   COALESCE(SUM(t."fxResult"), 0)::bigint AS total
            FROM "transactions" t
            WHERE t."orgId" = ${orgId}
              AND ${countedSql('t')}
              AND t."fxResult" <> 0
              AND t."accountId" IN (${Prisma.join(accountIds)})
              AND t."date" >= ${from}
              AND t."date" < ${to}
            GROUP BY 1
          `)
        : [];
    const fxByMonth = new Map(fxRows.map((x) => [x.month, Number(x.total)]));

    const byMonth = new Map(zero.map((p) => [p.month, { ...p }]));
    for (const row of rows) {
      const point = byMonth.get(row.month);
      if (!point) continue;
      const total = Number(row.total);
      if (row.type === 'INCOME') point.income += total;
      else point.expense += total;
    }

    const points = monthKeys.map((m) => {
      const p = byMonth.get(m)!;
      const fx = fxByMonth.get(m) ?? 0;
      return { ...p, net: p.income - p.expense + fx, ...(field === 'marketAmount' && { fx }) };
    });

    const n = points.length || 1;
    const sum = points.reduce(
      (acc, p) => ({ income: acc.income + p.income, expense: acc.expense + p.expense, net: acc.net + p.net }),
      { income: 0, expense: 0, net: 0 },
    );

    return {
      currency,
      points,
      averages: {
        income: Math.round(sum.income / n),
        expense: Math.round(sum.expense / n),
        net: Math.round(sum.net / n),
      },
    };
  }

  // ─── GET /analytics/recurring ─────────────────────────────────────

  /**
   * Gastos que se repiten, agrupados por descripcion normalizada.
   *
   * No hay campo de comercio/contraparte en el modelo, asi que `description`
   * (texto libre, viene de web y de Telegram) es lo unico disponible. La
   * normalizacion va entera en SQL: `unaccent` no es opcion porque requiere
   * CREATE EXTENSION, imposible bajo `prisma db push`; `translate()` cubre los
   * acentos del espanol sin extension.
   *
   * La agrupacion es difusa a proposito ("compra en el agro" y "agro" no
   * colapsan). La senal fiable para decidir que recortar es el delta por
   * categoria de getSummary; esto es refuerzo.
   */
  async getRecurring(orgId: string, q: AnalyticsRecurringQueryDto): Promise<AnalyticsRecurring> {
    const r = resolveRange(q.from, q.to);
    const minCount = q.minCount ?? 3;

    const { accountIds, currency, field } = await this.scope(orgId, q);
    const col = Prisma.raw(`t."${field}"`);
    if (accountIds.length === 0) return { currency, items: [] };

    const rows = await this.prisma.$queryRaw<
      {
        key: string;
        sample: string;
        occurrences: number;
        total: bigint;
        average: number;
        firstDate: Date;
        lastDate: Date;
        categoryId: string | null;
        categoryName: string | null;
      }[]
    >(Prisma.sql`
      WITH norm AS (
        SELECT t."id",
               ${col} AS "amount",
               t."date",
               t."categoryId",
               t."description" AS original,
               regexp_replace(
                 regexp_replace(
                   translate(lower(trim(t."description")), 'áéíóúüñ', 'aeiouun'),
                 '[^a-z ]', ' ', 'g'),
               '\\s+', ' ', 'g') AS key
        FROM "transactions" t
        WHERE t."orgId" = ${orgId}
          AND ${flowSql('t')}
          AND t."type" = 'EXPENSE'
          AND ${col} IS NOT NULL
          AND t."accountId" IN (${Prisma.join(accountIds)})
          AND t."date" >= ${r.from}
          AND t."date" < ${r.to}
      )
      SELECT trim(n.key)                                        AS key,
             (array_agg(n.original ORDER BY n."date" DESC))[1]  AS sample,
             count(*)::int                                      AS occurrences,
             SUM(n."amount")::bigint                            AS total,
             (SUM(n."amount")::float / count(*))                AS average,
             min(n."date")                                      AS "firstDate",
             max(n."date")                                      AS "lastDate",
             (array_agg(n."categoryId" ORDER BY n."date" DESC))[1] AS "categoryId",
             (array_agg(c."name" ORDER BY n."date" DESC))[1]       AS "categoryName"
      FROM norm n
      LEFT JOIN "categories" c ON c."id" = n."categoryId"
      WHERE length(trim(n.key)) >= 3
      GROUP BY trim(n.key)
      HAVING count(*) >= ${minCount}
      ORDER BY SUM(n."amount") DESC
      LIMIT 20
    `);

    return {
      currency,
      items: rows.map((row) => ({
        key: row.key,
        sample: row.sample,
        occurrences: Number(row.occurrences),
        total: Number(row.total),
        average: Math.round(Number(row.average)),
        firstDate: row.firstDate.toISOString(),
        lastDate: row.lastDate.toISOString(),
        categoryId: row.categoryId,
        categoryName: row.categoryName,
      })),
    };
  }
}
