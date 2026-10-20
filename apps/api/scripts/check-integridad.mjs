#!/usr/bin/env node
// Comprobaciones de la Fase 0 (integridad) contra una API con los datos de seed-prueba.
//
//   BASE_URL=https://apieco-prueba.merxbit.com/api/v1 SEED_PASSWORD=... node scripts/check-integridad.mjs
//
// Opcional: REF_URL apunta a una API con el codigo anterior y LOS MISMOS datos;
// entonces se comparan saldos y estadisticas antes de tocar nada.
// OJO: crea y borra movimientos de prueba. No usar contra produccion.

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3999/api/v1';
const REF = process.env.REF_URL;
const PASS = process.env.SEED_PASSWORD;
const EMAIL = process.env.SEED_EMAIL ?? 'frankernesto6587@gmail.com';
if (!PASS) throw new Error('Falta SEED_PASSWORD');

let failures = 0;
const ok = (cond, msg, extra) => {
  console.log(`${cond ? '✔' : '✘'} ${msg}${!cond && extra !== undefined ? `  → ${JSON.stringify(extra)}` : ''}`);
  if (!cond) failures++;
};

async function session(base) {
  const r = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASS }) });
  const j = await r.json();
  if (!j.tokens) throw new Error(`login ${base}: ${r.status} ${JSON.stringify(j)}`);
  const orgs = Object.fromEntries(j.organizations.map((o) => [o.slug, o.id]));
  const call = (org) => async (method, path, body) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${j.tokens.accessToken}`,
        'x-organization-id': orgs[org],
        ...(body !== undefined && { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  return { orgs, casa: call('casa-prueba'), negocio: call('negocio-prueba') };
}

const s = await session(BASE);
const api = s.casa;

// ── 0. Mismos numeros que el codigo anterior ─────────────────────────────
if (REF) {
  const ref = (await session(REF)).casa;
  // Campos que el codigo anterior no tenia (aprobaciones): no son numeros que comparar.
  const NEW = ['recentTransactions', 'linkedTransaction', 'linkedBy', 'pendingDelta', 'pendingCount', 'pending'];
  const strip = (o) => JSON.parse(JSON.stringify(o, (k, v) => (NEW.includes(k) ? undefined : v)));
  for (const path of [
    '/accounts',
    '/dashboard/overview',
    '/analytics/summary?currency=MN',
    '/analytics/summary?currency=USD',
    '/analytics/trend?currency=MN&months=6',
    '/analytics/recurring?currency=MN',
    '/analytics/top-categories?currency=MN',
    `/budgets/progress?currency=MN&month=${new Date().toISOString().slice(0, 7)}`,
  ]) {
    const [a, b] = await Promise.all([api('GET', path), ref('GET', path)]);
    const same = JSON.stringify(strip(a.body)) === JSON.stringify(strip(b.body));
    ok(a.status === 200 && same, `igual que antes: ${path}`, same ? undefined : { nuevo: a.status, ref: b.status });
  }
}

const accounts = (await api('GET', '/accounts')).body;
const acc = (name) => accounts.find((a) => a.name === name);
const mn = acc('Efectivo MN');
const bandec = acc('BANDEC');
const usd = acc('Efectivo USD');
const balances = async () => Object.fromEntries((await api('GET', '/accounts')).body.map((a) => [a.name, a.balance]));
const start = await balances();

// ── 1. Fechas sin hora caen el mismo dia en La Habana ────────────────────
const g = await api('POST', '/transactions', { date: '2026-10-01', description: 'check fecha', amount: 100, type: 'EXPENSE', accountId: mn.id });
ok(g.status === 201, 'crear gasto con fecha 2026-10-01', g.body);
ok(g.body?.date === '2026-10-01T16:00:00.000Z', 'se guarda el 1/10 a las 12:00 de La Habana (16:00 UTC)', g.body?.date);

// ── 2. Reglas de moneda en pares ─────────────────────────────────────────
let r = await api('POST', '/transactions', { date: '2026-10-02', description: 'x', amount: 100, type: 'EXCHANGE', accountId: mn.id, toAccountId: bandec.id, toAmount: 100 });
ok(r.status === 400, 'cambio entre dos cuentas MN → 400', r.body);
r = await api('POST', '/transactions', { date: '2026-10-02', description: 'x', amount: 100, type: 'TRANSFER', accountId: usd.id, toAccountId: mn.id });
ok(r.status === 400, 'traspaso USD → MN → 400', r.body);

// ── 3. Referencias de otra organizacion ──────────────────────────────────
const otherAcc = (await s.negocio('GET', '/accounts')).body[0];
r = await api('POST', '/transactions', { date: '2026-10-02', description: 'x', amount: 100, type: 'EXPENSE', accountId: otherAcc.id });
ok(r.status === 400, 'gasto en una cuenta de Negocio desde Casa → 400', r.body);

// ── 4. Editar un cambio desde la pierna que entra mantiene el par ────────
const before = await balances();
const ex = await api('POST', '/transactions', { date: '2026-10-03', description: 'check cambio', amount: 10000, type: 'EXCHANGE', accountId: usd.id, toAccountId: mn.id, toAmount: 3800000 });
ok(ex.status === 201 && ex.body.linkedTransaction?.amount === 3800000, 'crear cambio 100 USD → 38 000 MN (la respuesta trae la otra pierna)', ex.body);
const incId = ex.body.linkedTransactionId;
r = await api('PATCH', `/transactions/${incId}`, { amount: 20000, toAmount: 7000000, date: '2026-10-04', description: 'check cambio editado' });
ok(r.status === 200, 'editar el cambio abriendolo por la pierna que entra', r.body);
const out = (await api('GET', `/transactions/${ex.body.id}`)).body;
const inc = (await api('GET', `/transactions/${incId}`)).body;
ok(out.amount === 20000 && inc.amount === 7000000, 'importes: sale 200 USD, entra 70 000 MN', { out: out.amount, inc: inc.amount });
ok(out.date === inc.date && out.description === inc.description, 'misma fecha y descripcion en las dos piernas', { out: out.date, inc: inc.date });
ok(out.accountId === usd.id && inc.accountId === mn.id, 'cada pierna conserva su cuenta');
r = await api('PATCH', `/transactions/${ex.body.id}`, { type: 'EXPENSE' });
ok(r.status === 400, 'un cambio no puede pasar a gasto → 400', r.body);
const mid = await balances();
ok(mid['Efectivo USD'] === before['Efectivo USD'] - 20000 && mid['Efectivo MN'] === before['Efectivo MN'] + 7000000,
  'saldos reflejan el cambio editado', { antes: before, ahora: mid });

// ── 5. En pares no se cambia en lote ni la categoria (no llevan) ni la cuenta ──
const cats = (await api('GET', '/categories')).body;
const otros = cats.find((c) => c.name === 'Otros gastos');
r = await api('PATCH', '/transactions/bulk', { ids: [ex.body.id], categoryId: otros.id });
ok(r.status === 400, 'categoria en lote sobre un cambio → 400', r.body);
ok((await api('GET', `/transactions/${incId}`)).body.categoryId === null, 'la pierna que entra sigue sin categoria');
r = await api('PATCH', '/transactions/bulk', { ids: [ex.body.id], accountId: bandec.id });
ok(r.status === 400, 'cambiar la cuenta de un cambio en lote → 400', r.body);

// ── 6. La moneda de una cuenta con movimientos no se cambia ──────────────
r = await api('PATCH', `/accounts/${mn.id}`, { currency: 'USD' });
ok(r.status === 409, 'cambiar moneda de Efectivo MN → 409', r.body);

// ── 7. Deudas: moneda, pagos y borrado ───────────────────────────────────
const debts = (await api('GET', '/debts')).body;
ok(debts.every((d) => d.currency), 'todas las deudas traen moneda', debts.map((d) => d.currency));
const debt = await api('POST', '/debts', { personName: 'Check', description: 'check deuda', totalAmount: 500000, type: 'RECEIVABLE', accountId: mn.id, date: '2026-10-05' });
ok(debt.status === 201 && debt.body.currency === 'MN', 'crear deuda desde una cuenta MN → deuda en MN', debt.body);
r = await api('POST', `/debts/${debt.body.id}/payments`, { amount: 100, date: '2026-10-06', accountId: usd.id });
ok(r.status === 400, 'pagar una deuda MN desde una cuenta USD → 400', r.body);
const pay = await api('POST', `/debts/${debt.body.id}/payments`, { amount: 200000, date: '2026-10-06', accountId: mn.id });
ok(pay.status === 201, 'pago de 2 000 MN', pay.body);
let d = (await api('GET', `/debts/${debt.body.id}`)).body;
ok(d.paidAmount === 200000 && d.status === 'PARTIAL', 'deuda: pagado 2 000, parcial', { paid: d.paidAmount, status: d.status });
r = await api('DELETE', `/transactions/${pay.body.id}`, { reason: 'check' });
d = (await api('GET', `/debts/${debt.body.id}`)).body;
ok(d.paidAmount === 0 && d.status === 'PENDING', 'al borrar el pago, la deuda vuelve a pendiente', { paid: d.paidAmount, status: d.status });
r = await api('PATCH', `/transactions/${pay.body.id}/restore`);
d = (await api('GET', `/debts/${debt.body.id}`)).body;
ok(d.paidAmount === 200000, 'al restaurarlo, vuelve a contar', d.paidAmount);
const overviewBefore = (await api('GET', '/dashboard/overview')).body.pendingDebtsReceivable;
r = await api('DELETE', `/debts/${debt.body.id}`);
ok(r.status === 200, 'borrar la deuda', r.body);
ok((await api('GET', `/debts/${debt.body.id}`)).status === 404, 'la deuda borrada ya no se encuentra');
const txsOfDebt = (await api('GET', '/transactions?limit=100&deleted=true')).body.data.filter((t) => t.debtId === debt.body.id);
ok(txsOfDebt.length === 2, 'sus dos movimientos quedan en la papelera', txsOfDebt.length);
const overviewAfter = (await api('GET', '/dashboard/overview')).body.pendingDebtsReceivable;
ok((overviewBefore.MN ?? 0) - (overviewAfter.MN ?? 0) === 300000, 'el panel deja de contar los 3 000 MN pendientes', { overviewBefore, overviewAfter });

// ── Limpieza: borrar lo creado ───────────────────────────────────────────
for (const id of [g.body?.id, ex.body?.id]) if (id) await api('DELETE', `/transactions/${id}`, { reason: 'check-integridad' });
const end = await balances();
ok(JSON.stringify(end) === JSON.stringify(start), 'tras limpiar, los saldos vuelven a los iniciales', { start, end });

console.log(failures ? `\n${failures} comprobaciones fallaron` : '\nTodo bien');
process.exit(failures ? 1 : 0);
