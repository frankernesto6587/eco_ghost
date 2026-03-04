import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { CreateAccountDto, UpdateAccountDto } from './dto';

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
  ) {}

  async create(orgId: string, dto: CreateAccountDto) {
    const account = await this.prisma.account.create({
      data: {
        name: dto.name,
        type: dto.type,
        currency: dto.currency,
        icon: dto.icon,
        orgId,
      },
    });

    this.telegram.notify(orgId, `🏦 *Nueva cuenta*\n${account.name} (${account.currency})\nSaldo: 0.00 ${account.currency}`);

    return account;
  }

  async findAll(orgId: string) {
    const accounts = await this.prisma.account.findMany({
      where: { orgId, isActive: true },
      orderBy: { name: 'asc' },
    });

    const accountIds = accounts.map((a) => a.id);

    // Single query: aggregate income/expense grouped by account + type
    const balances = await this.prisma.transaction.groupBy({
      by: ['accountId', 'type'],
      where: { orgId, accountId: { in: accountIds } },
      _sum: { amount: true },
    });

    // Build a balance map: accountId → balance
    const balanceMap = new Map<string, number>();
    for (const row of balances) {
      const current = balanceMap.get(row.accountId) ?? 0;
      const amount = row._sum.amount ?? 0;
      if (row.type === 'INCOME') {
        balanceMap.set(row.accountId, current + amount);
      } else if (row.type === 'EXPENSE') {
        balanceMap.set(row.accountId, current - amount);
      }
    }

    return accounts.map((account) => ({
      ...account,
      balance: balanceMap.get(account.id) ?? 0,
    }));
  }

  async findOne(orgId: string, id: string) {
    const account = await this.prisma.account.findFirst({
      where: { id, orgId },
    });

    if (!account) {
      throw new NotFoundException(`Account with id ${id} not found`);
    }

    const balance = await this.computeBalance(account.id, orgId);
    return { ...account, balance };
  }

  async update(orgId: string, id: string, dto: UpdateAccountDto) {
    const account = await this.prisma.account.findFirst({
      where: { id, orgId },
    });

    if (!account) {
      throw new NotFoundException(`Account with id ${id} not found`);
    }

    return this.prisma.account.update({
      where: { id },
      data: dto,
    });
  }

  async remove(orgId: string, id: string) {
    const account = await this.prisma.account.findFirst({
      where: { id, orgId },
    });

    if (!account) {
      throw new NotFoundException(`Account with id ${id} not found`);
    }

    const balance = await this.computeBalance(id, orgId);
    const fmt = (n: number) => (n / 100).toFixed(2);

    const result = await this.prisma.account.update({
      where: { id },
      data: { isActive: false },
    });

    this.telegram.notify(orgId, `🗑 *Cuenta desactivada*\n${account.name} (${account.currency})\nSaldo final: ${fmt(balance)} ${account.currency}`);

    return result;
  }

  private async computeBalance(accountId: string, orgId: string): Promise<number> {
    const income = await this.prisma.transaction.aggregate({
      where: { accountId, orgId, type: 'INCOME' },
      _sum: { amount: true },
    });

    const expense = await this.prisma.transaction.aggregate({
      where: { accountId, orgId, type: 'EXPENSE' },
      _sum: { amount: true },
    });

    const totalIncome = income._sum.amount ?? 0;
    const totalExpense = expense._sum.amount ?? 0;

    return totalIncome - totalExpense;
  }
}
