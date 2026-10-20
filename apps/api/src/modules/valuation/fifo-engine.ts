/**
 * Valoracion FIFO en la moneda de estadisticas (p. ej. USD).
 *
 * Funcion pura: recibe los movimientos aprobados de una organizacion y las
 * tasas de referencia, y devuelve el valor en USD de cada movimiento, los lotes
 * que quedan y de que lote salio cada gasto. No toca la base de datos.
 *
 * Reglas (decididas con Frank, ver docs/plans/2026-10-20-aprobaciones-y-usd.md):
 * - Una bolsa por moneda distinta de la de estadisticas (MN, MLC, EUR, USDT...).
 * - Cada cambio hacia esa moneda crea un lote con su tasa real. Cualquier otra
 *   entrada (saldo inicial, ventas, prestamos) entra a la tasa de referencia
 *   del dia; si ese dia no hay tasa, queda "falta tasa" (no se inventa).
 * - Los gastos consumen primero el lote mas viejo. Si la bolsa no alcanza, lo
 *   que falta es un deficit: se muestra estimado a la tasa del dia y lo valora
 *   el siguiente lote que entre.
 * - Vender esa moneda por la de estadisticas da "resultado cambiario".
 * - Los traspasos entre cuentas de la misma moneda no tocan la bolsa.
 *
 * Unidades: importes en centavos de su moneda; costes en micros (10^-6) de la
 * moneda de estadisticas, como BigInt, para que el coste se conserve exacto.
 * Las tasas son MN por 1 unidad, tambien en micros (810 MN = 810_000_000n).
 */

export type ValuationStatus = 'EXACT' | 'ESTIMATE' | 'MISSING_RATE';

/** Una entrada: un movimiento suelto o un par (traspaso/cambio) por su pierna que sale. */
export interface EngineEvent {
  id: string;
  /** Pierna que entra, si es un par. */
  incId?: string;
  /** INCOME/EXPENSE, o TRANSFER/EXCHANGE con su destino. */
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'EXCHANGE';
  /** Dia 'YYYY-MM-DD' en hora de Cuba (para buscar la tasa). */
  day: string;
  /** Orden estable: fecha, alta y id. */
  sortKey: [number, number, string];
  currency: string;
  amount: number;
  toCurrency?: string;
  toAmount?: number;
  /** Pierna de un par que perdio su pareja: cuenta como entrada (true) o salida. */
  orphanIncoming?: boolean;
}

/** Tasa de un dia: MN por 1 unidad en micros. `estimated`: es la ultima conocida, no la del dia. */
export type RateFn = (day: string, currency: string) => { mn: bigint; estimated: boolean } | null;

export interface LotOut {
  seq: number;
  currency: string;
  sourceTxId: string;
  day: string;
  origin: 'EXCHANGE' | 'REFERENCE' | 'CARRY';
  qty: number;
  costMicros: bigint | null;
  estimated: boolean;
  remainingQty: number;
  remainingCostMicros: bigint | null;
}

export interface AllocationOut {
  consumerTxId: string;
  currency: string;
  lotSeq: number | null;
  qty: number;
  costMicros: bigint | null;
  kind: 'LOT' | 'DEFICIT' | 'DEFICIT_SETTLED';
}

export interface TxValuation {
  reportAmount: number | null;
  status: ValuationStatus;
  /** Resultado cambiario realizado, en centavos de la moneda de estadisticas. */
  fxResult: number;
}

export interface EngineResult {
  /** Por id de pierna (las dos piernas de un par llevan su valor). */
  tx: Map<string, TxValuation>;
  lots: LotOut[];
  allocations: AllocationOut[];
  /** Deficits sin cubrir al final, por moneda: cantidad y coste estimado. */
  openDeficits: Map<string, { qty: number; estMicros: bigint | null }>;
  /** Dias y monedas que necesitan una tasa que no existe. */
  missingRates: { day: string; currency: string }[];
  /** Saldo segun los movimientos menos lo que hay en la bolsa: debe ser 0. */
  mismatch: Map<string, number>;
}

const MN = 'MN';
const MICROS_PER_CENT = 10_000n;

