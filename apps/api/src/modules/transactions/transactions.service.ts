import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import {
  CreateTransactionDto,
  UpdateTransactionDto,
  TransactionQueryDto,
} from './dto';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
  ) {}

  async create(orgId: string, userId: string, dto: CreateTransactionDto) {
    // TRANSFER requires a destination account
    if (dto.type === 'TRANSFER') {
      if (!dto.toAccountId) {
        throw new BadRequestException('toAccountId is required for TRANSFER transactions');
      }
      if (dto.toAccountId === dto.accountId) {
        throw new BadRequestException('Source and destination accounts must be different');
      }

      // Create both sides atomically
      // Outgoing holds the FK (linkedTransactionId) pointing to incoming
      const [outgoing] = await this.prisma.$transaction(async (tx) => {
        // 1. Create the incoming side (destination account) first
        const inc = await tx.transaction.create({
          data: {
            date: new Date(dto.date),
            description: dto.description,
            amount: dto.amount,
            type: 'TRANSFER',
            notes: dto.notes,
            categoryId: dto.categoryId,
            accountId: dto.toAccountId!,
            projectId: dto.projectId,
            orgId,
            createdBy: userId,
          },
        });

        // 2. Create the outgoing side (source account), linked to incoming
        const out = await tx.transaction.create({
          data: {
            date: new Date(dto.date),
            description: dto.description,
            amount: dto.amount,
            type: 'TRANSFER',
            notes: dto.notes,
            categoryId: dto.categoryId,
            accountId: dto.accountId,
            projectId: dto.projectId,
            linkedTransactionId: inc.id,
            orgId,
            createdBy: userId,
          },
        });

        return [out, inc];
      });

      // Return the outgoing transaction with relations
      const result = await this.prisma.transaction.findUniqueOrThrow({
        where: { id: outgoing.id },
        include: {
          category: true,
          account: true,
          project: true,
          debt: true,
          linkedTransaction: { include: { account: true } },
        },
      });

      // Compute balances of both accounts for notification
      const [srcBalance, dstBalance] = await Promise.all([
        this.computeBalance(dto.accountId, orgId),
        this.computeBalance(dto.toAccountId!, orgId),
      ]);
      const dstAccount = result.linkedTransaction?.account;
      const fmt = (n: number) => (n / 100).toFixed(2);
      this.telegram.notify(orgId, `🔄 *Transferencia*\n${dto.description}\nMonto: ${fmt(dto.amount)} ${result.account.currency}\nDe: ${result.account.name} → Saldo: ${fmt(srcBalance)} ${result.account.currency}\nA: ${dstAccount?.name ?? '?'} → Saldo: ${fmt(dstBalance)} ${dstAccount?.currency ?? ''}`);

      return result;
    }

    // INCOME / EXPENSE — simple create
    const tx = await this.prisma.transaction.create({
      data: {
        date: new Date(dto.date),
        description: dto.description,
        amount: dto.amount,
        type: dto.type,
        notes: dto.notes,
        categoryId: dto.categoryId,
        accountId: dto.accountId,
        projectId: dto.projectId,
        debtId: dto.debtId,
        orgId,
        createdBy: userId,
      },
      include: {
        category: true,
        account: true,
        project: true,
        debt: true,
      },
    });

    const icon = dto.type === 'INCOME' ? '💵' : '💸';
    const label = dto.type === 'INCOME' ? 'Ingreso' : 'Gasto';
    const balance = await this.computeBalance(dto.accountId, orgId);
    const fmt = (n: number) => (n / 100).toFixed(2);
    const catLine = tx.category ? `\nCategoria: ${tx.category.name}` : '';
    this.telegram.notify(orgId, `${icon} *Nuevo ${label}*\n${dto.description}\nMonto: ${fmt(dto.amount)} ${tx.account.currency}${catLine}\nCuenta: ${tx.account.name} → Saldo: ${fmt(balance)} ${tx.account.currency}`);

    return tx;
  }

  async findAll(orgId: string, query: TransactionQueryDto) {
    const { from, to, type, categoryId, accountId, projectId, cursor, limit = 20 } = query;

    const where: Prisma.TransactionWhereInput = { orgId };

    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }

    if (type) where.type = type;
    if (categoryId) where.categoryId = categoryId;
    if (accountId) where.accountId = accountId;
    if (projectId) where.projectId = projectId;

    const transactions = await this.prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(cursor
        ? { cursor: { id: cursor }, skip: 1 }
        : {}),
      include: {
        category: true,
        account: true,
        project: true,
        debt: true,
      },
    });

    const lastItem = transactions[transactions.length - 1];

    return {
      data: transactions,
      meta: {
        cursor: lastItem?.id ?? null,
        hasMore: transactions.length === limit,
      },
    };
  }

  async findOne(orgId: string, id: string) {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id, orgId },
      include: {
        category: true,
        account: true,
        project: true,
        debt: true,
      },
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction with id ${id} not found`);
    }

    return transaction;
  }

  async update(orgId: string, id: string, dto: UpdateTransactionDto) {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id, orgId },
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction with id ${id} not found`);
    }

    return this.prisma.transaction.update({
      where: { id },
      data: {
        ...(dto.date !== undefined && { date: new Date(dto.date) }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
        ...(dto.accountId !== undefined && { accountId: dto.accountId }),
        ...(dto.projectId !== undefined && { projectId: dto.projectId }),
        ...(dto.debtId !== undefined && { debtId: dto.debtId }),
      },
      include: {
        category: true,
        account: true,
        project: true,
        debt: true,
      },
    });
  }

  async remove(orgId: string, id: string) {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id, orgId },
      include: { category: true, account: true },
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction with id ${id} not found`);
    }

    // If TRANSFER, delete both linked transactions
    if (transaction.type === 'TRANSFER') {
      // Find the paired transaction (could be via linkedTransactionId or linkedBy)
      let pairedId = transaction.linkedTransactionId;
      if (!pairedId) {
        const linkedBy = await this.prisma.transaction.findFirst({
          where: { linkedTransactionId: id },
          select: { id: true },
        });
        pairedId = linkedBy?.id ?? null;
      }

      if (pairedId) {
        await this.prisma.$transaction(async (tx) => {
          // Unlink to avoid FK constraint
          await tx.transaction.updateMany({
            where: { linkedTransactionId: { in: [id, pairedId] } },
            data: { linkedTransactionId: null },
          });
          await tx.transaction.deleteMany({
            where: { id: { in: [id, pairedId] } },
          });
        });
        return transaction;
      }
    }

    const deleted = await this.prisma.transaction.delete({
      where: { id },
    });

    const balance = await this.computeBalance(transaction.accountId, orgId);
    const fmt = (n: number) => (n / 100).toFixed(2);
    const catLine = transaction.category ? `\nCategoria: ${transaction.category.name}` : '';
    this.telegram.notify(orgId, `🗑 *Transaccion eliminada*\n${transaction.description}\nMonto: ${fmt(transaction.amount)} ${transaction.account.currency}${catLine}\nCuenta: ${transaction.account.name} → Saldo: ${fmt(balance)} ${transaction.account.currency}`);

    return deleted;
  }

  async getSummary(orgId: string, query: TransactionQueryDto) {
    const where: Prisma.TransactionWhereInput = { orgId };

    if (query.from || query.to) {
      where.date = {};
      if (query.from) where.date.gte = new Date(query.from);
      if (query.to) where.date.lte = new Date(query.to);
    }

    const transactions = await this.prisma.transaction.findMany({
      where: { ...where, type: { in: ['INCOME', 'EXPENSE'] } },
      include: { account: { select: { currency: true } } },
    });

    const income: Record<string, number> = {};
    const expense: Record<string, number> = {};
    const balance: Record<string, number> = {};

    for (const tx of transactions) {
      const currency = tx.account.currency;
      if (tx.type === 'INCOME') {
        income[currency] = (income[currency] ?? 0) + tx.amount;
      } else {
        expense[currency] = (expense[currency] ?? 0) + tx.amount;
      }
    }

    const allCurrencies = new Set([...Object.keys(income), ...Object.keys(expense)]);
    for (const currency of allCurrencies) {
      balance[currency] = (income[currency] ?? 0) - (expense[currency] ?? 0);
    }

    return { income, expense, balance };
  }

  private async computeBalance(accountId: string, orgId: string): Promise<number> {
    const rows = await this.prisma.transaction.groupBy({
      by: ['type'],
      where: { accountId, orgId, type: { in: ['INCOME', 'EXPENSE'] } },
      _sum: { amount: true },
    });
    let balance = 0;
    for (const row of rows) {
      const amount = row._sum.amount ?? 0;
      balance += row.type === 'INCOME' ? amount : -amount;
    }
    return balance;
  }
}
