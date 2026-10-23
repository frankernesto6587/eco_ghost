#!/usr/bin/env node
// Comprobaciones de la busqueda y los filtros de movimientos contra una API con los datos de seed-prueba.
//
//   BASE_URL=https://apieco-prueba.merxbit.com/api/v1 SEED_PASSWORD=... node scripts/check-filtros.mjs
//
// OJO: crea y borra un movimiento de prueba. No usar contra produccion.

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3999/api/v1';
const PASS = process.env.SEED_PASSWORD;
const EMAIL = process.env.SEED_EMAIL ?? 'frankernesto6587@gmail.com';
if (!PASS) throw new Error('Falta SEED_PASSWORD');

let failures = 0;
const ok = (cond, msg, extra) => {
  console.log(`${cond ? '✔' : '✘'} ${msg}${!cond && extra !== undefined ? `  → ${JSON.stringify(extra)}` : ''}`);
  if (!cond) failures++;
};

const login = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASS }) }).then((r) => r.json());
if (!login.tokens) throw new Error(`login: ${JSON.stringify(login)}`);
const orgId = login.organizations.find((o) => o.slug === 'casa-prueba').id;
const api = async (method, path, body) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${login.tokens.accessToken}`,
      'x-organization-id': orgId,
      ...(body !== undefined && { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};
const list = async (params) => (await api('GET', `/transactions?limit=100&${new URLSearchParams(params)}`)).body;
const found = async (search) => (await list({ search })).data.some((t) => t.id === mine.id);

const accounts = (await api('GET', '/accounts')).body;
const mn = accounts.find((a) => a.name === 'Efectivo MN');
const usd = accounts.find((a) => a.name === 'Efectivo USD');

// ── 1. Busqueda sin tildes ni mayusculas, por palabras y por importe ─────
const mine = (await api('POST', '/transactions', {
  date: '2026-10-05', description: 'Café con leche', notes: 'ÑOÑO', amount: 123456, type: 'EXPENSE', accountId: mn.id,
})).body;
ok(mine?.id, 'se crea el gasto de prueba', mine);

ok(await found('cafe'), '"cafe" encuentra "Café con leche"');
ok(await found('CAFÉ'), '"CAFÉ" lo encuentra');
ok(await found('nono'), '"nono" lo encuentra por la nota "ÑOÑO"');
ok(await found('leche cafe'), 'las palabras en otro orden lo encuentran');
ok(!(await found('cafe pan')), '"cafe pan" no lo encuentra: tienen que estar todas las palabras');
ok(await found('1234,56'), 'el importe "1234,56" lo encuentra');
ok(await found('1 234,56'), 'el importe "1 234,56" lo encuentra');
ok(await found('efectivo mn'), 'el nombre de la cuenta lo encuentra');
const pct = await list({ search: '%' });
ok(pct.meta.total === 0, '"%" no es un comodin: no devuelve todo', pct.meta.total);

// ── 2. El resumen sigue a la busqueda ───────────────────────────────────
const sum = (await api('GET', `/transactions/summary?${new URLSearchParams({ search: 'café con leche ñoño' })}`)).body;
ok(sum.count === 1, 'el resumen cuenta 1 movimiento', sum);
ok(sum.expense?.MN === 123456, 'y suma su gasto en MN', sum.expense);

// ── 3. Un par cuenta una vez, aunque solo coincida la pierna que entra ──
// Las filas que pinta la app: la pierna que sale, o la que entra si la otra no vino
const rowsOf = (page) => {
  if (page.meta.total > page.data.length) throw new Error('Hay mas de 100: el check tiene que paginar');
  const ids = new Set(page.data.map((t) => t.id));
  return page.data.filter((t) => t.linkedTransactionId || (t.linkedBy && !ids.has(t.linkedBy.id))).length;
};
const params = { type: 'EXCHANGE', accountId: mn.id };
const pairs = await list(params);
const rows = rowsOf(pairs);
const incoming = pairs.data.filter((t) => t.linkedBy && t.linkedBy.account?.currency === 'USD');
ok(incoming.length > 0, 'filtrar los cambios por la cuenta MN trae las piernas que entran, con su origen en USD', pairs.data.length);
const pairSum = (await api('GET', `/transactions/summary?${new URLSearchParams(params)}`)).body;
ok(pairSum.count === rows, 'el resumen cuenta cada cambio una vez', { count: pairSum.count, rows });
const both = await list({ type: 'EXCHANGE', accountId: `${mn.id},${usd.id}` });
const bothSum = (await api('GET', `/transactions/summary?${new URLSearchParams({ type: 'EXCHANGE', accountId: `${mn.id},${usd.id}` })}`)).body;
ok(bothSum.count === rowsOf(both), 'con las dos cuentas, cada cambio sigue contando una vez', { count: bothSum.count, rows: rowsOf(both) });

// ── 4. En la moneda de estadisticas, si la organizacion valora ──────────
const status = (await api('GET', '/valuation/status')).body;
const month = (await api('GET', `/transactions/summary?${new URLSearchParams({ from: '2026-10-01T00:00:00.000Z', to: '2026-10-31T23:59:59.999Z' })}`)).body;
if (status?.enabled) {
  ok(month.report?.currency === status.reportCurrency, `el resumen trae los totales en ${status.reportCurrency}`, month.report);
  ok(month.report.expense > 0, 'con los gastos del mes a mercado', month.report);
} else {
  ok(month.report === null, 'sin valoracion, el resumen no trae report', month.report);
}

if (mine?.id) await api('DELETE', `/transactions/${mine.id}`, { reason: 'check-filtros' });

console.log(failures ? `\n${failures} comprobaciones fallaron` : '\nTodo bien');
process.exit(failures ? 1 : 0);
