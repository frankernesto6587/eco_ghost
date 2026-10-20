#!/usr/bin/env node
// Comprobaciones de la Fase 1 (aprobaciones) contra una API con los datos de seed-prueba.
//
//   BASE_URL=https://apieco-prueba.merxbit.com/api/v1 SEED_PASSWORD=... node scripts/check-aprobaciones.mjs
//
// Usuarios de seed-prueba (misma contrasena): Frank (propietario), Ana (admin),
// Carlos (contador con autoconfirmar hasta 50 USD / 20 000 MN), Pedro (contador
// sin autoconfirmar) y Lucia (visualizadora).
// OJO: deja movimientos de prueba en Casa (prueba). Volver a correr seed-prueba
// para dejarlo limpio. No usar contra produccion.

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3999/api/v1';
const PASS = process.env.SEED_PASSWORD;
if (!PASS) throw new Error('Falta SEED_PASSWORD');

let failures = 0;
const ok = (cond, msg, extra) => {
  console.log(`${cond ? '✔' : '✘'} ${msg}${!cond && extra !== undefined ? `  → ${JSON.stringify(extra)}` : ''}`);
  if (!cond) failures++;
};

async function as(email) {
  const r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PASS }) });
  const j = await r.json();
  if (!j.tokens) throw new Error(`login ${email}: ${r.status} ${JSON.stringify(j)}`);
  const org = j.organizations.find((o) => o.slug === 'casa-prueba').id;
  const call = async (method, path, body) => {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${j.tokens.accessToken}`,
        'x-organization-id': org,
        ...(body !== undefined && { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  call.userId = j.user.id;
  call.org = org;
  return call;
}

const [frank, ana, carlos, pedro, lucia] = await Promise.all(
  ['frankernesto6587@gmail.com', 'admin@prueba.ecoghost', 'contable@prueba.ecoghost', 'pedro@prueba.ecoghost', 'lector@prueba.ecoghost'].map(as),
);

const accounts = (await frank('GET', '/accounts')).body;
const acc = (name) => accounts.find((a) => a.name === name);
const mn = acc('Efectivo MN');
const usd = acc('Efectivo USD');
const mlc = acc('Tarjeta MLC');
const balance = async (name) => (await frank('GET', '/accounts')).body.find((a) => a.name === name);
const today = new Date().toISOString().slice(0, 10);
const gasto = (amount, accountId = mn.id, description = 'check aprobacion') => ({ date: today, description, amount, type: 'EXPENSE', accountId });

// ── 0. Los datos de muestra de seed-prueba ───────────────────────────────
const inbox0 = (await frank('GET', '/approvals')).body;
ok(inbox0.data?.length === 3 && inbox0.data.every((i) => i.author.name === 'Pedro Pendiente'), 'la bandeja trae los 3 pendientes de Pedro', inbox0.data?.map((i) => i.description));
ok(inbox0.data?.some((i) => i.kind === 'EXCHANGE' && i.to?.amount === 1950000), 'el cambio pendiente sale como una sola entrada con su destino');
ok(inbox0.data?.some((i) => i.kind === 'DEBT_PAYMENT' && i.debt?.personName === 'Tio Ramon'), 'el pago de deuda pendiente sale con su deuda');
const mine0 = (await pedro('GET', '/approvals?scope=mine')).body.data;
ok(mine0.some((i) => i.status === 'REJECTED' && i.rejectionReason), 'Pedro ve su rechazado con el motivo');

// ── 1. Lo de Pedro espera y no mueve los numeros ─────────────────────────
const before = await balance('Efectivo MN');
const dashBefore = (await frank('GET', '/dashboard/overview')).body;
const summaryBefore = (await frank('GET', '/analytics/summary?currency=MN')).body;
const p1 = await pedro('POST', '/transactions', gasto(640000, mn.id, 'check Pedro'));
ok(p1.status === 201 && p1.body.status === 'PENDING', 'Pedro anota 6 400 MN → pendiente', p1.body);
const after = await balance('Efectivo MN');
ok(after.balance === before.balance, 'el saldo de Efectivo MN no cambia', { before: before.balance, after: after.balance });
ok(after.pendingDelta === before.pendingDelta - 640000 && after.pendingCount === before.pendingCount + 1, 'pero aparece como pendiente en la cuenta', { before, after });
const dashAfter = (await frank('GET', '/dashboard/overview')).body;
ok(dashAfter.pending.toReview === dashBefore.pending.toReview + 1, 'el panel de Frank cuenta uno mas por revisar', dashAfter.pending);
const sorted = (o) => JSON.stringify(Object.entries(o ?? {}).sort());
ok(sorted(dashAfter.monthExpense) === sorted(dashBefore.monthExpense), 'el gasto del mes no cambia', { antes: dashBefore.monthExpense, ahora: dashAfter.monthExpense });
const summaryAfter = (await frank('GET', '/analytics/summary?currency=MN')).body;
ok(summaryAfter.totals?.expense === summaryBefore.totals?.expense, 'Analisis no lo cuenta', { antes: summaryBefore.totals, ahora: summaryAfter.totals });

// Quien ve que
const seen = async (who, id) => ((await who('GET', '/transactions?limit=100&status=PENDING')).body.data ?? []).some((t) => t.id === id);
ok(await seen(pedro, p1.body.id), 'Pedro ve su pendiente');
ok(await seen(ana, p1.body.id), 'Ana (admin) lo ve');
ok(!(await seen(carlos, p1.body.id)), 'Carlos (otro contador) no lo ve');
ok(!(await seen(lucia, p1.body.id)), 'Lucia (visualizadora) no lo ve');
ok((await lucia('GET', '/approvals')).status === 403, 'Lucia no tiene bandeja de revision');
ok((await carlos('GET', '/approvals')).status === 403, 'Carlos tampoco');

// ── 2. Ana lo aprueba corrigiendo el importe ─────────────────────────────
const unread0 = (await pedro('GET', '/approvals/counts')).body.unreadNotifications;
const ap = await ana('POST', `/approvals/${p1.body.id}/approve`, { edits: { amount: 600000 } });
ok(ap.status === 201 && ap.body.status === 'APPROVED', 'Ana aprueba con 6 000 MN', ap.body);
ok(ap.body.originalSnapshot?.amount === 640000, 'queda lo que envio Pedro (6 400)', ap.body.originalSnapshot);
const afterAp = await balance('Efectivo MN');
ok(afterAp.balance === before.balance - 600000, 'ahora si cuenta: −6 000 MN', { before: before.balance, now: afterAp.balance });
ok((await pedro('GET', '/approvals/counts')).body.unreadNotifications === unread0 + 1, 'Pedro tiene un aviso nuevo');
const notes = (await pedro('GET', '/notifications')).body;
ok(notes[0]?.title === 'Aprobado con correcciones', 'el aviso dice "Aprobado con correcciones"', notes[0]);
ok((await frank('POST', `/approvals/${p1.body.id}/approve`, {})).status === 409, 'aprobarlo otra vez → 409');

// ── 3. Rechazar, corregir y reenviar ─────────────────────────────────────
const p2 = await pedro('POST', '/transactions', gasto(150000, mn.id, 'check rechazo'));
ok((await ana('POST', `/approvals/${p2.body.id}/reject`, {})).status === 400, 'rechazar sin motivo → 400');
const rj = await ana('POST', `/approvals/${p2.body.id}/reject`, { reason: 'Fue por BANDEC' });
ok(rj.status === 201 && rj.body.status === 'REJECTED' && rj.body.rejectionReason === 'Fue por BANDEC', 'rechazado con motivo', rj.body);
const bandec = acc('BANDEC');
const fix = await pedro('PATCH', `/approvals/${p2.body.id}`, { accountId: bandec.id });
ok(fix.status === 200 && fix.body.status === 'PENDING' && fix.body.from.accountId === bandec.id && !fix.body.rejectionReason, 'Pedro lo corrige a BANDEC y vuelve a pendiente', fix.body);
ok((await frank('POST', `/approvals/${p2.body.id}/approve`, {})).body?.status === 'APPROVED', 'Frank lo aprueba');

// ── 4. Un cambio se aprueba entero ───────────────────────────────────────
const ex = await pedro('POST', '/transactions', { date: today, description: 'check cambio', amount: 5000, type: 'EXCHANGE', accountId: usd.id, toAccountId: mn.id, toAmount: 1950000 });
ok(ex.status === 201 && ex.body.status === 'PENDING' && ex.body.linkedTransaction?.status === 'PENDING', 'cambio de Pedro: las dos piernas pendientes', ex.body?.status);
await frank('POST', `/approvals/${ex.body.linkedTransactionId}/approve`, {}); // aprobado desde la pierna que entra
const legOut = (await frank('GET', `/transactions/${ex.body.id}`)).body;
const legIn = (await frank('GET', `/transactions/${ex.body.linkedTransactionId}`)).body;
ok(legOut.status === 'APPROVED' && legIn.status === 'APPROVED', 'aprobar desde cualquier pierna aprueba las dos');

// ── 5. Dos admins a la vez: uno gana, el otro 409 ────────────────────────
const p3 = await pedro('POST', '/transactions', gasto(1000, mn.id, 'check carrera'));
const race = await Promise.all([frank('POST', `/approvals/${p3.body.id}/approve`, {}), ana('POST', `/approvals/${p3.body.id}/approve`, {})]);
ok(race.map((r) => r.status).sort().join() === '201,409', 'aprobacion simultanea: 201 y 409', race.map((r) => r.status));

// ── 6. Lo aprobado no lo toca el autor; lo pendiente lo puede retirar ────
ok((await pedro('PATCH', `/transactions/${p1.body.id}`, { amount: 1 })).status === 403, 'Pedro no edita un aprobado (403)');
ok((await pedro('PATCH', `/approvals/${p1.body.id}`, { amount: 1 })).status === 409, 'ni por la bandeja (409)');
const p4 = await pedro('POST', '/transactions', gasto(2000, mn.id, 'check retirar'));
ok((await carlos('POST', `/approvals/${p4.body.id}/withdraw`)).status === 403, 'Carlos no retira lo de Pedro');
const wd = await pedro('POST', `/approvals/${p4.body.id}/withdraw`);
ok(wd.status === 201 && !(await seen(pedro, p4.body.id)), 'Pedro retira lo suyo y desaparece', wd.body);
ok((await pedro('PATCH', '/transactions/bulk', { ids: [p1.body.id], categoryId: null })).status === 403, 'Pedro no reclasifica en lote un aprobado');

// ── 7. Topes de Carlos ───────────────────────────────────────────────────
const c1 = await carlos('POST', '/transactions', gasto(1999999));
ok(c1.body?.status === 'APPROVED', 'Carlos: 19 999,99 MN entra solo', c1.body?.status);
const c2 = await carlos('POST', '/transactions', gasto(2000001));
ok(c2.body?.status === 'PENDING', 'Carlos: 20 000,01 MN espera', c2.body?.status);
const c3 = await carlos('POST', '/transactions', gasto(6000, usd.id));
ok(c3.body?.status === 'PENDING', 'Carlos: 60 USD espera (tope 50)', c3.body?.status);
const c4 = await carlos('POST', '/transactions', gasto(100, mlc.id));
ok(c4.body?.status === 'PENDING', 'Carlos: MLC sin tope espera', c4.body?.status);

// ── 8. Deudas ────────────────────────────────────────────────────────────
const dash0 = (await frank('GET', '/dashboard/overview')).body;
const d = await pedro('POST', '/debts', { personName: 'Check', description: 'check deuda', totalAmount: 300000, type: 'RECEIVABLE', accountId: mn.id, date: today });
ok(d.status === 201 && d.body.approvalStatus === 'PENDING', 'deuda de Pedro → pendiente', d.body);
const dash1 = (await frank('GET', '/dashboard/overview')).body;
ok((dash1.pendingDebtsReceivable.MN ?? 0) === (dash0.pendingDebtsReceivable.MN ?? 0), 'el panel aun no la cuenta en "te deben"');
ok((await pedro('POST', `/debts/${d.body.id}/payments`, { amount: 100, date: today, accountId: mn.id })).status === 400, 'no se paga una deuda pendiente');
const initial = (await frank('GET', '/approvals')).body.data.find((i) => i.debt?.id === d.body.id);
ok(initial?.kind === 'DEBT_CREATE', 'en la bandeja sale como "deuda nueva"', initial?.kind);
await frank('POST', `/approvals/${initial.id}/approve`, {});
ok((await frank('GET', `/debts/${d.body.id}`)).body.approvalStatus === 'APPROVED', 'aprobada la deuda');
const pay = await pedro('POST', `/debts/${d.body.id}/payments`, { amount: 100000, date: today, accountId: mn.id });
ok(pay.body?.status === 'PENDING', 'el pago de Pedro espera', pay.body);
ok((await frank('GET', `/debts/${d.body.id}`)).body.paidAmount === 0, 'lo pagado no sube hasta aprobarlo');
ok((await pedro('POST', `/debts/${d.body.id}/payments`, { amount: 250000, date: today, accountId: mn.id })).status === 400, 'un segundo pago que, con el pendiente, pasa del total → 400');
await ana('POST', `/approvals/${pay.body.id}/approve`, {});
const dPaid = (await frank('GET', `/debts/${d.body.id}`)).body;
ok(dPaid.paidAmount === 100000 && dPaid.status === 'PARTIAL', 'aprobado el pago: 1 000 pagado, parcial', { paid: dPaid.paidAmount, status: dPaid.status });

// ── 9. Autoconfirmar desde Organizacion ──────────────────────────────────
const members = (await frank('GET', `/organizations/${frank.org}/members`)).body;
const pedroMember = members.find((m) => m.user.email === 'pedro@prueba.ecoghost');
ok((await ana('PATCH', `/organizations/${frank.org}/members/${pedroMember.id}/approval`, { autoApprove: true, autoApproveLimits: { MN: 'mucho' } })).status === 400, 'tope no numerico → 400');
const set = await ana('PATCH', `/organizations/${frank.org}/members/${pedroMember.id}/approval`, { autoApprove: true, autoApproveLimits: { MN: 100000 } });
ok(set.status === 200 && set.body.autoApprove === true, 'Ana activa autoconfirmar a Pedro hasta 1 000 MN', set.body);
ok((await pedro('POST', '/transactions', gasto(50000))).body?.status === 'APPROVED', 'ahora 500 MN de Pedro entran solos');
const owner = members.find((m) => m.role === 'OWNER');
ok((await ana('PATCH', `/organizations/${frank.org}/members/${owner.id}/approval`, { autoApprove: true })).status === 400, 'autoconfirmar solo aplica a contadores');
await ana('PATCH', `/organizations/${frank.org}/members/${pedroMember.id}/approval`, { autoApprove: false });

console.log(failures ? `\n${failures} comprobaciones fallaron` : '\nTodo bien');
process.exit(failures ? 1 : 0);
