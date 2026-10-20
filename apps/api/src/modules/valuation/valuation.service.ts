import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, TransactionType } from '@prisma/client';
import * as dayjs from 'dayjs';
import { PrismaService } from '../../prisma/prisma.service';
import { computeAccountBalances } from '../../common/account-balance.util';
import { currentMonth, dayKey, monthKey, resolveMonth } from '../../common/date-range.util';
import { COUNTED, PENDING_LIVE } from '../../common/tx-filters';
import { EngineEvent, RateFn, microsToCents, roundDiv, valuate } from './fifo-engine';
import { rateMicros } from './rates.service';

const MN = 'MN';
const PAIR: TransactionType[] = ['TRANSFER', 'EXCHANGE'];

/** Lo que el motor deja pendiente, guardado en la organizacion. */
interface Issues {
  missingRates: { day: string; currency: string }[];
  openDeficits: Record<string, { qty: number; estMicros: string | null }>;
  mismatch: Record<string, number>;
}

/**
 * Mantiene la valoracion FIFO de cada organizacion al dia.
 *
 * En vez de avisar desde cada sitio que cambia movimientos, se guarda una
 * huella (cuantos movimientos, ultimo cambio, tasas) y quien lee la compara:
 * si cambio algo, se recalcula entero. Con cientos de movimientos cuesta
 * milisegundos, y asi no hay forma de olvidarse de un camino de escritura.
 */
