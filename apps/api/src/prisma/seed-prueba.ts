import { PrismaClient, Role, TransactionType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { DEFAULT_CATEGORIES } from '@ecoghost/shared';

/**
 * Datos sinteticos para el entorno de pruebas (apieco-prueba / eco-prueba).
 * Nada sale de produccion: usuarios, cuentas y movimientos son inventados.
 *
 * Borra y recrea las organizaciones "(prueba)", asi que se puede correr las
 * veces que haga falta. Se niega a correr si DATABASE_URL no parece de pruebas.
 *
 *   SEED_PASSWORD=... DATABASE_URL=... npx ts-node --compiler-options '{"module":"CommonJS"}' src/prisma/seed-prueba.ts
 */

const url = process.env.DATABASE_URL ?? '';
if (!/prueba|localhost|127\.0\.0\.1/.test(url)) {
  console.error('DATABASE_URL no es de pruebas; no toco nada.');
  process.exit(1);
}
const password = process.env.SEED_PASSWORD;
if (!password) {
  console.error('Falta SEED_PASSWORD (contrasena comun de los usuarios de prueba).');
  process.exit(1);
}

const prisma = new PrismaClient();

// PRNG con semilla: los mismos datos en cada corrida
let state = 20261016;
const rand = () => {
  state = (state * 1103515245 + 12345) & 0x7fffffff;
  return state / 0x7fffffff;
};
const between = (min: number, max: number) => Math.round(min + rand() * (max - min));
const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
// Montos en centavos; la mayoria enteros, algunos con centavos (como en la vida real)
const money = (min: number, max: number, cents = false) =>
  between(min, max) * 100 + (cents && rand() < 0.3 ? between(1, 99) : 0);

const USERS = [
  { email: 'frankernesto6587@gmail.com', name: 'Frank', role: Role.OWNER },
  { email: 'admin@prueba.ecoghost', name: 'Ana Admin', role: Role.ADMIN },
  { email: 'contable@prueba.ecoghost', name: 'Carlos Contable', role: Role.ACCOUNTANT },
  { email: 'lector@prueba.ecoghost', name: 'Lucia Lectora', role: Role.VIEWER },
];

async function main() {
  const passwordHash = await bcrypt.hash(password!, 10);
  const users = [];
  for (const u of USERS) {
    users.push(
      await prisma.user.upsert({
        where: { email: u.email },
        update: { name: u.name },
        create: { email: u.email, name: u.name, passwordHash, isVerified: true },
      }),
    );
  }
  const owner = users[0];

  await prisma.organization.deleteMany({ where: { slug: { in: ['casa-prueba', 'negocio-prueba'] } } });

  await seedCasa(users);
  await seedNegocio(owner.id);
  console.log('Listo. Usuarios:', USERS.map((u) => `${u.email} (${u.role})`).join(', '));
}

async function createCategories(orgId: string) {
  const byName = new Map<string, string>();
  for (const cat of DEFAULT_CATEGORIES) {
    const parent = await prisma.category.create({
      data: { name: cat.name, icon: cat.icon, color: cat.color, orgId },
    });
    byName.set(cat.name, parent.id);
    for (const child of cat.children) {
      const c = await prisma.category.create({
        data: { name: child.name, icon: child.icon, color: child.color, parentId: parent.id, orgId },
      });
      byName.set(child.name, c.id);
    }
  }
  const ajuste = await prisma.category.create({
    data: { name: 'Saldo inicial', icon: 'bank', isAdjustment: true, orgId },
  });
  byName.set('Saldo inicial', ajuste.id);
  const prestamos = await prisma.category.create({ data: { name: 'Prestamos', icon: 'transaction', orgId } });
  byName.set('Prestamos', prestamos.id);
  return (name: string) => {
    const id = byName.get(name);
    if (!id) throw new Error(`Categoria ${name} no existe`);
    return id;
  };
}

type Tx = {
  date: Date;
  description: string;
  amount: number;
  type: TransactionType;
  accountId: string;
  categoryId?: string;
  debtId?: string;
  tagIds?: string[];
  deletedAt?: Date;
  deleteReason?: string;
};

async function seedCasa(users: { id: string }[]) {
  const [owner] = users;
  const org = await prisma.organization.create({
    data: { name: 'Casa (prueba)', slug: 'casa-prueba', baseCurrency: 'MN' },
  });
  const orgId = org.id;
  await prisma.orgMember.createMany({
    data: users.map((u, i) => ({ userId: u.id, orgId, role: USERS[i].role })),
  });

  // Sin icono: la web muestra las iniciales de la cuenta
  const acc = async (name: string, type: 'CASH' | 'BANK' | 'DIGITAL', currency: string) =>
    (await prisma.account.create({ data: { name, type, currency, orgId } })).id;
  const efectivoMN = await acc('Efectivo MN', 'CASH', 'MN');
  const bandec = await acc('BANDEC', 'BANK', 'MN');
  const efectivoUSD = await acc('Efectivo USD', 'CASH', 'USD');
  const zelle = await acc('Zelle', 'DIGITAL', 'USD');
  const mlc = await acc('Tarjeta MLC', 'BANK', 'MLC');
  await prisma.organization.update({ where: { id: orgId }, data: { defaultAccountId: efectivoMN } });

  const cat = await createCategories(orgId);
  const tag = async (name: string, color: string) =>
    (await prisma.tag.create({ data: { name, color, orgId } })).id;
  const fijo = await tag('fijo', '#1F6B4A');
  const abuela = await tag('abuela', '#D8B46A');
  const viaje = await tag('viaje-varadero', '#6d95ee');

  const txs: Tx[] = [];
  const now = new Date();
  const day = (monthsAgo: number, d: number) => {
    const date = new Date(now.getFullYear(), now.getMonth() - monthsAgo, d, between(8, 20), between(0, 59));
    return date > now ? null : date;
  };
  const push = (date: Date | null, t: Omit<Tx, 'date'>) => date && txs.push({ date, ...t });

  // Saldos iniciales hace 6 meses
  for (const [accountId, amount] of [
    [efectivoMN, 4500000],
    [bandec, 12000000],
    [efectivoUSD, 80000],
    [zelle, 120000],
    [mlc, 35000],
  ] as const) {
    push(day(6, 1), { description: 'Saldo inicial', amount, type: 'INCOME', accountId, categoryId: cat('Saldo inicial') });
  }

  for (let m = 5; m >= 0; m--) {
    push(day(m, 5), { description: 'Salario', amount: 4500000, type: 'INCOME', accountId: bandec, categoryId: cat('Salario'), tagIds: [fijo] });
    push(day(m, between(8, 14)), { description: pick(['Diseno logo', 'Pagina web', 'Soporte mensual']), amount: money(150, 400), type: 'INCOME', accountId: zelle, categoryId: cat('Freelance') });
    push(day(m, 3), { description: 'Alquiler', amount: 1500000, type: 'EXPENSE', accountId: efectivoMN, categoryId: cat('Alquiler'), tagIds: [fijo] });
    push(day(m, 10), { description: 'Corriente', amount: money(800, 2600), type: 'EXPENSE', accountId: bandec, categoryId: cat('Servicios'), tagIds: [fijo] });
    push(day(m, 12), { description: 'Nauta Hogar', amount: 3000, type: 'EXPENSE', accountId: efectivoUSD, categoryId: cat('Internet'), tagIds: [fijo] });
    push(day(m, 15), { description: 'Recarga Cubacel', amount: money(10, 25), type: 'EXPENSE', accountId: zelle, categoryId: cat('Telefono') });
    push(day(m, 20), { description: 'Medicinas abuela', amount: money(1500, 4000), type: 'EXPENSE', accountId: efectivoMN, categoryId: cat('Salud'), tagIds: [abuela] });

    for (let w = 0; w < 4; w++) {
      push(day(m, 2 + w * 7), { description: pick(['Agro', 'Mipyme Los Pinos', 'Carniceria', 'Bodega']), amount: money(2500, 9000), type: 'EXPENSE', accountId: efectivoMN, categoryId: cat('Mercado') });
      push(day(m, 4 + w * 7), { description: pick(['Almendron', 'Gasolina', 'Taxi colectivo']), amount: money(400, 3000), type: 'EXPENSE', accountId: efectivoMN, categoryId: cat(pick(['Transporte publico', 'Combustible'])) });
      if (rand() < 0.5) {
        push(day(m, 6 + w * 7), { description: pick(['Pizzeria', 'Cafeteria', 'Paladar']), amount: money(1200, 6000), type: 'EXPENSE', accountId: efectivoMN, categoryId: cat('Restaurantes') });
      }
    }
    push(day(m, 18), { description: 'Paquete combo', amount: money(40, 90, true), type: 'EXPENSE', accountId: zelle, categoryId: cat('Delivery') });
  }

  // Viaje (hace 2 meses), etiquetado
  push(day(2, 22), { description: 'Hotel Varadero', amount: 32000, type: 'EXPENSE', accountId: mlc, categoryId: cat('Entretenimiento'), tagIds: [viaje] });
  push(day(2, 23), { description: 'Comidas viaje', amount: 2500000, type: 'EXPENSE', accountId: efectivoMN, categoryId: cat('Restaurantes'), tagIds: [viaje] });
  // Un movimiento eliminado, para probar la papelera
  push(day(0, 1), { description: 'Mercado duplicado', amount: 450000, type: 'EXPENSE', accountId: efectivoMN, categoryId: cat('Mercado'), deletedAt: now, deleteReason: 'Duplicado' });

  // Deudas
  const debtElvis = await prisma.debt.create({
    data: { personName: 'Elvis', description: 'Prestamo para la moto', totalAmount: 50000, type: 'RECEIVABLE', orgId },
  });
  const debtTio = await prisma.debt.create({
    data: { personName: 'Tio Ramon', description: 'Materiales del bano', totalAmount: 6000000, type: 'PAYABLE', orgId, dueDate: new Date(now.getFullYear(), now.getMonth() + 1, 15) },
  });
  const debtMaria = await prisma.debt.create({
    data: { personName: 'Maria', description: 'Adelanto de cumpleanos', totalAmount: 1000000, type: 'RECEIVABLE', orgId },
  });
  // Pagos (los mismos movimientos que crearia debts.service.addPayment)
  const payments = [
    { debt: debtElvis, amount: 15000, accountId: efectivoUSD, date: day(3, 10) },
    { debt: debtElvis, amount: 10000, accountId: efectivoUSD, date: day(1, 10) },
    { debt: debtMaria, amount: 1000000, accountId: efectivoMN, date: day(1, 25) },
    { debt: debtTio, amount: 1500000, accountId: bandec, date: day(0, 2) },
  ];
  for (const p of payments) {
    push(p.date, {
      description: `Pago: ${p.debt.description}`,
      amount: p.amount,
      type: p.debt.type === 'RECEIVABLE' ? 'INCOME' : 'EXPENSE',
      accountId: p.accountId,
      categoryId: cat('Prestamos'),
      debtId: p.debt.id,
    });
  }
  for (const d of [debtElvis, debtTio, debtMaria]) {
    const paid = payments.filter((p) => p.debt.id === d.id && p.date).reduce((s, p) => s + p.amount, 0);
    await prisma.debt.update({
      where: { id: d.id },
      data: { paidAmount: paid, status: paid === 0 ? 'PENDING' : paid >= d.totalAmount ? 'PAID' : 'PARTIAL' },
    });
  }

  for (const t of txs.sort((a, b) => a.date.getTime() - b.date.getTime())) {
    const { tagIds, ...data } = t;
    await prisma.transaction.create({
      data: {
        ...data,
        orgId,
        createdBy: owner.id,
        source: 'seed-prueba',
        ...(tagIds?.length && { tags: { create: tagIds.map((tagId) => ({ tagId })) } }),
      },
    });
  }

  // Transferencias y cambios: dos patas enlazadas, como transactions.service
  const pair = async (type: 'TRANSFER' | 'EXCHANGE', date: Date | null, description: string, from: string, amount: number, to: string, toAmount = amount) => {
    if (!date) return;
    const inc = await prisma.transaction.create({
      data: { date, description, amount: toAmount, type, accountId: to, orgId, createdBy: owner.id, source: 'seed-prueba' },
    });
    await prisma.transaction.create({
      data: { date, description, amount, type, accountId: from, linkedTransactionId: inc.id, orgId, createdBy: owner.id, source: 'seed-prueba' },
    });
  };
  for (let m = 5; m >= 0; m--) {
    await pair('TRANSFER', day(m, 6), 'Extraccion cajero', bandec, 3500000, efectivoMN);
  }
  await pair('EXCHANGE', day(4, 9), 'Cambio USD a MN', efectivoUSD, 20000, efectivoMN, 7200000);
  await pair('EXCHANGE', day(1, 9), 'Cambio USD a MN', efectivoUSD, 10000, efectivoMN, 3800000);
  await pair('EXCHANGE', day(2, 16), 'Recarga MLC', zelle, 30000, mlc, 30000);

  // Presupuestos (reglas con ventana de meses)
  const ym = (monthsAgo: number) => {
    const d = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };
  await prisma.budget.createMany({
    data: [
      { categoryId: cat('Alimentacion'), currency: 'MN', amount: 4000000, startMonth: ym(5), orgId, createdBy: owner.id },
      { categoryId: cat('Transporte'), currency: 'MN', amount: 800000, startMonth: ym(5), endMonth: ym(2), orgId, createdBy: owner.id },
      { categoryId: cat('Transporte'), currency: 'MN', amount: 1000000, startMonth: ym(1), orgId, createdBy: owner.id, notes: 'Subio el almendron' },
      { categoryId: null, currency: 'USD', amount: 30000, startMonth: ym(3), rollover: true, orgId, createdBy: owner.id },
    ],
  });

  await prisma.project.create({
    data: { name: 'Arreglo del bano', budget: 9000000, startDate: new Date(now.getFullYear(), now.getMonth() - 2, 1), orgId },
  });

  console.log(`  Casa (prueba): ${await prisma.transaction.count({ where: { orgId } })} movimientos`);
}

async function seedNegocio(ownerId: string) {
  const org = await prisma.organization.create({
    data: { name: 'Negocio (prueba)', slug: 'negocio-prueba', baseCurrency: 'USD' },
  });
  const orgId = org.id;
  await prisma.orgMember.create({ data: { userId: ownerId, orgId, role: Role.OWNER } });
  const caja = await prisma.account.create({ data: { name: 'Caja', type: 'CASH', currency: 'USD', orgId } });
  const cat = await createCategories(orgId);
  const now = new Date();
  await prisma.transaction.create({
    data: { date: new Date(now.getTime() - 61 * 86400000), description: 'Saldo inicial', amount: 50000, type: 'INCOME', accountId: caja.id, categoryId: cat('Saldo inicial'), orgId, createdBy: ownerId, source: 'seed-prueba' },
  });
  for (let i = 0; i < 40; i++) {
    const date = new Date(now.getTime() - between(0, 60) * 86400000);
    const venta = rand() < 0.65;
    await prisma.transaction.create({
      data: {
        date,
        description: venta ? pick(['Venta mostrador', 'Venta por WhatsApp', 'Encargo']) : pick(['Mercancia', 'Flete', 'Bolsas']),
        amount: venta ? money(20, 150, true) : money(10, 120),
        type: venta ? 'INCOME' : 'EXPENSE',
        accountId: caja.id,
        categoryId: cat(venta ? 'Ventas' : 'Otros gastos'),
        orgId,
        createdBy: ownerId,
        source: 'seed-prueba',
      },
    });
  }
  console.log('  Negocio (prueba): 41 movimientos');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
