import { EngineEvent, RateFn, microsToCents, valuate } from './fifo-engine';

// Importes en centavos. Tasas en MN por unidad.
const usd = (x: number) => Math.round(x * 100);
const mn = (x: number) => Math.round(x * 100);
const M = (rate: number) => BigInt(Math.round(rate * 1_000_000));

let n = 0;
const at = (day: string) => [Date.parse(`${day}T12:00:00Z`), n++, `t${String(n).padStart(3, '0')}`] as [number, number, string];

const exchange = (day: string, from: string, a: number, to: string, b: number): EngineEvent => {
  const k = at(day);
  return { id: k[2], incId: `${k[2]}-in`, type: 'EXCHANGE', day, sortKey: k, currency: from, amount: a, toCurrency: to, toAmount: b };
};
const expense = (day: string, cur: string, amount: number): EngineEvent => {
  const k = at(day);
  return { id: k[2], type: 'EXPENSE', day, sortKey: k, currency: cur, amount };
};
const income = (day: string, cur: string, amount: number): EngineEvent => {
  const k = at(day);
  return { id: k[2], type: 'INCOME', day, sortKey: k, currency: cur, amount };
};
const transfer = (day: string, cur: string, amount: number): EngineEvent => {
  const k = at(day);
  return { id: k[2], incId: `${k[2]}-in`, type: 'TRANSFER', day, sortKey: k, currency: cur, amount, toCurrency: cur, toAmount: amount };
};

/** Tasas de referencia por dia y moneda (MN por unidad). */
const rates = (table: Record<string, Record<string, number>>): RateFn => (day, c) => {
  const r = table[day]?.[c];
  return r === undefined ? null : { mn: M(r), estimated: false };
};
const noRates: RateFn = () => null;
/** La misma tasa todos los dias, para todas las monedas. */
const flat = (r: number): RateFn => () => ({ mn: M(r), estimated: false });
/** Como `rates`, y con `lenient` la ultima anterior (lo que hace el servicio). */
const ratesLenient = (table: Record<string, Record<string, number>>): RateFn => (day, c, lenient) => {
  const exact = table[day]?.[c];
  if (exact !== undefined) return { mn: M(exact), estimated: false };
  if (!lenient) return null;
  const prev = Object.keys(table).filter((d) => d < day && table[d][c] !== undefined).sort().pop();
  return prev ? { mn: M(table[prev][c]), estimated: true } : null;
};
const v = (reportAmount: number | null, marketAmount: number | null, status: string, fxExchange = 0, fxHolding = 0) => ({
  reportAmount, marketAmount, status, fxResult: fxExchange + fxHolding, fxExchange, fxHolding,
});

const remainingCost = (r: ReturnType<typeof valuate>, cur: string) =>
  microsToCents(r.lots.filter((l) => l.currency === cur).reduce((s, l) => s + (l.remainingCostMicros ?? 0n), 0n));

