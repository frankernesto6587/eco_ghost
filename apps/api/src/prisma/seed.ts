import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Seed script for development.
 * Creates a demo user, organization, accounts, and sample data.
 * Run with: pnpm db:seed
 */
async function main() {
  console.log('Seeding database...');

  // Demo user (password: "demo1234" hashed with bcrypt 10 rounds)
  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@ecoghost.app' },
    update: {},
    create: {
      email: 'demo@ecoghost.app',
      name: 'Demo User',
      // bcrypt hash of "demo1234"
      passwordHash:
        '$2b$10$dj0IGRezQ1pmQAfrhhRQw.0q/XrW/HJ83Imbxnn.n8ntDGs.qaL9u',
      isVerified: true,
    },
  });

  console.log(`  User: ${demoUser.email}`);

  // Demo organization
  const demoOrg = await prisma.organization.upsert({
    where: { slug: 'demo-finanzas' },
    update: {},
    create: {
      name: 'Demo Finanzas',
      slug: 'demo-finanzas',
      baseCurrency: 'USD',
    },
  });

  console.log(`  Organization: ${demoOrg.name}`);

  // Make user owner of the org
  await prisma.orgMember.upsert({
    where: {
      userId_orgId: { userId: demoUser.id, orgId: demoOrg.id },
    },
    update: {},
    create: {
      userId: demoUser.id,
      orgId: demoOrg.id,
      role: 'OWNER',
    },
  });

  // Create default accounts
  const usdCash = await prisma.account.upsert({
    where: { id: 'seed-account-usd' },
    update: {},
    create: {
      id: 'seed-account-usd',
      name: 'Efectivo USD',
      type: 'CASH',
      currency: 'USD',
      icon: 'dollar',
      orgId: demoOrg.id,
    },
  });

  const mnCash = await prisma.account.upsert({
    where: { id: 'seed-account-mn' },
    update: {},
    create: {
      id: 'seed-account-mn',
      name: 'Efectivo MN',
      type: 'CASH',
      currency: 'MN',
      icon: 'wallet',
      orgId: demoOrg.id,
    },
  });

  console.log(`  Accounts: ${usdCash.name}, ${mnCash.name}`);

  // Seed default categories
  const defaultCategories = [
    {
      name: 'Ingresos',
      icon: 'dollar',
      color: '#52c41a',
      children: [
        { name: 'Salario', icon: 'wallet', color: '#52c41a' },
        { name: 'Ventas', icon: 'shop', color: '#52c41a' },
        { name: 'Freelance', icon: 'laptop', color: '#52c41a' },
        { name: 'Otros ingresos', icon: 'plus-circle', color: '#52c41a' },
      ],
    },
    {
      name: 'Vivienda',
      icon: 'home',
      color: '#1890ff',
      children: [
        { name: 'Alquiler', icon: 'home', color: '#1890ff' },
        { name: 'Servicios', icon: 'thunderbolt', color: '#1890ff' },
        { name: 'Construccion', icon: 'build', color: '#1890ff' },
      ],
    },
    {
      name: 'Alimentacion',
      icon: 'coffee',
      color: '#fa8c16',
      children: [
        { name: 'Mercado', icon: 'shopping-cart', color: '#fa8c16' },
        { name: 'Restaurantes', icon: 'coffee', color: '#fa8c16' },
      ],
    },
    {
      name: 'Transporte',
      icon: 'car',
      color: '#722ed1',
      children: [
        { name: 'Combustible', icon: 'fire', color: '#722ed1' },
        { name: 'Transporte publico', icon: 'swap', color: '#722ed1' },
      ],
    },
    {
      name: 'Familia',
      icon: 'team',
      color: '#eb2f96',
      children: [
        { name: 'Educacion', icon: 'read', color: '#eb2f96' },
        { name: 'Salud', icon: 'heart', color: '#eb2f96' },
        { name: 'Entretenimiento', icon: 'smile', color: '#eb2f96' },
      ],
    },
    {
      name: 'Tecnologia',
      icon: 'laptop',
      color: '#13c2c2',
      children: [
        { name: 'Internet', icon: 'wifi', color: '#13c2c2' },
        { name: 'Equipos', icon: 'desktop', color: '#13c2c2' },
      ],
    },
    {
      name: 'Otros gastos',
      icon: 'ellipsis',
      color: '#8c8c8c',
      children: [],
    },
  ];

  let categoryCount = 0;
  for (const cat of defaultCategories) {
    const parent = await prisma.category.create({
      data: {
        name: cat.name,
        icon: cat.icon,
        color: cat.color,
        orgId: demoOrg.id,
      },
    });
    categoryCount++;

    for (const child of cat.children) {
      await prisma.category.create({
        data: {
          name: child.name,
          icon: child.icon,
          color: child.color,
          parentId: parent.id,
          orgId: demoOrg.id,
        },
      });
      categoryCount++;
    }
  }

  console.log(`  Categories: ${categoryCount} created`);

  // Sample transactions
  const now = new Date();
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const sampleTransactions = [
    {
      date: new Date(thisMonth.getTime() + 1 * 86400000),
      description: 'Salario mensual',
      amount: 300000, // $3,000.00 in cents
      type: 'INCOME' as const,
      accountId: usdCash.id,
    },
    {
      date: new Date(thisMonth.getTime() + 3 * 86400000),
      description: 'Compra mercado',
      amount: 15000, // $150.00
      type: 'EXPENSE' as const,
      accountId: usdCash.id,
    },
    {
      date: new Date(thisMonth.getTime() + 5 * 86400000),
      description: 'Internet mensual',
      amount: 5000, // $50.00
      type: 'EXPENSE' as const,
      accountId: usdCash.id,
    },
    {
      date: new Date(thisMonth.getTime() + 7 * 86400000),
      description: 'Venta freelance',
      amount: 50000, // $500.00
      type: 'INCOME' as const,
      accountId: usdCash.id,
    },
    {
      date: new Date(thisMonth.getTime() + 2 * 86400000),
      description: 'Salario MN',
      amount: 72750000, // 727,500 MN in centavos
      type: 'INCOME' as const,
      accountId: mnCash.id,
    },
    {
      date: new Date(thisMonth.getTime() + 4 * 86400000),
      description: 'Gastos casa',
      amount: 2000000, // 20,000 MN
      type: 'EXPENSE' as const,
      accountId: mnCash.id,
    },
  ];

  for (const tx of sampleTransactions) {
    await prisma.transaction.create({
      data: {
        ...tx,
        orgId: demoOrg.id,
        createdBy: demoUser.id,
      },
    });
  }

  console.log(`  Transactions: ${sampleTransactions.length} created`);

  // Sample debt
  await prisma.debt.create({
    data: {
      personName: 'Elvis',
      description: 'Prestamo para negocio',
      totalAmount: 200000, // $2,000.00
      type: 'RECEIVABLE',
      orgId: demoOrg.id,
    },
  });

  console.log('  Debts: 1 created');
  console.log('Seed complete!');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
