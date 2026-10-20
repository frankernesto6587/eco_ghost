import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import * as dayjs from 'dayjs';
import { PrismaService } from '../../prisma/prisma.service';
import { APP_TZ, dayKey } from '../../common/date-range.util';

/** Monedas que se guardan, y como las llama elTOQUE. */
const SOURCE_CODES: Record<string, string> = { USD: 'USD', EUR: 'EUR', MLC: 'MLC', USDT_TRC20: 'USDT' };
export const RATE_CURRENCIES = Object.values(SOURCE_CODES);

/** MN por 1 unidad, en micros: "810.5" → 810_500_000n. */
export function rateMicros(value: Prisma.Decimal | string | number): bigint {
  const [int, frac = ''] = String(value).split('.');
  return BigInt(int) * 1_000_000n + BigInt((frac + '000000').slice(0, 6));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Tasas de referencia del mercado informal (elTOQUE), via el servicio de
 * Frank `eltoke.merxbit.com`: un valor por dia, el que elTOQUE publica a las
 * 7:00 hora de Cuba, en MN (CUP) por unidad. Se guardan en `reference_rates`
 * (comun a todas las organizaciones); cada organizacion puede corregir un dia
 * a mano (`rate_overrides`), y esa gana.
 */
@Injectable()
export class RatesService implements OnModuleInit {
  private readonly logger = new Logger(RatesService.name);
  private readonly base = (process.env.RATES_SOURCE_URL ?? 'https://eltoke.merxbit.com').replace(/\/$/, '');
  private syncing = false;

  constructor(private readonly prisma: PrismaService) {}

  /** Al arrancar, en segundo plano: rellenar los dias que falten de las organizaciones que valoran. */
  onModuleInit() {
    if (process.env.RATES_SYNC === 'off') return;
    setTimeout(() => this.syncEnabledOrgs().catch((e) => this.logger.warn(`sync al arrancar: ${e}`)), 5_000);
  }

  /** Cada dia a las 7:30 de Cuba (elTOQUE publica a las 7:00), y otra vez a las 12:00 por si fallo. */
  @Cron('30 7,12 * * *', { timeZone: APP_TZ })
  async daily() {
    if (process.env.RATES_SYNC === 'off') return;
    await this.syncEnabledOrgs();
  }

  /** Rellena desde el primer movimiento de cualquier organizacion con valoracion activada. */
  async syncEnabledOrgs() {
    const first = await this.prisma.transaction.findFirst({
      where: { org: { valuationEnabled: true } },
      orderBy: { date: 'asc' },
      select: { date: true },
    });
    if (first) await this.backfill(dayKey(first.date), dayKey(new Date()));
  }

  /**
   * Baja los dias de [from, to] que aun no estan (sin USD guardado). Uno cada
   * 7 s: elTOQUE limita las consultas por minuto (a uno por segundo empieza a
   * responder 503 tras unos 20). Un historico de meses tarda media hora, en
   * segundo plano y una sola vez.
   */
  async backfill(from: string, to: string): Promise<{ fetched: number; missing: string[] }> {
    if (this.syncing) return { fetched: 0, missing: [] };
    this.syncing = true;
    try {
      const have = new Set(
        (await this.prisma.referenceRate.findMany({ where: { currency: 'USD', day: { gte: from, lte: to } }, select: { day: true } })).map((r) => r.day),
      );
      const missing: string[] = [];
      let fetched = 0;
      for (let d = dayjs(from); !d.isAfter(dayjs(to)); d = d.add(1, 'day')) {
        const day = d.format('YYYY-MM-DD');
        if (have.has(day)) continue;
        const n = await this.fetchDay(day);
        if (n > 0) fetched++;
        else missing.push(day);
        await sleep(7_000);
      }
      if (fetched) this.logger.log(`Tasas: ${fetched} dias nuevos (${from} → ${to})`);
      return { fetched, missing };
    } finally {
      this.syncing = false;
    }
  }

  /** Baja y guarda un dia. Devuelve cuantas monedas guardo (0 si ese dia no hay tasa). */
  async fetchDay(day: string): Promise<number> {
    for (let attempt = 0; attempt < 5; attempt++) {
      let res: Response;
      try {
        res = await fetch(`${this.base}/tasa?fecha=${day}`, { signal: AbortSignal.timeout(20_000) });
      } catch (e) {
        this.logger.warn(`Tasas ${day}: sin respuesta (${e})`);
        await sleep(5_000 * (attempt + 1));
        continue;
      }
      if (res.status === 404) return 0; // ese dia no tiene tasa (o hoy antes de las 7:00)
      if (res.status === 503 || res.status === 502) {
        // elTOQUE limita por minuto o no responde: esperar y reintentar
        await sleep(65_000);
        continue;
      }
      if (!res.ok) {
        this.logger.warn(`Tasas ${day}: HTTP ${res.status}`);
        return 0;
      }
      const body = (await res.json()) as { tasas?: { tasas?: Record<string, number> }[] };
      const values = body.tasas?.[0]?.tasas ?? {};
      let saved = 0;
      for (const [code, currency] of Object.entries(SOURCE_CODES)) {
        const v = values[code];
        if (typeof v !== 'number' || !(v > 0)) continue;
        await this.prisma.referenceRate.upsert({
          where: { day_currency: { day, currency } },
          create: { day, currency, mnPerUnit: new Prisma.Decimal(v), source: 'ELTOQUE' },
          update: { mnPerUnit: new Prisma.Decimal(v), fetchedAt: new Date() },
        });
        saved++;
      }
      return saved;
    }
    this.logger.warn(`Tasas ${day}: no se pudo bajar tras 5 intentos`);
    return 0;
  }

  /** Tasas de un rango: las de elTOQUE y las corregidas por la organizacion. */
  async list(orgId: string, from: string, to: string) {
    const [reference, overrides] = await Promise.all([
      this.prisma.referenceRate.findMany({ where: { day: { gte: from, lte: to } }, orderBy: [{ day: 'asc' }, { currency: 'asc' }] }),
      this.prisma.rateOverride.findMany({ where: { orgId, day: { gte: from, lte: to } }, orderBy: [{ day: 'asc' }, { currency: 'asc' }] }),
    ]);
    const days = new Map<string, { day: string; eltoque: Record<string, number>; manual: Record<string, number> }>();
    const row = (day: string) => days.get(day) ?? days.set(day, { day, eltoque: {}, manual: {} }).get(day)!;
    for (const r of reference) row(r.day).eltoque[r.currency] = Number(r.mnPerUnit);
    for (const r of overrides) row(r.day).manual[r.currency] = Number(r.mnPerUnit);
    return [...days.values()];
  }

  /** Un admin pone (o corrige) la tasa de un dia: {"USD": 810, "MLC": 560}. */
  async setOverride(orgId: string, userId: string, day: string, rates: Record<string, number>) {
    for (const [currency, value] of Object.entries(rates)) {
      await this.prisma.rateOverride.upsert({
        where: { orgId_day_currency: { orgId, day, currency } },
        create: { orgId, day, currency, mnPerUnit: new Prisma.Decimal(value), createdBy: userId },
        update: { mnPerUnit: new Prisma.Decimal(value), createdBy: userId },
      });
    }
    await this.prisma.auditLog.create({
      data: { action: 'SET_RATE', entity: 'RateOverride', entityId: day, changes: rates, userId, orgId },
    });
  }

  async deleteOverride(orgId: string, userId: string, day: string, currency: string) {
    await this.prisma.rateOverride.deleteMany({ where: { orgId, day, currency } });
    await this.prisma.auditLog.create({
      data: { action: 'DELETE_RATE', entity: 'RateOverride', entityId: day, metadata: { currency }, userId, orgId },
    });
  }
}
