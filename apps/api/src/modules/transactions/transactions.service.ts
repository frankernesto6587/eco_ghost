import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateTransactionDto,
  UpdateTransactionDto,
  TransactionQueryDto,
  BulkUpdateDto,
  BulkDeleteDto,
} from './dto';

const TRANSACTION_INCLUDE = {
  category: true,
  account: true,
  project: true,
  debt: true,
  tags: { include: { tag: true } },
};

const ALLOWED_SORT_FIELDS = ['date', 'amount', 'description', 'createdAt'];

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
    private readonly audit: AuditService,
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
            ...(dto.tagIds?.length && {
              tags: {
                create: dto.tagIds.map((tagId) => ({ tagId })),
              },
            }),
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
            ...(dto.tagIds?.length && {
              tags: {
                create: dto.tagIds.map((tagId) => ({ tagId })),
              },
            }),
          },
        });

        return [out, inc];
      });

      // Return the outgoing transaction with relations
      const result = await this.prisma.transaction.findUniqueOrThrow({
        where: { id: outgoing.id },
        include: {
          ...TRANSACTION_INCLUDE,
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
      const noteLine = dto.notes ? `\n📝 Nota          : ${dto.notes}` : '';
      this.telegram.notify(orgId, `🔄 *Transferencia*\n━━━━━━━━━━━━━━━━━━\n📋 Descripcion : ${dto.description}\n💰 Monto          : ${fmt(dto.amount)} ${result.account.currency}\n🏦 Origen         : ${result.account.name}\n💵 Saldo           : ${fmt(srcBalance)} ${result.account.currency}\n🏦 Destino       : ${dstAccount?.name ?? '?'}\n💵 Saldo           : ${fmt(dstBalance)} ${dstAccount?.currency ?? ''}${noteLine}\n━━━━━━━━━━━━━━━━━━`);

      this.audit.log({
        action: 'CREATE',
        entity: 'Transaction',
        entityId: outgoing.id,
        metadata: { type: 'TRANSFER' },
        userId,
        orgId,
      });

      return result;
    }

    // EXCHANGE requires destination account + destination amount
    if (dto.type === 'EXCHANGE') {
      if (!dto.toAccountId) {
        throw new BadRequestException('toAccountId is required for EXCHANGE transactions');
      }
      if (!dto.toAmount) {
        throw new BadRequestException('toAmount is required for EXCHANGE transactions');
      }
      if (dto.toAccountId === dto.accountId) {
        throw new BadRequestException('Source and destination accounts must be different');
      }

      const [outgoing] = await this.prisma.$transaction(async (tx) => {
        // 1. Incoming side (destination) with destination amount
        const inc = await tx.transaction.create({
          data: {
            date: new Date(dto.date),
            description: dto.description,
            amount: dto.toAmount!,
            type: 'EXCHANGE',
            notes: dto.notes,
            categoryId: dto.categoryId,
            accountId: dto.toAccountId!,
            projectId: dto.projectId,
            orgId,
            createdBy: userId,
            ...(dto.tagIds?.length && {
              tags: {
                create: dto.tagIds.map((tagId) => ({ tagId })),
              },
            }),
          },
        });

        // 2. Outgoing side (source) with source amount, linked to incoming
        const out = await tx.transaction.create({
          data: {
            date: new Date(dto.date),
            description: dto.description,
            amount: dto.amount,
            type: 'EXCHANGE',
            notes: dto.notes,
            categoryId: dto.categoryId,
            accountId: dto.accountId,
            projectId: dto.projectId,
            linkedTransactionId: inc.id,
            orgId,
            createdBy: userId,
            ...(dto.tagIds?.length && {
              tags: {
                create: dto.tagIds.map((tagId) => ({ tagId })),
              },
            }),
          },
        });

        return [out, inc];
      });

      const result = await this.prisma.transaction.findUniqueOrThrow({
        where: { id: outgoing.id },
        include: {
          ...TRANSACTION_INCLUDE,
          linkedTransaction: { include: { account: true } },
        },
      });

      const [srcBalance, dstBalance] = await Promise.all([
        this.computeBalance(dto.accountId, orgId),
        this.computeBalance(dto.toAccountId!, orgId),
      ]);
      const dstAccount = result.linkedTransaction?.account;
      const fmt = (n: number) => (n / 100).toFixed(2);
      const noteLine = dto.notes ? `\n📝 Nota          : ${dto.notes}` : '';
      this.telegram.notify(orgId, `💱 *Cambio de divisa*\n━━━━━━━━━━━━━━━━━━\n📋 Descripcion : ${dto.description}\n🏦 Origen         : ${result.account.name}\n💰 Monto          : ${fmt(dto.amount)} ${result.account.currency}\n💵 Saldo           : ${fmt(srcBalance)} ${result.account.currency}\n🏦 Destino       : ${dstAccount?.name ?? '?'}\n💰 Monto          : ${fmt(dto.toAmount)} ${dstAccount?.currency ?? ''}\n💵 Saldo           : ${fmt(dstBalance)} ${dstAccount?.currency ?? ''}${noteLine}\n━━━━━━━━━━━━━━━━━━`);

      this.audit.log({
        action: 'CREATE',
        entity: 'Transaction',
        entityId: outgoing.id,
        metadata: { type: 'EXCHANGE' },
        userId,
        orgId,
      });

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
        ...(dto.tagIds?.length && {
          tags: {
            create: dto.tagIds.map((tagId) => ({ tagId })),
          },
        }),
      },
      include: TRANSACTION_INCLUDE,
    });

    const icon = dto.type === 'INCOME' ? '💵' : '💸';
    const label = dto.type === 'INCOME' ? 'Ingreso' : 'Gasto';
    const balance = await this.computeBalance(dto.accountId, orgId);
    const fmt = (n: number) => (n / 100).toFixed(2);
    const catLine = tx.category ? `\n📂 Categoria   : ${tx.category.name}` : '';
    const noteLine = dto.notes ? `\n📝 Nota          : ${dto.notes}` : '';
    this.telegram.notify(orgId, `${icon} *Nuevo ${label}*\n━━━━━━━━━━━━━━━━━━\n📋 Descripcion : ${dto.description}\n💰 Monto          : ${fmt(dto.amount)} ${tx.account.currency}${catLine}\n🏦 Cuenta        : ${tx.account.name}\n💵 Saldo           : ${fmt(balance)} ${tx.account.currency}${noteLine}\n━━━━━━━━━━━━━━━━━━`);

    this.audit.log({
      action: 'CREATE',
      entity: 'Transaction',
      entityId: tx.id,
      metadata: { type: dto.type },
      userId,
      orgId,
    });

    return tx;
  }

  async findAll(orgId: string, query: TransactionQueryDto) {
    const { from, to, type, categoryId, accountId, projectId, currency, cursor, limit = 20, deleted, sortBy, sortOrder } = query;

    const where: Prisma.TransactionWhereInput = {
      orgId,
      deletedAt: deleted ? { not: null } : null,
    };

    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }

    if (type) where.type = type;
    if (categoryId) where.categoryId = categoryId;
    if (accountId) where.accountId = accountId;
    if (projectId) where.projectId = projectId;
    if (currency) where.account = { currency };

    // Build orderBy from sortBy/sortOrder, default to createdAt desc
    let orderBy: Prisma.TransactionOrderByWithRelationInput = { createdAt: 'desc' };
    if (sortBy && ALLOWED_SORT_FIELDS.includes(sortBy)) {
      orderBy = { [sortBy]: sortOrder ?? 'desc' };
    }

    const transactions = await this.prisma.transaction.findMany({
      where,
      orderBy,
      take: limit,
      ...(cursor
        ? { cursor: { id: cursor }, skip: 1 }
        : {}),
      include: TRANSACTION_INCLUDE,
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
      where: { id, orgId, deletedAt: null },
      include: TRANSACTION_INCLUDE,
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction with id ${id} not found`);
    }

    return transaction;
  }

  async update(orgId: string, id: string, userId: string, dto: UpdateTransactionDto) {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id, orgId, deletedAt: null },
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction with id ${id} not found`);
    }

    const { tagIds, ...data } = dto;

    const result = await this.prisma.transaction.update({
      where: { id },
      data: {
        ...(data.date !== undefined && { date: new Date(data.date) }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.amount !== undefined && { amount: data.amount }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
        ...(data.accountId !== undefined && { accountId: data.accountId }),
        ...(data.projectId !== undefined && { projectId: data.projectId }),
        ...(data.debtId !== undefined && { debtId: data.debtId }),
        ...(tagIds !== undefined && {
          tags: {
            deleteMany: {},
            ...(tagIds.length && {
              create: tagIds.map((tagId) => ({ tagId })),
            }),
          },
        }),
      },
      include: TRANSACTION_INCLUDE,
    });

    this.audit.log({
      action: 'UPDATE',
      entity: 'Transaction',
      entityId: id,
      changes: data as unknown as Prisma.InputJsonValue,
      userId,
      orgId,
    });

    return result;
  }

  async remove(orgId: string, id: string, userId: string, reason: string) {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id, orgId, deletedAt: null },
      include: { category: true, account: true },
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction with id ${id} not found`);
    }

    const now = new Date();

    // If TRANSFER/EXCHANGE, soft-delete both linked transactions
    if (['TRANSFER', 'EXCHANGE'].includes(transaction.type)) {
      let pairedId = transaction.linkedTransactionId;
      if (!pairedId) {
        const linkedBy = await this.prisma.transaction.findFirst({
          where: { linkedTransactionId: id, deletedAt: null },
          select: { id: true },
        });
        pairedId = linkedBy?.id ?? null;
      }

      if (pairedId) {
        await this.prisma.transaction.updateMany({
          where: { id: { in: [id, pairedId] } },
          data: { deletedAt: now, deleteReason: reason },
        });

        this.audit.log({
          action: 'DELETE',
          entity: 'Transaction',
          entityId: id,
          metadata: { reason, pairedId },
          userId,
          orgId,
        });

        return transaction;
      }
    }

    await this.prisma.transaction.update({
      where: { id },
      data: { deletedAt: now, deleteReason: reason },
    });

    const balance = await this.computeBalance(transaction.accountId, orgId);
    const fmt = (n: number) => (n / 100).toFixed(2);
    const catLine = transaction.category ? `\n📂 Categoria   : ${transaction.category.name}` : '';
    this.telegram.notify(orgId, `🗑 *Transaccion eliminada*\n━━━━━━━━━━━━━━━━━━\n📋 Descripcion : ${transaction.description}\n💰 Monto          : ${fmt(transaction.amount)} ${transaction.account.currency}${catLine}\n🏦 Cuenta        : ${transaction.account.name}\n💵 Saldo           : ${fmt(balance)} ${transaction.account.currency}\n⚠️ Motivo        : ${reason}\n━━━━━━━━━━━━━━━━━━`);

    this.audit.log({
      action: 'DELETE',
      entity: 'Transaction',
      entityId: id,
      metadata: { reason },
      userId,
      orgId,
    });

    return transaction;
  }

  async restore(orgId: string, id: string, userId: string) {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id, orgId, deletedAt: { not: null } },
      include: { account: true },
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction with id ${id} not found`);
    }

    // If TRANSFER/EXCHANGE, restore both linked transactions
    if (['TRANSFER', 'EXCHANGE'].includes(transaction.type)) {
      let pairedId = transaction.linkedTransactionId;
      if (!pairedId) {
        const linkedBy = await this.prisma.transaction.findFirst({
          where: { linkedTransactionId: id },
          select: { id: true },
        });
        pairedId = linkedBy?.id ?? null;
      }

      if (pairedId) {
        await this.prisma.transaction.updateMany({
          where: { id: { in: [id, pairedId] } },
          data: { deletedAt: null, deleteReason: null },
        });

        this.audit.log({
          action: 'RESTORE',
          entity: 'Transaction',
          entityId: id,
          metadata: { pairedId },
          userId,
          orgId,
        });

        return transaction;
      }
    }

    const result = await this.prisma.transaction.update({
      where: { id },
      data: { deletedAt: null, deleteReason: null },
    });

    this.audit.log({
      action: 'RESTORE',
      entity: 'Transaction',
      entityId: id,
      userId,
      orgId,
    });

    return result;
  }

  async bulkUpdate(orgId: string, userId: string, dto: BulkUpdateDto) {
    const data: Prisma.TransactionUncheckedUpdateManyInput = {};

    if (dto.categoryId !== undefined) {
      data.categoryId = dto.categoryId;
    }
    if (dto.accountId !== undefined) {
      data.accountId = dto.accountId;
    }

    const result = await this.prisma.transaction.updateMany({
      where: {
        id: { in: dto.ids },
        orgId,
        deletedAt: null,
      },
      data,
    });

    for (const id of dto.ids) {
      this.audit.log({
        action: 'BULK_UPDATE',
        entity: 'Transaction',
        entityId: id,
        changes: { categoryId: dto.categoryId, accountId: dto.accountId },
        userId,
        orgId,
      });
    }

    return { count: result.count };
  }

  async bulkDelete(orgId: string, userId: string, dto: BulkDeleteDto) {
    const now = new Date();

    // Find all transactions to check for linked (transfer/exchange) pairs
    const transactions = await this.prisma.transaction.findMany({
      where: {
        id: { in: dto.ids },
        orgId,
        deletedAt: null,
      },
      select: { id: true, type: true, linkedTransactionId: true },
    });

    // Collect all IDs including linked pairs
    const allIds = new Set<string>(dto.ids);

    for (const tx of transactions) {
      if (['TRANSFER', 'EXCHANGE'].includes(tx.type)) {
        if (tx.linkedTransactionId) {
          allIds.add(tx.linkedTransactionId);
        } else {
          const linkedBy = await this.prisma.transaction.findFirst({
            where: { linkedTransactionId: tx.id, deletedAt: null },
            select: { id: true },
          });
          if (linkedBy) {
            allIds.add(linkedBy.id);
          }
        }
      }
    }

    const result = await this.prisma.transaction.updateMany({
      where: {
        id: { in: Array.from(allIds) },
        orgId,
        deletedAt: null,
      },
      data: { deletedAt: now, deleteReason: dto.reason },
    });

    for (const id of allIds) {
      this.audit.log({
        action: 'BULK_DELETE',
        entity: 'Transaction',
        entityId: id,
        metadata: { reason: dto.reason },
        userId,
        orgId,
      });
    }

    return { count: result.count };
  }

  async getSummary(orgId: string, query: TransactionQueryDto) {
    const where: Prisma.TransactionWhereInput = { orgId, deletedAt: null };

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
    const baseWhere = { accountId, orgId, deletedAt: null };

    const rows = await this.prisma.transaction.groupBy({
      by: ['type'],
      where: { ...baseWhere, type: { in: ['INCOME', 'EXPENSE'] } },
      _sum: { amount: true },
    });
    let balance = 0;
    for (const row of rows) {
      const amount = row._sum.amount ?? 0;
      balance += row.type === 'INCOME' ? amount : -amount;
    }

    // TRANSFER/EXCHANGE: incoming (no linkedTransactionId) adds, outgoing (has linkedTransactionId) subtracts
    const [incoming, outgoing] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: { ...baseWhere, type: { in: ['TRANSFER', 'EXCHANGE'] }, linkedTransactionId: null },
        _sum: { amount: true },
      }),
      this.prisma.transaction.aggregate({
        where: { ...baseWhere, type: { in: ['TRANSFER', 'EXCHANGE'] }, linkedTransactionId: { not: null } },
        _sum: { amount: true },
      }),
    ]);
    balance += (incoming._sum.amount ?? 0) - (outgoing._sum.amount ?? 0);

    return balance;
  }
}