describe('FIFO por cambios', () => {
  // El ejemplo que se le mostro a Frank
  const lot1 = exchange('2026-10-01', 'USD', usd(1000), 'MN', mn(600_000));
  const g1 = expense('2026-10-05', 'MN', mn(200_000));
  const lot2 = exchange('2026-10-15', 'USD', usd(500), 'MN', mn(330_000));
  const g2 = expense('2026-10-20', 'MN', mn(500_000));

  it('gastos valorados a la tasa de los cambios, el mas viejo primero', () => {
    const r = valuate([lot1, g1, lot2, g2], flat(600), 'USD');
    expect(r.tx.get(g1.id)).toEqual(v(33333, 33333, 'EXACT'));
    // Con el mercado a 600, el cambio a 660 salio 15,15 mejor: a mercado 833,33, costo 818,18.
    expect(r.tx.get(g2.id)).toEqual(v(81818, 83333, 'EXACT', 1515, 0));
    expect(r.tx.get(lot1.id)?.reportAmount).toBe(usd(1000));
    expect(r.tx.get(lot1.incId!)?.reportAmount).toBe(usd(1000));
    // Quedan 230 000 MN del segundo cambio: 348,48 USD. Todo suma 1 500.
    expect(remainingCost(r, 'MN')).toBe(34848);
    const spent = r.lots.reduce((s, l) => s + (l.costMicros ?? 0n), 0n);
    const allocated = r.allocations.reduce((s, a) => s + (a.costMicros ?? 0n), 0n);
    const left = r.lots.reduce((s, l) => s + (l.remainingCostMicros ?? 0n), 0n);
    expect(allocated + left).toBe(spent); // el coste se conserva exacto
    expect(r.mismatch.size).toBe(0);
  });

  it('el gasto de 500 000 sale de los dos cambios', () => {
    const r = valuate([lot1, g1, lot2, g2], noRates, 'USD');
    const parts = r.allocations.filter((a) => a.consumerTxId === g2.id).map((a) => a.qty);
    expect(parts).toEqual([mn(400_000), mn(100_000)]);
  });

  it('el orden lo da la fecha, no el orden de alta', () => {
    const r = valuate([g2, lot2, g1, lot1], noRates, 'USD');
    expect(r.tx.get(g1.id)?.reportAmount).toBe(33333);
    expect(r.tx.get(g2.id)?.reportAmount).toBe(81818);
  });

  it('un cambio con fecha atrasada cambia lo que vino despues', () => {
    const early = exchange('2026-09-20', 'USD', usd(100), 'MN', mn(65_000));
    const r = valuate([lot1, g1, lot2, g2, early], noRates, 'USD');
    expect(r.tx.get(g1.id)?.reportAmount).toBe(32500); // 65 000 @650 + 135 000 @600
    expect(r.tx.get(g2.id)?.reportAmount).toBe(82803);
    expect(remainingCost(r, 'MN')).toBe(44697);
    expect(32500 + 82803 + 44697).toBe(usd(1600));
  });

  it('vender MN por USD da resultado cambiario', () => {
    const sale = exchange('2026-10-25', 'MN', mn(230_000), 'USD', usd(330));
    const r = valuate([lot1, g1, lot2, g2, sale], noRates, 'USD');
    expect(r.tx.get(sale.id)).toMatchObject({ reportAmount: 34848, status: 'EXACT', fxResult: -1848 });
    expect(r.tx.get(sale.incId!)?.reportAmount).toBe(usd(330));
    expect(r.lots.every((l) => l.remainingQty === 0)).toBe(true);
  });

  it('MN a MLC pasa el coste al lote de MLC', () => {
    const toMlc = exchange('2026-10-22', 'MN', mn(115_000), 'MLC', usd(200));
    const g3 = expense('2026-10-23', 'MLC', usd(50));
    const r = valuate([lot1, g1, lot2, g2, toMlc, g3], noRates, 'USD');
    expect(r.tx.get(toMlc.id)?.reportAmount).toBe(17424);
    expect(r.tx.get(g3.id)?.reportAmount).toBe(4356);
  });

  it('los traspasos no tocan la bolsa', () => {
    const t = transfer('2026-10-10', 'MN', mn(50_000));
    const r = valuate([lot1, t, g1], noRates, 'USD');
    expect(r.tx.has(t.id)).toBe(false);
    expect(r.tx.get(g1.id)?.reportAmount).toBe(33333);
  });
});

describe('bolsa en negativo', () => {
  it('se estima a la tasa del dia y la valora el siguiente cambio', () => {
    const g = expense('2026-10-01', 'MN', mn(100_000));
    const before = valuate([g], rates({ '2026-10-01': { USD: 620 } }), 'USD');
    expect(before.tx.get(g.id)).toEqual(v(16129, 16129, 'ESTIMATE'));

    const lot = exchange('2026-10-03', 'USD', usd(300), 'MN', mn(198_000));
    const after = valuate([g, lot], rates({ '2026-10-01': { USD: 620 }, '2026-10-03': { USD: 650 } }), 'USD');
    // Costo 151,52 (el cambio a 660), a mercado del dia 161,29: 9,77 a favor por
    // gastar antes de cambiar. 2,33 por cambiar a 660 con el mercado a 650, 7,44
    // porque el mercado subio de 620 a 650 entre el gasto y el cambio.
    expect(after.tx.get(g.id)).toEqual(v(15152, 16129, 'EXACT', 233, 744));
    expect(remainingCost(after, 'MN')).toBe(14848);
    expect(after.openDeficits.size).toBe(0);
  });

  it('sin tasa ni cambio queda "falta tasa" y lo pide', () => {
    const g = expense('2026-10-01', 'MN', mn(1000));
    const r = valuate([g], noRates, 'USD');
    expect(r.tx.get(g.id)?.status).toBe('MISSING_RATE');
    expect(r.missingRates).toEqual([{ day: '2026-10-01', currency: 'USD' }]);
  });
});

