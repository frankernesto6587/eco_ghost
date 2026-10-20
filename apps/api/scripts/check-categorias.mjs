#!/usr/bin/env node
// Comprobaciones de las categorias por tipo contra una API con los datos de seed-prueba.
//
//   BASE_URL=https://apieco-prueba.merxbit.com/api/v1 SEED_PASSWORD=... node scripts/check-categorias.mjs
//
// OJO: crea y borra movimientos y categorias de prueba. No usar contra produccion.

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3999/api/v1';
const PASS = process.env.SEED_PASSWORD;
const EMAIL = process.env.SEED_EMAIL ?? 'frankernesto6587@gmail.com';
if (!PASS) throw new Error('Falta SEED_PASSWORD');

let failures = 0;
const ok = (cond, msg, extra) => {
  console.log(`${cond ? '✔' : '✘'} ${msg}${!cond && extra !== undefined ? `  → ${JSON.stringify(extra)}` : ''}`);
  if (!cond) failures++;
};

const login = await (
  await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASS }) })
).json();
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
const msg = (r) => [r.body?.message].flat().join(' ');
const today = new Date().toISOString().slice(0, 10);

// ── 1. Cada categoria trae su tipo; las hijas, el de su grupo ───────────
const tree = (await api('GET', '/categories')).body;
const all = tree.flatMap((g) => [g, ...g.children]);
const byName = (n) => all.find((c) => c.name === n);
ok(all.every((c) => ['EXPENSE', 'INCOME', 'BOTH'].includes(c.kind)), 'todas las categorias tienen tipo');
ok(byName('Ingresos').kind === 'INCOME' && byName('Salario').kind === 'INCOME', 'Ingresos y Salario son de ingreso');
ok(byName('Mercado').kind === 'EXPENSE', 'Mercado es de gasto');
ok(byName('Prestamos').kind === 'BOTH' && byName('Saldo inicial').kind === 'BOTH', 'Prestamos y Saldo inicial valen para los dos');
ok(tree.every((g) => g.children.every((c) => c.kind === g.kind)), 'las subcategorias llevan el tipo de su grupo');

const accounts = (await api('GET', '/accounts')).body;
const mn = accounts.find((a) => a.currency === 'MN' && a.isActive);
const mn2 = accounts.find((a) => a.currency === 'MN' && a.isActive && a.id !== mn.id);
const usd = accounts.find((a) => a.currency === 'USD' && a.isActive);
const salario = byName('Salario').id;
const mercado = byName('Mercado').id;
const created = [];
const create = async (dto) => {
  const r = await api('POST', '/transactions', { date: today, description: 'check-categorias', amount: 1000, accountId: mn.id, ...dto });
  if (r.status === 201) created.push(r.body.id);
  return r;
};

// ── 2. Al anotar ─────────────────────────────────────────────────────────
let r = await create({ type: 'EXPENSE', categoryId: salario });
ok(r.status === 400 && /Salario.*ingreso/.test(msg(r)), 'un gasto con Salario se rechaza', r);
r = await create({ type: 'INCOME', categoryId: salario });
ok(r.status === 201, 'un ingreso con Salario se acepta', r.status);
const ingreso = r.body?.id;
r = await create({ type: 'EXPENSE', categoryId: byName('Prestamos').id });
ok(r.status === 201, 'Prestamos vale en un gasto', r.status);
r = await create({ type: 'TRANSFER', toAccountId: mn2.id, categoryId: mercado });
ok(r.status === 400 && /no llevan categoría/.test(msg(r)), 'una transferencia con categoria se rechaza', r);
r = await create({ type: 'EXCHANGE', accountId: usd.id, toAccountId: mn.id, toAmount: 400000, categoryId: byName('Prestamos').id });
ok(r.status === 400, 'un cambio con categoria se rechaza (ni siquiera Prestamos)', r.status);
r = await create({ type: 'TRANSFER', toAccountId: mn2.id });
ok(r.status === 201 && r.body.categoryId === null, 'una transferencia sin categoria se acepta', r.status);
const pair = r.body?.id;

// ── 3. Al editar ────────────────────────────────────────────────────────
r = await api('PATCH', `/transactions/${ingreso}`, { type: 'EXPENSE' });
ok(r.status === 400, 'pasar a gasto un ingreso con Salario se rechaza', r.status);
r = await api('PATCH', `/transactions/${ingreso}`, { type: 'EXPENSE', categoryId: mercado });
ok(r.status === 200 && r.body.type === 'EXPENSE', 'pasar a gasto cambiando tambien la categoria vale', r.status);
r = await api('PATCH', `/transactions/${pair}`, { categoryId: mercado });
ok(r.status === 400, 'poner categoria a una transferencia al editar se rechaza', r.status);

