import { PrismaClient } from '@prisma/client';
import { DEFAULT_CATEGORIES } from '@ecoghost/shared';

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

  // Seed default categories (fuente unica: @ecoghost/shared)
  const defaultCategories = DEFAULT_CATEGORIES;

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