describe('cierre de mes', () => {
  it('lo estimado de un mes cerrado se congela; la diferencia va a resultado cambiario', () => {
    const g = expense('2026-09-28', 'MN', mn(100_000));
    const lot = exchange('2026-10-03', 'USD', usd(300), 'MN', mn(198_000));
    const r = valuate([g, lot], rates({ '2026-09-28': { USD: 620 } }), 'USD', '2026-09');
    // El gasto de septiembre queda en 161,29 estimado aunque octubre lo cubra a 660
    expect(r.tx.get(g.id)).toEqual(v(16129, 16129, 'ESTIMATE'));
    // 161,290323 estimados - 151,515152 reales = 9,78 a favor, en el cambio de octubre
    expect(r.tx.get(lot.id)?.fxResult).toBe(978);
    expect(r.mismatch.size).toBe(0);
  });

  it('con la tasa del dia del cambio, esa diferencia se parte en cambio y retener', () => {
    const g = expense('2026-09-28', 'MN', mn(100_000));
    const lot = exchange('2026-10-03', 'USD', usd(300), 'MN', mn(198_000));
    const r = valuate([g, lot], rates({ '2026-09-28': { USD: 620 }, '2026-10-03': { USD: 650 } }), 'USD', '2026-09');
    expect(r.tx.get(lot.id)).toMatchObject({ fxResult: 978, fxExchange: 233, fxHolding: 745 });
  });

  it('sin cierre, el mismo caso se revalora al cubrirse', () => {
    const g = expense('2026-09-28', 'MN', mn(100_000));
    const lot = exchange('2026-10-03', 'USD', usd(300), 'MN', mn(198_000));
    const r = valuate([g, lot], rates({ '2026-09-28': { USD: 620 } }), 'USD');
    expect(r.tx.get(g.id)).toMatchObject({ reportAmount: 15152, marketAmount: 16129, status: 'EXACT', fxResult: 977 });
  });
});

describe('entradas que no vienen de un cambio', () => {
  it('saldo inicial o ventas en MN entran a la tasa de referencia del dia', () => {
    const ini = income('2026-10-01', 'MN', mn(81_000));
    const g = expense('2026-10-02', 'MN', mn(40_500));
    const r = valuate([ini, g], rates({ '2026-10-01': { USD: 810 } }), 'USD');
    expect(r.tx.get(ini.id)).toEqual(v(usd(100), usd(100), 'EXACT'));
    expect(r.tx.get(g.id)?.reportAmount).toBe(usd(50));
  });

  it('si falta la tasa ese dia no se inventa: el ingreso y lo que lo consume quedan sin valorar', () => {
    const ini = income('2026-10-01', 'MN', mn(81_000));
    const g = expense('2026-10-02', 'MN', mn(1000));
    const r = valuate([ini, g], noRates, 'USD');
    expect(r.tx.get(ini.id)?.status).toBe('MISSING_RATE');
    expect(r.tx.get(g.id)).toEqual(v(null, null, 'MISSING_RATE'));
    expect(r.missingRates.map((m) => m.currency)).toContain('USD');
  });

  it('USDT no vale lo mismo que USD: va con su tasa cruzada', () => {
    const u = income('2026-10-19', 'USDT', usd(100));
    const r = valuate([u], rates({ '2026-10-19': { USD: 810, USDT: 1035 } }), 'USD');
    expect(r.tx.get(u.id)?.reportAmount).toBe(12778); // 100 * 1035 / 810
  });

  it('una tasa estimada (la ultima conocida) marca el valor como estimado', () => {
    const ini = income('2026-10-20', 'MN', mn(81_000));
    const rate: RateFn = (_d, c) => (c === 'USD' ? { mn: M(810), estimated: true } : null);
    const r = valuate([ini], rate, 'USD');
    expect(r.tx.get(ini.id)?.status).toBe('ESTIMATE');
  });

  it('una pierna huerfana que entra cuenta como entrada', () => {
    const k: [number, number, string] = [Date.parse('2026-10-01T12:00:00Z'), 1, 'orphan'];
    const o: EngineEvent = { id: 'orphan', type: 'EXCHANGE', day: '2026-10-01', sortKey: k, currency: 'MN', amount: mn(81_000), orphanIncoming: true };
    const r = valuate([o], rates({ '2026-10-01': { USD: 810 } }), 'USD');
    expect(r.tx.get('orphan')?.reportAmount).toBe(usd(100));
    expect(r.mismatch.size).toBe(0);
  });
});

