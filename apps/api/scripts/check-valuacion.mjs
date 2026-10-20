#!/usr/bin/env node
// Comprobaciones de la Fase 2 (valoracion FIFO) contra una API con seed-prueba.
//
//   BASE_URL=https://apieco-prueba.merxbit.com/api/v1 SEED_PASSWORD=... node scripts/check-valuacion.mjs
//
// Crea una organizacion "FIFO (check)" con el ejemplo que se le mostro a Frank
// (fechas fijas, solo cambios y gastos: no depende de las tasas de elTOQUE),
// comprueba cada cifra y la borra al final. No usar contra produccion.

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3999/api/v1';
const PASS = process.env.SEED_PASSWORD;
if (!PASS) throw new Error('Falta SEED_PASSWORD');

let failures = 0;
const ok = (cond, msg, extra) => {
  console.log(`${cond ? '✔' : '✘'} ${msg}${!cond && extra !== undefined ? `  → ${JSON.stringify(extra)}` : ''}`);
  if (!cond) failures++;
};

async function login(email) {
  const r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PASS }) });
  const j = await r.json();
  if (!j.tokens) throw new Error(`login ${email}: ${r.status}`);
  return j;
}
const client = (token, orgId) => async (method, path, body) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'x-organization-id': orgId, ...(body !== undefined && { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

const frank = await login('frankernesto6587@gmail.com');
const casaId = frank.organizations.find((o) => o.slug === 'casa-prueba').id;
const noOrg = client(frank.tokens.accessToken, casaId);

// ── Organizacion de laboratorio ──────────────────────────────────────────
const created = await noOrg('POST', '/organizations', { name: 'FIFO (check)', baseCurrency: 'MN' });
ok(created.status === 201, 'crear organizacion FIFO (check)', created.body);
const orgId = created.body.id ?? created.body.organization?.id;
const api = client(frank.tokens.accessToken, orgId);
const acc = async (name, currency) => (await api('POST', '/accounts', { name, type: 'CASH', currency })).body.id;
const usd = await acc('Caja USD', 'USD');
const mn = await acc('Caja MN', 'MN');

const tx = async (body) => {
  const r = await api('POST', '/transactions', body);
  if (r.status !== 201) throw new Error(`alta: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};
const exchange = (date, from, a, to, b) => tx({ date, description: 'cambio', amount: a, type: 'EXCHANGE', accountId: from, toAccountId: to, toAmount: b });
const expense = (date, amount, accountId = mn) => tx({ date, description: 'gasto', amount, type: 'EXPENSE', accountId });
const value = async (id) => (await api('GET', `/transactions/${id}`)).body;

// Fondos en USD para cambiar (entrada en la moneda de estadisticas: vale lo mismo)
await tx({ date: '2026-09-01', description: 'fondos', amount: 500000, type: 'INCOME', accountId: usd });
const lot1 = await exchange('2026-09-10', usd, 100000, mn, 60000000); // 1 000 USD → 600 000 MN
const g1 = await expense('2026-09-11', 20000000); // 200 000 MN
const lot2 = await exchange('2026-09-15', usd, 50000, mn, 33000000); // 500 USD → 330 000 MN
const g2 = await expense('2026-09-20', 50000000); // 500 000 MN

ok((await api('PATCH', '/valuation/settings', { enabled: true, reportCurrency: 'USD' })).status === 200, 'activar la valoracion en USD');

let v1 = await value(g1.id);
let v2 = await value(g2.id);
ok(v1.reportAmount === 33333 && v1.valuationStatus === 'EXACT', 'gasto de 200 000 MN = 333,33 USD', v1.reportAmount);
ok(v2.reportAmount === 81818 && v2.valuationStatus === 'EXACT', 'gasto de 500 000 MN = 818,18 USD', v2.reportAmount);
const pat = (await api('GET', '/valuation/patrimony')).body;
const mnRow = pat.currencies.find((c) => c.currency === 'MN');
ok(mnRow?.qty === 23000000 && mnRow?.atCost === 34848, 'quedan 230 000 MN que costaron 348,48 USD', mnRow);
ok(pat.totals.atCost === 500000 - 150000 + 34848, 'patrimonio a costo = USD que quedan + MN a costo', pat.totals);
const bd = (await api('GET', `/valuation/transactions/${g2.id}`)).body;
ok(bd.parts?.length === 2 && bd.parts[0].lot?.rate === 600 && bd.parts[1].lot?.rate === 660, 'el gasto de 500 000 sale de los cambios a 600 y 660', bd.parts);

// ── Un cambio con fecha atrasada recalcula lo que vino despues ───────────
const early = await exchange('2026-09-05', usd, 10000, mn, 6500000); // 100 USD → 65 000 MN
v1 = await value(g1.id);
v2 = await value(g2.id);
ok(v1.reportAmount === 32500 && v2.reportAmount === 82803, 'tras el cambio atrasado: 325,00 y 828,03', [v1.reportAmount, v2.reportAmount]);
await api('DELETE', `/transactions/${early.id}`, { reason: 'check' });
ok((await value(g1.id)).reportAmount === 33333, 'al borrarlo, vuelve a 333,33');

// ── Vender MN por USD: resultado cambiario ───────────────────────────────
const sale = await exchange('2026-09-25', mn, 23000000, usd, 33000);
const vs = await value(sale.id);
ok(vs.reportAmount === 34848 && vs.fxResult === -1848, 'vender 230 000 MN por 330 USD: −18,48 de resultado', vs);
await api('DELETE', `/transactions/${sale.id}`, { reason: 'check' });

// ── Gasto sin bolsa: estimado a la tasa del dia, luego lo valora el siguiente cambio ──
await api('PUT', '/rates/2026-09-21', { rates: { USD: 620 } });
const deficit = await expense('2026-09-21', 33000000); // la bolsa tiene 230 000: faltan 100 000
let vd = await value(deficit.id);
ok(vd.valuationStatus === 'ESTIMATE' && vd.reportAmount === 50978, 'gasto que vacia la bolsa: 348,48 + 161,29 estimado = 509,78', vd);
const lot3 = await exchange('2026-09-22', usd, 30000, mn, 19800000); // 300 USD → 198 000 MN @660
vd = await value(deficit.id);
ok(vd.valuationStatus === 'EXACT' && vd.reportAmount === 34848 + 15152, 'al llegar el cambio queda exacto: 348,48 + 151,52', vd);
const st = (await api('GET', '/valuation/status')).body;
ok(Object.keys(st.mismatch ?? {}).length === 0, 'la bolsa cuadra con los saldos', st.mismatch);
await api('DELETE', `/transactions/${lot3.id}`, { reason: 'check' });
await api('DELETE', `/transactions/${deficit.id}`, { reason: 'check' });
await api('DELETE', '/rates/2026-09-21/USD');

// ── Analisis y presupuestos "todo en USD" ────────────────────────────────
const sum = (await api('GET', '/analytics/summary?from=2026-09-01&to=2026-09-30&currency=USD&basis=REPORT')).body;
ok(sum.currency === 'USD' && sum.totals?.expense === 33333 + 81818, 'Análisis en USD: gasto de septiembre = 333,33 + 818,18', sum.totals);
const native = (await api('GET', '/analytics/summary?from=2026-09-01&to=2026-09-30&currency=MN')).body;
ok(native.totals?.expense === 70000000, 'Análisis en MN sigue igual: 700 000 MN', native.totals);
const trend = (await api('GET', '/analytics/trend?currency=USD&basis=REPORT&months=3')).body;
ok(trend.points?.some((p) => p.month === '2026-09' && p.expense === 115151), 'tendencia en USD: septiembre 1 151,51', trend.points);
const bud = await api('POST', '/budgets', { basis: 'REPORT', currency: 'USD', amount: 100000, startMonth: '2026-09', endMonth: '2026-09' });
ok(bud.status === 201, 'presupuesto "todo en USD" de 1 000 USD', bud.body);
ok((await api('POST', '/budgets', { basis: 'REPORT', currency: 'MN', amount: 1, startMonth: '2026-09' })).status === 400, 'un presupuesto en USD tiene que ir en USD');
const prog = (await api('GET', '/budgets/progress?currency=USD&month=2026-09&basis=REPORT')).body;
ok(prog.items?.[0]?.spent === 115151 && prog.items?.[0]?.status === 'OVER', 'el presupuesto suma el gasto en MN valorado: 1 151,51 de 1 000 → pasado', prog.items?.[0]);

// ── Cierre de mes ────────────────────────────────────────────────────────
const close = await api('POST', '/valuation/months/2026-09/close');
ok(close.status === 201 && close.body.closedThrough === '2026-09', 'cerrar septiembre', close.body);
ok((await api('POST', '/transactions', { date: '2026-09-30', description: 'tarde', amount: 100, type: 'EXPENSE', accountId: mn })).status === 409, 'anotar en septiembre cerrado → 409');
ok((await api('DELETE', `/transactions/${g1.id}`, { reason: 'x' })).status === 409, 'borrar en septiembre cerrado → 409');
ok((await api('PUT', '/rates/2026-09-10', { rates: { USD: 700 } })).status === 400, 'cambiar una tasa de septiembre cerrado → 400');
ok((await api('PATCH', '/valuation/settings', { reportCurrency: 'EUR' })).status === 400, 'no se cambia la moneda de estadísticas con meses cerrados');
ok((await value(g1.id)).reportAmount === 33333, 'los valores de septiembre siguen igual');
const reopen = await api('POST', '/valuation/months/2026-09/reopen');
ok(reopen.status === 201 && reopen.body.closedThrough !== '2026-09', 'reabrir septiembre (propietario)', reopen.body);
const late = await api('POST', '/transactions', { date: '2026-09-30', description: 'tarde', amount: 100, type: 'EXPENSE', accountId: mn });
ok(late.status === 201, 'reabierto, se puede anotar otra vez');
await api('DELETE', `/transactions/${late.body.id}`, { reason: 'check' });

// ── Lo pendiente no se valora hasta aprobarse (en Casa, con Pedro) ───────
const pedro = await login('pedro@prueba.ecoghost');
const casaPedro = client(pedro.tokens.accessToken, casaId);
const casa = client(frank.tokens.accessToken, casaId);
await casa('PATCH', '/valuation/settings', { enabled: true });
const pmn = (await casa('GET', '/accounts')).body.find((a) => a.name === 'Efectivo MN');
const pend = await casaPedro('POST', '/transactions', { date: new Date().toISOString().slice(0, 10), description: 'check valoracion', amount: 81000, type: 'EXPENSE', accountId: pmn.id });
ok((await casa('GET', `/transactions/${pend.body.id}`)).body.reportAmount === null, 'un gasto pendiente no tiene valor');
await casa('POST', `/approvals/${pend.body.id}/approve`, {});
const appr = (await casa('GET', `/transactions/${pend.body.id}`)).body;
// Con todas las tasas bajadas tiene importe; si aun falta alguna tasa vieja de
// Casa queda "falta tasa", pero ya entra en la valoracion.
ok(appr.valuationStatus !== null, 'al aprobarlo entra en la valoracion', { reportAmount: appr.reportAmount, status: appr.valuationStatus });
const dash = (await casa('GET', '/dashboard/overview')).body;
ok(dash.report && dash.report.currency === 'USD' && typeof dash.report.monthExpense === 'number', 'el panel trae el resumen en USD', dash.report);
await casa('DELETE', `/transactions/${pend.body.id}`, { reason: 'check' });
const casaStatus = (await casa('GET', '/valuation/status')).body;
ok(Object.keys(casaStatus.mismatch ?? {}).length === 0, 'Casa: la bolsa cuadra con los saldos', casaStatus.mismatch);
console.log(`  Casa: ${casaStatus.missingRates.length} dias sin tasa, ${casaStatus.counts.estimates} estimados, ${casaStatus.counts.missingRate} sin valorar`);

// ── Limpieza ─────────────────────────────────────────────────────────────
const del = await api('DELETE', `/organizations/${orgId}`);
ok(del.status === 200 || del.status === 204, 'borrar la organizacion de laboratorio', del.status);

console.log(failures ? `\n${failures} comprobaciones fallaron` : '\nTodo bien');
process.exit(failures ? 1 : 0);
