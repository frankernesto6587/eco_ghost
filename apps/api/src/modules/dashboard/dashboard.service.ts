import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveRange, dayKey, dayLabels, toDayLabel } from '../../common/date-range.util';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(orgId: string, from?: string, to?: string) {
    const now = new Date();
    // Fronteras del rango en APP_TZ. `rangeEnd` es EXCLUSIVO: se compara con `lt`.
    const range = resolveRange(toDayLabel(from), toDayLabel(to));
    const startOfMonth = range.from;
    const rangeEnd = range.to;

    // Get all active accounts
    const accounts = await this.prisma.account.findMany({
      where: { orgId, isActive: true },
      select: { id: true, currency: true },
    });

    const accountIds = accounts.map((a) => a.id);

    // Build currency map for accounts
    const currencyMap = new Map(accounts.map((a) => [a.id, a.currency]));

    // Month income grouped by currency
    const monthTransactions = await this.prisma.transaction.findMany({
      where: {
        orgId,
        type: { in: ['INCOME', 'EXPENSE'] },
        date: { gte: startOfMonth, lt: rangeEnd },
        deletedAt: null,
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

    // Helper: compute balance map from a base where clause
    const computeBalanceMap = async (baseWhere: any) => {
      const [ieRows, transferInRows, transferOutRows] = await Promise.all([
        this.prisma.transaction.groupBy({
          by: ['accountId', 'type'],
          where: { ...baseWhere, type: { in: ['INCOME', 'EXPENSE'] } },
          _sum: { amount: true },
        }),
        this.prisma.transaction.groupBy({
          by: ['accountId'],
          where: { ...baseWhere, type: { in: ['TRANSFER', 'EXCHANGE'] }, linkedTransactionId: null },
          _sum: { amount: true },
        }),
        this.prisma.transaction.groupBy({
          by: ['accountId'],
          where: { ...baseWhere, type: { in: ['TRANSFER', 'EXCHANGE'] }, linkedTransactionId: { not: null } },
          _sum: { amount: true },
        }),
      ]);

      const map = new Map<string, number>();
      for (const row of ieRows) {
        const sign = row.type === 'INCOME' ? 1 : -1;
        map.set(row.accountId, (map.get(row.accountId) ?? 0) + sign * (row._sum.amount ?? 0));
      }
      for (const row of transferInRows) {
        map.set(row.accountId, (map.get(row.accountId) ?? 0) + (row._sum.amount ?? 0));
      }
      for (const row of transferOutRows) {
        map.set(row.accountId, (map.get(row.accountId) ?? 0) - (row._sum.amount ?? 0));
      }
      return map;
    };

    const baseWhere = { orgId, accountId: { in: accountIds }, deletedAt: null };

    // Current account balances
    const accountBalanceMap = await computeBalanceMap(baseWhere);

    // Balance 30 days ago
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const balanceMap30d = await computeBalanceMap({ ...baseWhere, date: { lte: thirtyDaysAgo } });

    const balance30dAgo: Record<string, number> = {};
    for (const [accId, bal] of balanceMap30d) {
      const currency = currencyMap.get(accId) ?? 'USD';
      balance30dAgo[currency] = (balance30dAgo[currency] ?? 0) + bal;
    }

    const allAccounts = await this.prisma.account.findMany({
      where: { orgId, isActive: true },
      select: { id: true, name: true, currency: true },
      orderBy: { name: 'asc' },
    });

    const accountBalances = allAccounts
      .map((a) => ({
        id: a.id,
        name: a.name,
        currency: a.currency,
        balance: accountBalanceMap.get(a.id) ?? 0,
      }))
      .filter((a) => a.balance !== 0);

    // Total balance by currency (derived from correct per-account balances)
    const totalBalance: Record<string, number> = {};
    for (const [accId, bal] of accountBalanceMap) {
      const currency = currencyMap.get(accId) ?? 'USD';
      totalBalance[currency] = (totalBalance[currency] ?? 0) + bal;
    }

    // Range balance: net of transactions within the selected range
    const rangeBalance: Record<string, number> = {};
    for (const cur of Object.keys({ ...monthIncome, ...monthExpense })) {
      rangeBalance[cur] = (monthIncome[cur] ?? 0) - (monthExpense[cur] ?? 0);
    }

    // Active projects count
    const activeProjects = await this.prisma.project.count({
      where: { orgId, status: 'ACTIVE' },
    });

    // Recent transactions (last 10)
    const recentTransactions = await this.prisma.transaction.findMany({
      where: { orgId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        category: true,
        account: true,
      },
    });

    // Daily balance trend per currency for the selected range
    // 1. Starting balance per currency (all tx before range start)
    const startBalanceMap = await computeBalanceMap({
      ...baseWhere,
      date: { lt: startOfMonth },
    });

    const startBalanceByCur: Record<string, number> = {};
    for (const [accId, bal] of startBalanceMap) {
      const cur = currencyMap.get(accId) ?? 'USD';
      startBalanceByCur[cur] = (startBalanceByCur[cur] ?? 0) + bal;
    }

    // 2. All transactions in the range to compute daily deltas
    const rangeTxs = await this.prisma.transaction.findMany({
      where: {
        orgId,
        accountId: { in: accountIds },
        deletedAt: null,
        date: { gte: startOfMonth, lt: rangeEnd },
      },
      select: { date: true, amount: true, type: true, accountId: true, linkedTransactionId: true },
      orderBy: { date: 'asc' },
    });

    // Build daily deltas per currency
    const dailyDeltas = new Map<string, Map<string, number>>(); // date -> currency -> delta
    for (const tx of rangeTxs) {
      const key = dayKey(tx.date);
      const cur = currencyMap.get(tx.accountId) ?? 'USD';
      if (!dailyDeltas.has(key)) dailyDeltas.set(key, new Map());
      const dayMap = dailyDeltas.get(key)!;

      let sign: number;
      if (tx.type === 'INCOME') sign = 1;
      else if (tx.type === 'EXPENSE') sign = -1;
      else if (tx.linkedTransactionId) sign = -1; // outgoing transfer
      else sign = 1; // incoming transfer

      dayMap.set(cur, (dayMap.get(cur) ?? 0) + sign * tx.amount);
    }

    // 3. Build daily balance array
    const allCurrencies = new Set<string>([
      ...Object.keys(startBalanceByCur),
      ...Object.keys(totalBalance),
    ]);

    const dailyBalance: { date: string; balances: Record<string, number> }[] = [];
    const running: Record<string, number> = {};
    for (const cur of allCurrencies) {
      running[cur] = startBalanceByCur[cur] ?? 0;
    }

    // Un item por dia del rango, recorriendo etiquetas de calendario en APP_TZ.
    // Avanzar el cursor en UTC repetiria el dia del cambio de horario y dejaria
    // fuera el ultimo del rango.
    for (const key of dayLabels(range.from, range.days)) {
      const dayMap = dailyDeltas.get(key);
      if (dayMap) {
        for (const [cur, delta] of dayMap) {
          running[cur] = (running[cur] ?? 0) + delta;
        }
      }
      dailyBalance.push({ date: key, balances: { ...running } });
    }

    return {
      totalBalance,
      rangeBalance,
      balance30dAgo,
      accountBalances,
      monthIncome,
      monthExpense,
      pendingDebtsReceivable,
      pendingDebtsPayable,
      activeProjects,
      recentTransactions,
      dailyBalance,
    };
  }
}