describe('diferencias de cambio (NIC 21)', () => {
  // El ejemplo que se le mostro a Frank: cambia a 600 con el mercado a 610 y
  // gasta 19 dias despues, con el mercado a 650.
  const lot = exchange('2026-10-01', 'USD', usd(1000), 'MN', mn(600_000));
  const table = { '2026-10-01': { USD: 610 }, '2026-10-20': { USD: 650 } };

  it('el gasto va a mercado del dia y la diferencia se parte en cambio y retener', () => {
    const g = expense('2026-10-20', 'MN', mn(60_000));
    const r = valuate([lot, g], rates(table), 'USD');
    // Costo 100,00 = mercado 92,31 + 1,64 por cambiar a 600 (no a 610) + 6,05 por retener (610 → 650)
    expect(r.tx.get(g.id)).toEqual(v(10000, 9231, 'EXACT', -164, -605));
  });

  it('vender MN: por cambio suma lo recibido contra el mercado del dia', () => {
    const sale = exchange('2026-10-20', 'MN', mn(65_000), 'USD', usd(100));
    const r = valuate([lot, sale], rates(table), 'USD');
    // 65 000 MN costaron 108,33; a 650 valen 100,00 y se vendieron a 100,00
    expect(r.tx.get(sale.id)).toEqual(v(10833, 10000, 'EXACT', -178, -655));
    expect(r.tx.get(sale.incId!)).toEqual(v(usd(100), usd(100), 'EXACT'));
  });

  it('si falta la tasa del dia, a mercado usa la anterior, estimada, y la pide', () => {
    const g = expense('2026-10-05', 'MN', mn(61_000));
    const r = valuate([lot, g], ratesLenient(table), 'USD');
    expect(r.tx.get(g.id)).toEqual(v(10167, 10000, 'ESTIMATE', -167, 0));
    expect(r.missingRates).toEqual([{ day: '2026-10-05', currency: 'USD' }]);
  });

  it('sin ninguna tasa para el mercado queda sin valorar, aunque se sepa el costo', () => {
    const g = expense('2026-10-05', 'MN', mn(60_000));
    const r = valuate([lot, g], noRates, 'USD');
    expect(r.tx.get(g.id)).toEqual(v(10000, null, 'MISSING_RATE'));
  });

  it('MN que entro por una venta solo tiene parte por retener', () => {
    const ini = income('2026-10-01', 'MN', mn(61_000));
    const g = expense('2026-10-20', 'MN', mn(61_000));
    const r = valuate([ini, g], rates(table), 'USD');
    // Entro a 610 (100,00) y se gasto a 650 (93,85)
    expect(r.tx.get(g.id)).toEqual(v(10000, 9385, 'EXACT', 0, -615));
  });

  it('en USD no hay diferencia', () => {
    const g = expense('2026-10-20', 'USD', usd(40));
    expect(valuate([g], noRates, 'USD').tx.get(g.id)).toEqual(v(usd(40), usd(40), 'EXACT'));
  });
});

describe('conservacion del coste con secuencias al azar', () => {
  it('lo asignado mas lo que queda es lo que costaron los lotes, y la bolsa cuadra con los saldos', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let round = 0; round < 50; round++) {
      const evs: EngineEvent[] = [];
      const day = (d: number) => `2026-10-${String(1 + (d % 28)).padStart(2, '0')}`;
      for (let i = 0; i < 40; i++) {
        const d = day(Math.floor(rnd() * 28));
        const x = rnd();
        if (x < 0.25) evs.push(exchange(d, 'USD', usd(50 + Math.floor(rnd() * 500)), 'MN', mn(30_000 + Math.floor(rnd() * 300_000))));
        else if (x < 0.75) evs.push(expense(d, 'MN', mn(100 + Math.floor(rnd() * 90_000))));
        else if (x < 0.85) evs.push(exchange(d, 'MN', mn(1000 + Math.floor(rnd() * 50_000)), 'USD', usd(1 + Math.floor(rnd() * 80))));
        else evs.push(transfer(d, 'MN', mn(1000)));
      }
      const day0 = Date.parse('2026-10-01');
      const rate: RateFn = (d) => ({ mn: M(600 + (Date.parse(d) - day0) / 86_400_000 * 3), estimated: false });
      const r = valuate(evs, rate, 'USD');
      const lotCost = r.lots.reduce((s, l) => s + (l.costMicros ?? 0n), 0n);
      const settled = r.allocations.filter((a) => a.kind !== 'DEFICIT').reduce((s, a) => s + (a.costMicros ?? 0n), 0n);
      const left = r.lots.reduce((s, l) => s + (l.remainingCostMicros ?? 0n), 0n);
      expect(settled + left).toBe(lotCost);
      // Lo mismo con el valor a mercado de los lotes
      const lotMarket = r.lots.reduce((s, l) => s + (l.marketMicros ?? 0n), 0n);
      const settledMarket = r.allocations.filter((a) => a.kind !== 'DEFICIT').reduce((s, a) => s + (a.marketMicros ?? 0n), 0n);
      const leftMarket = r.lots.reduce((s, l) => s + (l.remainingMarketMicros ?? 0n), 0n);
      expect(settledMarket + leftMarket).toBe(lotMarket);
      // En cada gasto: costo = mercado - diferencia de cambio, y la diferencia son sus dos partes
      for (const e of evs.filter((x) => x.type === 'EXPENSE')) {
        const t = r.tx.get(e.id)!;
        expect(t.fxExchange + t.fxHolding).toBe(t.fxResult);
        expect(t.marketAmount! - t.fxResult).toBe(t.reportAmount);
      }
      expect(r.mismatch.size).toBe(0);
    }
  });
});