@Injectable()
export class ValuationService {
  private readonly logger = new Logger(ValuationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Recalcula si cambio algo. Devuelve la configuracion de la organizacion. */
  async ensureFresh(orgId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { reportCurrency: true, valuationEnabled: true, valuationFingerprint: true, closedThrough: true },
    });
    if (!org) throw new NotFoundException('Organization not found');
    if (!org.valuationEnabled) return org;
    const fp = await this.fingerprint(orgId, org.reportCurrency, org.closedThrough);
    if (fp !== org.valuationFingerprint) await this.recompute(orgId, org.reportCurrency, fp);
    return org;
  }

  /** Cambia si cambia cualquier movimiento, tasa o la moneda de estadisticas (y una vez al dia). */
  private async fingerprint(orgId: string, reportCurrency: string, closedThrough: string | null): Promise<string> {
    const [[tx], [rates], [overrides]] = await Promise.all([
      this.prisma.$queryRaw<{ n: bigint; m: Date | null }[]>`SELECT count(*) AS n, max("updatedAt") AS m FROM "transactions" WHERE "orgId" = ${orgId}`,
      this.prisma.$queryRaw<{ n: bigint; m: Date | null }[]>`SELECT count(*) AS n, max("fetchedAt") AS m FROM "reference_rates"`,
      this.prisma.$queryRaw<{ n: bigint; m: Date | null }[]>`SELECT count(*) AS n, max("updatedAt") AS m FROM "rate_overrides" WHERE "orgId" = ${orgId}`,
    ]);
    // El dia de hoy entra porque "hoy" y "ayer" usan la ultima tasa como estimada.
    return [reportCurrency, closedThrough ?? '', tx.n, tx.m?.getTime(), rates.n, rates.m?.getTime(), overrides.n, overrides.m?.getTime(), dayKey(new Date())].join('|');
  }

  /** Recalculo completo de una organizacion, con un bloqueo para que no corran dos a la vez. */
  async recompute(orgId: string, reportCurrency: string, fingerprint?: string) {
    const started = Date.now();
    await this.prisma.$transaction(
      async (db) => {
        await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'fx:' + orgId}))`;
        const current = await db.organization.findUniqueOrThrow({ where: { id: orgId }, select: { valuationFingerprint: true, closedThrough: true } });
        const fp = fingerprint ?? (await this.fingerprint(orgId, reportCurrency, current.closedThrough));
        if (fingerprint && current.valuationFingerprint === fp) return; // otro lo hizo mientras esperabamos

        const events = await this.loadEvents(db, orgId);
        const rate = await this.rateFn(db, orgId);
        const r = valuate(events, rate, reportCurrency, current.closedThrough);

        // Lo que no esta aprobado o se borro deja de tener valor.
        await db.$executeRaw`UPDATE "transactions" SET "reportAmount" = NULL, "valuationStatus" = NULL, "fxResult" = NULL
          WHERE "orgId" = ${orgId} AND ("reportAmount" IS NOT NULL OR "valuationStatus" IS NOT NULL OR "fxResult" IS NOT NULL)`;
        const rows = [...r.tx.entries()];
        for (let i = 0; i < rows.length; i += 500) {
          const chunk = rows.slice(i, i + 500);
          // SQL a mano para no tocar updatedAt (si no, la huella cambiaria sola).
          await db.$executeRaw`UPDATE "transactions" AS t SET
              "reportAmount" = v.ra, "valuationStatus" = v.vs::"ValuationStatus", "fxResult" = v.fx
            FROM (VALUES ${Prisma.join(chunk.map(([id, v]) => Prisma.sql`(${id}, ${v.reportAmount}::int, ${v.status}, ${v.fxResult}::int)`))}) AS v(id, ra, vs, fx)
            WHERE t."id" = v.id`;
        }

        await db.fxAllocation.deleteMany({ where: { orgId } });
        await db.fxLot.deleteMany({ where: { orgId } });
        if (r.lots.length) await db.fxLot.createMany({ data: r.lots.map((l) => ({ ...l, orgId })) });
        if (r.allocations.length) await db.fxAllocation.createMany({ data: r.allocations.map((a) => ({ ...a, orgId })) });

        const issues: Issues = {
          missingRates: r.missingRates,
          openDeficits: Object.fromEntries([...r.openDeficits].map(([c, d]) => [c, { qty: d.qty, estMicros: d.estMicros?.toString() ?? null }])),
          mismatch: Object.fromEntries(r.mismatch),
        };
        if (r.mismatch.size) this.logger.error(`Valoracion ${orgId}: la bolsa no cuadra con los saldos ${JSON.stringify(issues.mismatch)}`);
        await db.organization.update({
          where: { id: orgId },
          data: { valuationFingerprint: fp, valuedAt: new Date(), valuationIssues: issues as unknown as Prisma.InputJsonValue },
        });
      },
      { timeout: 60_000 },
    );
    this.logger.log(`Valoracion ${orgId} recalculada en ${Date.now() - started} ms`);
  }

  /** Movimientos que cuentan, como entradas del motor (un par = una entrada). */
  private async loadEvents(db: Prisma.TransactionClient, orgId: string): Promise<EngineEvent[]> {
    const txs = await db.transaction.findMany({
      where: { orgId, ...COUNTED },
      select: { id: true, type: true, date: true, createdAt: true, amount: true, linkedTransactionId: true, account: { select: { currency: true } } },
    });
    const byId = new Map(txs.map((t) => [t.id, t]));
    const linked = new Set(txs.map((t) => t.linkedTransactionId).filter((x): x is string => !!x));
    const events: EngineEvent[] = [];
    for (const t of txs) {
      const base = {
        id: t.id,
        day: dayKey(t.date),
        sortKey: [t.date.getTime(), t.createdAt.getTime(), t.id] as [number, number, string],
        currency: t.account.currency,
        amount: t.amount,
      };
      if (!PAIR.includes(t.type)) {
        events.push({ ...base, type: t.type as 'INCOME' | 'EXPENSE' });
        continue;
      }
      if (t.linkedTransactionId) {
        const inc = byId.get(t.linkedTransactionId);
        if (inc) events.push({ ...base, type: t.type as 'TRANSFER' | 'EXCHANGE', incId: inc.id, toCurrency: inc.account.currency, toAmount: inc.amount });
        else events.push({ ...base, type: t.type as 'TRANSFER' | 'EXCHANGE', orphanIncoming: false });
      } else if (!linked.has(t.id)) {
        // Pierna que entra sin pareja (datos viejos): cuenta como entrada.
        events.push({ ...base, type: t.type as 'TRANSFER' | 'EXCHANGE', orphanIncoming: true });
      }
    }
    return events;
  }

  /**
   * Tasa de un dia: la corregida a mano, si no la de elTOQUE. Si falta, solo
   * hoy y ayer usan la ultima conocida (marcada como estimada: elTOQUE publica
   * a las 7:00); para dias anteriores queda "falta tasa" y la tiene que poner un admin.
   */
  private async rateFn(db: Prisma.TransactionClient, orgId: string): Promise<RateFn> {
    const [reference, overrides] = await Promise.all([
      db.referenceRate.findMany({ select: { day: true, currency: true, mnPerUnit: true } }),
      db.rateOverride.findMany({ where: { orgId }, select: { day: true, currency: true, mnPerUnit: true } }),
    ]);
    const table = new Map<string, bigint>();
    for (const r of reference) table.set(`${r.day}|${r.currency}`, rateMicros(r.mnPerUnit));
    for (const r of overrides) table.set(`${r.day}|${r.currency}`, rateMicros(r.mnPerUnit));
    const daysByCurrency = new Map<string, string[]>();
    for (const k of table.keys()) {
      const [day, c] = k.split('|');
      (daysByCurrency.get(c) ?? daysByCurrency.set(c, []).get(c)!).push(day);
    }
    for (const list of daysByCurrency.values()) list.sort();
    const yesterday = dayjs(dayKey(new Date())).subtract(1, 'day').format('YYYY-MM-DD');

    return (day, currency) => {
      if (currency === MN) return { mn: 1_000_000n, estimated: false };
      const exact = table.get(`${day}|${currency}`);
      if (exact !== undefined) return { mn: exact, estimated: false };
      if (day < yesterday) return null;
      const days = daysByCurrency.get(currency) ?? [];
      const last = [...days].reverse().find((d) => d < day);
      return last ? { mn: table.get(`${last}|${currency}`)!, estimated: true } : null;
    };
  }

  // ─── Cierre de mes ───────────────────────────────────────────────

  /**
   * Cierra todo hasta `month` ('YYYY-MM', anterior al actual). Exige que en
   * esos meses no quede nada pendiente de aprobar ni sin valorar por falta de
   * tasa: lo que se cierra tiene que estar completo.
   */
  async closeMonth(orgId: string, userId: string, month: string) {
    const cfg = await this.ensureFresh(orgId);
    if (month >= currentMonth()) throw new BadRequestException('Solo se cierran meses ya terminados');
    if (cfg.closedThrough && month <= cfg.closedThrough) return this.closures(orgId);
    const end = resolveMonth(month).to;
    const [pending, missing] = await Promise.all([
      this.prisma.transaction.count({ where: { orgId, ...PENDING_LIVE, date: { lt: end } } }),
      cfg.valuationEnabled
        ? this.prisma.transaction.count({ where: { orgId, ...COUNTED, valuationStatus: 'MISSING_RATE', date: { lt: end } } })
        : 0,
    ]);
    if (pending) throw new ConflictException(`Hay ${pending} movimientos por aprobar hasta ${month}: apruébalos o recházalos antes de cerrar`);
    if (missing) throw new ConflictException(`Hay ${missing} movimientos sin valorar por falta de tasa hasta ${month}: pon esas tasas antes de cerrar`);
    await this.prisma.organization.update({ where: { id: orgId }, data: { closedThrough: month } });
    await this.prisma.auditLog.create({
      data: { action: 'CLOSE_MONTH', entity: 'Organization', entityId: orgId, metadata: { month, previous: cfg.closedThrough }, userId, orgId },
    });
    return this.closures(orgId);
  }

  /** Reabre desde `month` (incluido): solo el propietario, y queda en el historial. */
  async reopenMonth(orgId: string, userId: string, month: string) {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { closedThrough: true } });
    if (!org.closedThrough || month > org.closedThrough) return this.closures(orgId);
    const previous = dayjs(`${month}-01`).subtract(1, 'month').format('YYYY-MM');
    const first = await this.prisma.transaction.findFirst({ where: { orgId }, orderBy: { date: 'asc' }, select: { date: true } });
    const closedThrough = first && previous < monthKey(first.date) ? null : previous;
    await this.prisma.organization.update({ where: { id: orgId }, data: { closedThrough } });
    await this.prisma.auditLog.create({
      data: { action: 'REOPEN_MONTH', entity: 'Organization', entityId: orgId, metadata: { month, previous: org.closedThrough }, userId, orgId },
    });
    return this.closures(orgId);
  }

  async closures(orgId: string) {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { closedThrough: true } });
    return { closedThrough: org.closedThrough };
  }

  // ─── Lectura ─────────────────────────────────────────────────────

  async status(orgId: string) {
    const cfg = await this.ensureFresh(orgId);
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { reportCurrency: true, valuationEnabled: true, valuedAt: true, valuationIssues: true, closedThrough: true },
    });
    const issues = (org.valuationIssues ?? { missingRates: [], openDeficits: {}, mismatch: {} }) as unknown as Issues;
    const [estimates, missing] = cfg.valuationEnabled
      ? await Promise.all([
          this.prisma.transaction.count({ where: { orgId, ...COUNTED, valuationStatus: 'ESTIMATE' } }),
          this.prisma.transaction.count({ where: { orgId, ...COUNTED, valuationStatus: 'MISSING_RATE' } }),
        ])
      : [0, 0];
    return {
      enabled: org.valuationEnabled,
      reportCurrency: org.reportCurrency,
      closedThrough: org.closedThrough,
      valuedAt: org.valuedAt,
      missingRates: issues.missingRates,
      openDeficits: issues.openDeficits,
      mismatch: issues.mismatch,
      counts: { estimates, missingRate: missing },
    };
  }

  /**
   * Patrimonio en la moneda de estadisticas: lo de esa moneda tal cual, y cada
   * otra moneda a lo que costo (los lotes que quedan, que son los cambios mas
   * nuevos) y a la tasa de hoy. La diferencia es la devaluacion.
   */
  async patrimony(orgId: string) {
    const cfg = await this.ensureFresh(orgId);
    const R = cfg.reportCurrency;
    const [accounts, balances, lots, org, rate] = await Promise.all([
      this.prisma.account.findMany({ where: { orgId }, select: { id: true, currency: true } }),
      computeAccountBalances(this.prisma, orgId),
      this.prisma.fxLot.findMany({ where: { orgId, remainingQty: { gt: 0 } } }),
      this.prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { valuationIssues: true } }),
      this.rateFn(this.prisma, orgId),
    ]);
    const issues = (org.valuationIssues ?? { openDeficits: {} }) as unknown as Issues;
    const byCurrency = new Map<string, number>();
    for (const a of accounts) byCurrency.set(a.currency, (byCurrency.get(a.currency) ?? 0) + (balances.get(a.id) ?? 0));

    const today = dayKey(new Date());
    const mnR = rate(today, R)?.mn ?? null;
    const rows = [...byCurrency.entries()].filter(([, q]) => q !== 0).map(([currency, qty]) => {
      if (currency === R) return { currency, qty, atCost: qty, atToday: qty, todayRate: null as number | null, estimated: false };
      const own = lots.filter((l) => l.currency === currency);
      const unknown = own.some((l) => l.remainingCostMicros === null);
      const deficit = issues.openDeficits?.[currency];
      const costMicros = own.reduce((s, l) => s + (l.remainingCostMicros ?? 0n), 0n) - BigInt(deficit?.estMicros ?? 0);
      const rc = rate(today, currency);
      const atToday = rc && mnR ? microsToCents(roundDiv(BigInt(qty) * 10_000n * rc.mn, mnR)) : null;
      return {
        currency,
        qty,
        atCost: unknown || (deficit && deficit.estMicros === null) ? null : microsToCents(costMicros),
        atToday,
        todayRate: rc ? Number(rc.mn) / 1e6 : null,
        estimated: !!deficit || own.some((l) => l.estimated) || !!rc?.estimated,
      };
    });
    const sum = (k: 'atCost' | 'atToday') => (rows.some((r) => r[k] === null) ? null : rows.reduce((s, r) => s + (r[k] as number), 0));
    const atCost = sum('atCost');
    const atToday = sum('atToday');
    return {
      reportCurrency: R,
      currencies: rows,
      totals: { atCost, atToday, unrealized: atCost !== null && atToday !== null ? atToday - atCost : null },
    };
  }

  /** De que lotes salio el valor de un movimiento (para explicar una cifra). */
  async breakdown(orgId: string, txId: string) {
    await this.ensureFresh(orgId);
    const tx = await this.prisma.transaction.findFirst({ where: { id: txId, orgId }, select: { id: true, linkedTransactionId: true, reportAmount: true, valuationStatus: true, fxResult: true } });
    if (!tx) throw new NotFoundException('Transaction not found');
    // Las asignaciones van a la pierna que sale; si piden la que entra, buscar la otra.
    const head = tx.linkedTransactionId ? tx.id : (await this.prisma.transaction.findFirst({ where: { linkedTransactionId: tx.id }, select: { id: true } }))?.id ?? tx.id;
    const allocations = await this.prisma.fxAllocation.findMany({ where: { orgId, consumerTxId: head } });
    const lots = await this.prisma.fxLot.findMany({ where: { orgId, seq: { in: allocations.map((a) => a.lotSeq).filter((x): x is number => x !== null) } } });
    const sources = await this.prisma.transaction.findMany({
      where: { id: { in: lots.map((l) => l.sourceTxId) } },
      select: { id: true, description: true, date: true },
    });
    return {
      id: tx.id,
      reportAmount: tx.reportAmount,
      status: tx.valuationStatus,
      fxResult: tx.fxResult,
      parts: allocations.map((a) => {
        const lot = lots.find((l) => l.seq === a.lotSeq);
        const src = lot && sources.find((s) => s.id === lot.sourceTxId);
        return {
          kind: a.kind,
          currency: a.currency,
          qty: a.qty,
          cost: a.costMicros === null ? null : microsToCents(a.costMicros),
          lot: lot ? { origin: lot.origin, day: lot.day, description: src?.description ?? null, rate: lot.costMicros ? Number(BigInt(lot.qty) * 10_000n * 1_000_000n / lot.costMicros) / 1e6 : null } : null,
        };
      }),
    };
  }
}