// ── 4. En lote ──────────────────────────────────────────────────────────
r = await api('PATCH', '/transactions/bulk', { ids: [ingreso], categoryId: salario });
ok(r.status === 400, 'en lote, Salario a un gasto se rechaza', r.status);
r = await api('PATCH', '/transactions/bulk', { ids: [ingreso, pair], categoryId: mercado });
ok(r.status === 400, 'en lote, con una transferencia en la seleccion se rechaza', r.status);
r = await api('PATCH', '/transactions/bulk', { ids: [ingreso], categoryId: byName('Delivery').id });
ok(r.status === 200 && r.body.count === 1, 'en lote, una de gasto a un gasto vale', r);

// ── 5. Al aprobar con correcciones ─────────────────────────────────────
const review = (await api('GET', '/approvals?scope=review')).body.data;
const pendingExpense = review.find((i) => i.kind === 'EXPENSE');
if (pendingExpense) {
  r = await api('POST', `/approvals/${pendingExpense.id}/approve`, { edits: { categoryId: salario } });
  ok(r.status === 400, 'aprobar un gasto corrigiendolo a Salario se rechaza', r.status);
  const still = (await api('GET', '/approvals?scope=review')).body.data.some((i) => i.id === pendingExpense.id);
  ok(still, 'y sigue pendiente');
} else ok(false, 'hay un gasto pendiente en la bandeja (seed-prueba)');

// ── 6. "Sin categorizar" no trae transferencias ni cambios ──────────────
const unc = (await api('GET', '/transactions?uncategorized=true&limit=100')).body.data;
ok(unc.every((t) => t.type === 'INCOME' || t.type === 'EXPENSE'), 'sin categorizar solo trae gastos e ingresos', unc.map((t) => t.type));

// ── 7. Presupuestos solo de gasto ─────────────────────────────────────
r = await api('POST', '/budgets', { categoryId: salario, currency: 'MN', amount: 100000, startMonth: today.slice(0, 7) });
ok(r.status === 400, 'un presupuesto con Salario se rechaza', r.status);

// ── 8. Categorias: el grupo decide el tipo ──────────────────────────────
r = await api('POST', '/categories', { name: 'check hija', parentId: byName('Ingresos').id, kind: 'EXPENSE' });
ok(r.status === 400, 'una subcategoria de Ingresos no puede ser de gasto', r.status);
r = await api('POST', '/categories', { name: 'check hija', parentId: byName('Ingresos').id });
ok(r.status === 201 && r.body.kind === 'INCOME', 'una subcategoria nueva de Ingresos nace de ingreso', r.body?.kind);
const hija = r.body?.id;
r = await api('POST', '/categories', { name: 'check grupo', kind: 'INCOME' });
ok(r.status === 201 && r.body.kind === 'INCOME', 'un grupo nuevo de ingreso', r.status);
const grupo = r.body?.id;
const nieta = (await api('POST', '/categories', { name: 'check sub', parentId: grupo })).body?.id;
r = await api('PATCH', `/categories/${grupo}`, { kind: 'EXPENSE' });
ok(r.status === 200, 'cambiar el tipo de un grupo sin movimientos vale', r.status);
const after = (await api('GET', '/categories')).body.flatMap((g) => [g, ...g.children]);
ok(after.find((c) => c.id === nieta)?.kind === 'EXPENSE', 'y su subcategoria cambia con el');
r = await api('PATCH', `/categories/${byName('Alimentacion').id}`, { kind: 'INCOME' });
ok(r.status === 409 && /gastos/.test(msg(r)), 'Alimentacion (con gastos) no puede pasar a ingreso', r);
r = await api('PATCH', `/categories/${nieta}`, { kind: 'INCOME' });
ok(r.status === 400, 'el tipo de una subcategoria no se cambia suelto', r.status);

// ── Limpieza ──────────────────────────────────────────────────────────
for (const id of created) await api('DELETE', `/transactions/${id}`, { reason: 'check-categorias' });
for (const id of [nieta, grupo, hija]) if (id) await api('DELETE', `/categories/${id}`);

console.log(failures ? `\n${failures} comprobaciones fallaron` : '\nTodo bien');
process.exit(failures ? 1 : 0);
