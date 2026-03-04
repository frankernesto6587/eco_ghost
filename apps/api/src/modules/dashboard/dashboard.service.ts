import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(orgId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    // Get all active accounts
    const accounts = await this.prisma.account.findMany({
      where: { orgId, isActive: true },
      select: { id: true, currency: true },
    });

    // Single query: aggregate all transactions grouped by account + type
    const accountIds = accounts.map((a) => a.id);
    const balanceRows = await this.prisma.transaction.groupBy({
      by: ['accountId', 'type'],
      where: { orgId, accountId: { in: accountIds } },
      _sum: { amount: true },
    });

    // Build currency map for accounts
    const currencyMap = new Map(accounts.map((a) => [a.id, a.currency]));

    // Aggregate balances by currency
    const totalBalance: Record<string, number> = {};
    for (const row of balanceRows) {
      const currency = currencyMap.get(row.accountId) ?? 'USD';
      const amount = row._sum.amount ?? 0;
      const sign = row.type === 'INCOME' ? 1 : -1;
      totalBalance[currency] = (totalBalance[currency] ?? 0) + sign * amount;
    }

    // Month income grouped by currency
    const monthTransactions = await this.prisma.transaction.findMany({
      where: {
        orgId,
        type: { in: ['INCOME', 'EXPENSE'] },
        date: { gte: startOfMonth, lte: endOfMonth },
      },
      include: { account: { select: { currency: true } } },
    });

    const monthIncome: Record<string, number> = {};
    const monthExpense: Record<string, number> = {};

    for (const tx of monthTransactions) {
      const currency = tx.account.currency;
      if (tx.type === 'INCOME') {
        monthIncome[currency] = (monthIncome[currency] ?? 0) + tx.amount;
      } else {
        monthExpense[currency] = (monthExpense[currency] ?? 0) + tx.amount;
      }
    }

    // Pending debts grouped by currency (derived from first transaction's account)
    const pendingDebts = await this.prisma.debt.findMany({
      where: {
        orgId,
        status: { in: ['PENDING', 'PARTIAL'] },
      },
      include: {
        transactions: {
          take: 1,
          orderBy: { createdAt: 'asc' },
          include: { account: { select: { currency: true } } },
        },
      },
    });

    const pendingDebtsReceivable: Record<string, number> = {};
    const pendingDebtsPayable: Record<string, number> = {};

    for (const debt of pendingDebts) {
      const currency = debt.transactions[0]?.account?.currency ?? 'USD';
      const remaining = debt.totalAmount - debt.paidAmount;
      if (debt.type === 'RECEIVABLE') {
        pendingDebtsReceivable[currency] = (pendingDebtsReceivable[currency] ?? 0) + remaining;
      } else {
        pendingDebtsPayable[currency] = (pendingDebtsPayable[currency] ?? 0) + remaining;
      }
    }

    // Active projects count
    const activeProjects = await this.prisma.project.count({
      where: { orgId, status: 'ACTIVE' },
    });

    // Recent transactions (last 10)
    const recentTransactions = await this.prisma.transaction.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        category: true,
        account: true,
      },
    });

    // Monthly trend: income/expense per month for the last 6 months
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const trendTransactions = await this.prisma.transaction.findMany({
      where: {
        orgId,
        type: { in: ['INCOME', 'EXPENSE'] },
        date: { gte: sixMonthsAgo, lte: endOfMonth },
      },
      select: { date: true, amount: true, type: true },
    });

    const trendMap = new Map<string, { income: number; expense: number }>();
    for (const tx of trendTransactions) {
      const key = `${tx.date.getFullYear()}-${String(tx.date.getMonth() + 1).padStart(2, '0')}`;
      const entry = trendMap.get(key) ?? { income: 0, expense: 0 };
      if (tx.type === 'INCOME') {
        entry.income += tx.amount;
      } else {
        entry.expense += tx.amount;
      }
      trendMap.set(key, entry);
    }

    // Get org creation date to determine chart start
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { createdAt: true },
    });
    const orgCreatedAt = org?.createdAt ?? sixMonthsAgo;

    const monthlyTrend: { month: string; income: number; expense: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      if (d < new Date(orgCreatedAt.getFullYear(), orgCreatedAt.getMonth(), 1)) {
        continue; // skip months before org was created
      }
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const entry = trendMap.get(key) ?? { income: 0, expense: 0 };
      monthlyTrend.push({ month: key, ...entry });
    }

    return {
      totalBalance,
      monthIncome,
      monthExpense,
      pendingDebtsReceivable,
      pendingDebtsPayable,
      activeProjects,
      recentTransactions,
      monthlyTrend,
    };
  }
}