/** Division entera redondeando a la mitad, con signo. */
export function roundDiv(a: bigint, b: bigint): bigint {
  if (b < 0n) return roundDiv(-a, -b);
  return a >= 0n ? (2n * a + b) / (2n * b) : -((2n * -a + b) / (2n * b));
}

export const microsToCents = (m: bigint) => Number(roundDiv(m, MICROS_PER_CENT));

interface Lot extends LotOut {}

interface Deficit {
  consumerId: string;
  qty: number;
  estMicros: bigint | null;
  estimated: boolean;
  /** Gasto o venta a la moneda de estadisticas: se revalora al cubrirse. */
  terminal: boolean;
}

/** Lo acumulado de un consumidor (un gasto o una venta). */
interface Consumer {
  known: bigint;
  unknown: boolean;
  estimated: boolean;
  deficitQty: number;
  deficitEst: bigint;
  deficitUnknown: boolean;
}

export function valuate(events: EngineEvent[], rate: RateFn, reportCurrency: string): EngineResult {
  const R = reportCurrency;
  const pools = new Map<string, { lots: Lot[]; deficits: Deficit[] }>();
  const pool = (c: string) => {
    let p = pools.get(c);
    if (!p) pools.set(c, (p = { lots: [], deficits: [] }));
    return p;
  };
  const allLots: Lot[] = [];
  const allocations: AllocationOut[] = [];
  const consumers = new Map<string, Consumer>();
  const fx = new Map<string, bigint>();
  const tx = new Map<string, TxValuation>();
  const missing = new Map<string, { day: string; currency: string }>();
  const balance = new Map<string, number>();
  let seq = 0;

  const addBalance = (c: string, d: number) => c !== R && balance.set(c, (balance.get(c) ?? 0) + d);
  const addFx = (id: string, m: bigint) => fx.set(id, (fx.get(id) ?? 0n) + m);

  /** MN por unidad de una moneda en un dia (MN = 1). */
  const mnOf = (day: string, c: string) => (c === MN ? { mn: 1_000_000n, estimated: false } : rate(day, c));

  /** Valor en la moneda de estadisticas de `qty` centavos de `c` a la tasa del dia. */
  const valueAt = (qty: number, c: string, day: string): { micros: bigint; estimated: boolean } | null => {
    if (c === R) return { micros: BigInt(qty) * MICROS_PER_CENT, estimated: false };
    const rc = mnOf(day, c);
    const rr = mnOf(day, R);
    if (!rc || !rr) {
      if (!rc) missing.set(`${day}|${c}`, { day, currency: c });
      if (!rr) missing.set(`${day}|${R}`, { day, currency: R });
      return null;
    }
    return { micros: roundDiv(BigInt(qty) * MICROS_PER_CENT * rc.mn, rr.mn), estimated: rc.estimated || rr.estimated };
  };

  /** Parte proporcional del coste que queda en un lote. */
  const slice = (lot: Lot, take: number): bigint | null => {
    if (lot.remainingCostMicros === null) return null;
    if (take === lot.remainingQty) return lot.remainingCostMicros;
    return roundDiv(lot.remainingCostMicros * BigInt(take), BigInt(lot.remainingQty));
  };

  const consumerOf = (id: string) => {
    let s = consumers.get(id);
    if (!s) consumers.set(id, (s = { known: 0n, unknown: false, estimated: false, deficitQty: 0, deficitEst: 0n, deficitUnknown: false }));
    return s;
  };

  /** Saca `qty` de la bolsa de `c` para un consumidor: lotes mas viejos primero; lo que falte, deficit. */
  const consume = (c: string, qty: number, consumerId: string, day: string, terminal: boolean) => {
    const p = pool(c);
    const s = consumerOf(consumerId);
    let need = qty;
    while (need > 0 && p.lots.length) {
      const lot = p.lots[0];
      const take = Math.min(need, lot.remainingQty);
      const cost = slice(lot, take);
      lot.remainingQty -= take;
      if (cost !== null && lot.remainingCostMicros !== null) lot.remainingCostMicros -= cost;
      allocations.push({ consumerTxId: consumerId, currency: c, lotSeq: lot.seq, qty: take, costMicros: cost, kind: 'LOT' });
      if (cost === null) s.unknown = true;
      else s.known += cost;
      if (lot.estimated) s.estimated = true;
      if (lot.remainingQty === 0) p.lots.shift();
      need -= take;
    }
    if (need > 0) {
      const est = valueAt(need, c, day);
      p.deficits.push({ consumerId, qty: need, estMicros: est?.micros ?? null, estimated: est?.estimated ?? false, terminal });
      allocations.push({ consumerTxId: consumerId, currency: c, lotSeq: null, qty: need, costMicros: est?.micros ?? null, kind: 'DEFICIT' });
      s.deficitQty += need;
      if (est) s.deficitEst += est.micros;
      else s.deficitUnknown = true;
    }
    return s;
  };

  /** Mete un lote: primero cubre deficits pendientes (el siguiente lote valora lo que falto). */
  const addLot = (lot: Omit<Lot, 'seq' | 'remainingQty' | 'remainingCostMicros'>) => {
    const p = pool(lot.currency);
    const l: Lot = { ...lot, seq: ++seq, remainingQty: lot.qty, remainingCostMicros: lot.costMicros };
    allLots.push(l);
    while (p.deficits.length && l.remainingQty > 0) {
      const d = p.deficits[0];
      const take = Math.min(d.qty, l.remainingQty);
      const cost = slice(l, take);
      const estPart = d.estMicros === null ? null : take === d.qty ? d.estMicros : roundDiv(d.estMicros * BigInt(take), BigInt(d.qty));
      allocations.push({ consumerTxId: d.consumerId, currency: l.currency, lotSeq: l.seq, qty: take, costMicros: cost, kind: 'DEFICIT_SETTLED' });
      if (d.terminal) {
        const s = consumerOf(d.consumerId);
        s.deficitQty -= take;
        if (estPart !== null) s.deficitEst -= estPart;
        if (cost === null) s.unknown = true;
        else s.known += cost;
        if (l.estimated) s.estimated = true;
      } else if (estPart !== null && cost !== null) {
        // Un cambio entre dos monedas de bolsa ya paso su coste (estimado) al
        // lote nuevo; la diferencia con el coste real queda como resultado.
        addFx(l.sourceTxId, estPart - cost);
      }
      d.qty -= take;
      if (d.estMicros !== null && estPart !== null) d.estMicros -= estPart;
      if (d.qty === 0) p.deficits.shift();
      l.remainingQty -= take;
      if (cost !== null && l.remainingCostMicros !== null) l.remainingCostMicros -= cost;
    }
    if (l.remainingQty > 0) p.lots.push(l);
  };

  /** Coste acumulado de un consumidor: lo cubierto mas lo estimado de su deficit. */
  const basisOf = (s: Consumer): { micros: bigint | null; status: ValuationStatus } => {
    if (s.unknown || s.deficitUnknown) return { micros: null, status: 'MISSING_RATE' };
    return { micros: s.known + s.deficitEst, status: s.deficitQty > 0 || s.estimated ? 'ESTIMATE' : 'EXACT' };
  };

  // Lo que hay que resolver al final (cuando ya se sabe que deficits se cubrieron).
  const finals: (() => void)[] = [];
  const set = (id: string, v: TxValuation) => tx.set(id, v);
  const exact = (cents: number): TxValuation => ({ reportAmount: cents, status: 'EXACT', fxResult: 0 });

  const ordered = [...events].sort((a, b) =>
    a.sortKey[0] - b.sortKey[0] || a.sortKey[1] - b.sortKey[1] || (a.sortKey[2] < b.sortKey[2] ? -1 : a.sortKey[2] > b.sortKey[2] ? 1 : 0),
  );

  for (const e of ordered) {
    const pair = (e.type === 'TRANSFER' || e.type === 'EXCHANGE') && e.toCurrency !== undefined && e.toAmount !== undefined;

    if (pair) {
      const A = e.currency;
      const B = e.toCurrency!;
      const a = e.amount;
      const b = e.toAmount!;
      addBalance(A, -a);
      addBalance(B, b);
      if (A === B) continue; // traspaso: no toca la bolsa ni tiene valor propio

      if (A === R) {
        // Compra de B con la moneda de estadisticas: lote con la tasa real.
        addLot({ currency: B, sourceTxId: e.id, day: e.day, origin: 'EXCHANGE', qty: b, costMicros: BigInt(a) * MICROS_PER_CENT, estimated: false });
        set(e.id, exact(a));
        if (e.incId) set(e.incId, exact(a));
      } else if (B === R) {
        // Venta de A: consume lotes y da resultado cambiario.
        const s = consume(A, a, e.id, e.day, true);
        finals.push(() => {
          const basis = basisOf(s);
          const received = BigInt(b) * MICROS_PER_CENT;
          set(e.id, {
            reportAmount: basis.micros === null ? null : microsToCents(basis.micros),
            status: basis.status,
            fxResult: basis.micros === null ? 0 : microsToCents(received - basis.micros),
          });
          if (e.incId) set(e.incId, exact(b));
        });
      } else {
        // Entre dos monedas de bolsa: el coste de lo que sale pasa al lote nuevo.
        const s = consume(A, a, e.id, e.day, false);
        const basis = basisOf(s);
        addLot({ currency: B, sourceTxId: e.id, day: e.day, origin: 'CARRY', qty: b, costMicros: basis.micros, estimated: basis.status !== 'EXACT' });
        const v = { reportAmount: basis.micros === null ? null : microsToCents(basis.micros), status: basis.status };
        set(e.id, { ...v, fxResult: 0 });
        if (e.incId) set(e.incId, { ...v, fxResult: 0 });
      }
      continue;
    }

    // Suelto, o pierna huerfana de un par (entra o sale segun `orphanIncoming`).
    const isIn = e.type === 'INCOME' || e.orphanIncoming === true;
    const c = e.currency;
    addBalance(c, isIn ? e.amount : -e.amount);

    if (c === R) {
      set(e.id, exact(e.amount));
      continue;
    }

    if (isIn) {
      // Entrada que no viene de un cambio: lote a la tasa de referencia del dia.
      const v = valueAt(e.amount, c, e.day);
      addLot({ currency: c, sourceTxId: e.id, day: e.day, origin: 'REFERENCE', qty: e.amount, costMicros: v?.micros ?? null, estimated: v?.estimated ?? false });
      set(e.id, v ? { reportAmount: microsToCents(v.micros), status: v.estimated ? 'ESTIMATE' : 'EXACT', fxResult: 0 } : { reportAmount: null, status: 'MISSING_RATE', fxResult: 0 });
    } else {
      const s = consume(c, e.amount, e.id, e.day, true);
      finals.push(() => {
        const basis = basisOf(s);
        set(e.id, { reportAmount: basis.micros === null ? null : microsToCents(basis.micros), status: basis.status, fxResult: 0 });
      });
    }
  }

  for (const f of finals) f();
  // Diferencias de deficits cubiertos tras un cambio entre monedas de bolsa:
  // resultado cambiario de quien trajo el lote que los cubrio.
  for (const [id, m] of fx) {
    const v = tx.get(id);
    if (v) v.fxResult += microsToCents(m);
  }

  const openDeficits = new Map<string, { qty: number; estMicros: bigint | null }>();
  const mismatch = new Map<string, number>();
  for (const [c, p] of pools) {
    const qty = p.deficits.reduce((s, d) => s + d.qty, 0);
    if (qty > 0) {
      const unknown = p.deficits.some((d) => d.estMicros === null);
      openDeficits.set(c, { qty, estMicros: unknown ? null : p.deficits.reduce((s, d) => s + (d.estMicros ?? 0n), 0n) });
    }
    const inPool = p.lots.reduce((s, l) => s + l.remainingQty, 0) - qty;
    const diff = (balance.get(c) ?? 0) - inPool;
    if (diff !== 0) mismatch.set(c, diff);
  }
  for (const [c, b] of balance) if (!pools.has(c) && b !== 0) mismatch.set(c, b);

  return {
    tx,
    lots: allLots.map((l) => ({ ...l })),
    allocations,
    openDeficits,
    missingRates: [...missing.values()].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.currency < b.currency ? -1 : 1)),
    mismatch,
  };
}
