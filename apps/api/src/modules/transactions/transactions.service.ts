import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role, Transaction, TransactionStatus, TransactionType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { computeAccountBalance } from '../../common/account-balance.util';
import { parseEntryDate } from '../../common/date-range.util';
import { assertOrgRefs } from '../../common/org-refs.util';
import { recomputeDebt } from '../../common/debt-balance.util';
import { Actor, flowWhere, visibleWhere } from '../../common/tx-filters';
import { decideStatusFor, statusFields } from '../../common/approval-policy';
import { TelegramService } from '../telegram/telegram.service';
import { AuditService } from '../audit/audit.service';
import { ValuationService } from '../valuation/valuation.service';
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
  // La otra pierna de un traspaso o cambio: sin ella el cliente no puede
  // mostrar ni editar el destino.
  linkedTransaction: { include: { account: true } },
  linkedBy: { include: { account: true } },
} satisfies Prisma.TransactionInclude;

const ALLOWED_SORT_FIELDS = ['date', 'description', 'createdAt', 'amount'];

const PAIR_TYPES: TransactionType[] = ['TRANSFER', 'EXCHANGE'];
export const isPair = (type: TransactionType) => PAIR_TYPES.includes(type);

/** Campos que se copian igual en las dos piernas de un par. */
const SHARED_FIELDS = ['date', 'description', 'notes', 'categoryId', 'projectId'] as const;

/**
 * Las dos piernas de un traspaso o cambio. La que sale tiene
 * `linkedTransactionId` apuntando a la que entra.
 */
export interface Pair {
  out: Transaction;
  inc: Transaction;
}

export type TransactionWithRelations = Prisma.TransactionGetPayload<{ include: typeof TRANSACTION_INCLUDE }>;
export { TRANSACTION_INCLUDE };

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
    private readonly audit: AuditService,
    private readonly valuation: ValuationService,
  ) {}

  /**
   * Un TRANSFER mueve dinero entre cuentas de la misma moneda; un EXCHANGE,
   * entre monedas distintas. Mezclarlos rompe los saldos por moneda y, mas
   * adelante, la valoracion de los cambios.
   */
  private assertPairCurrencies(type: TransactionType, from: { currency: string }, to: { currency: string }) {
    if (type === 'TRANSFER' && from.currency !== to.currency) {
      throw new BadRequestException('A transfer must be between accounts of the same currency; use an exchange');
    }
    if (type === 'EXCHANGE' && from.currency === to.currency) {
      throw new BadRequestException('An exchange must be between accounts of different currencies; use a transfer');
    }
  }

  async create(orgId: string, userId: string, dto: CreateTransactionDto) {
    const accounts = await assertOrgRefs(this.prisma, orgId, {
      accountIds: [dto.accountId, dto.toAccountId],
      categoryId: dto.categoryId,
      projectId: dto.projectId,
      debtId: dto.debtId,
      tagIds: dto.tagIds,
    });
    const date = parseEntryDate(dto.date);
    const tags = dto.tagIds?.length ? { tags: { create: dto.tagIds.map((tagId) => ({ tagId })) } } : {};

    if (isPair(dto.type)) {
      if (!dto.toAccountId) {
        throw new BadRequestException(`toAccountId is required for ${dto.type} transactions`);
      }
      if (dto.type === 'EXCHANGE' && !dto.toAmount) {
        throw new BadRequestException('toAmount is required for EXCHANGE transactions');
      }
      if (dto.toAccountId === dto.accountId) {
        throw new BadRequestException('Source and destination accounts must be different');
      }
      if (dto.debtId) {
        throw new BadRequestException('Transfers and exchanges cannot be linked to a debt');
      }
      const from = accounts.get(dto.accountId)!;
      const to = accounts.get(dto.toAccountId)!;
      this.assertPairCurrencies(dto.type, from, to);
      const incAmount = dto.type === 'EXCHANGE' ? dto.toAmount! : dto.amount;
      const status = await decideStatusFor(this.prisma, orgId, userId, [
        { currency: from.currency, amount: dto.amount },
        { currency: to.currency, amount: incAmount },
      ]);

      const shared = {
        ...statusFields(status, userId),
        date,
        description: dto.description,
        type: dto.type,
        notes: dto.notes,
        categoryId: dto.categoryId,
        projectId: dto.projectId,
        orgId,
        createdBy: userId,
        ...tags,
      };
      // Primero la que entra (destino) y luego la que sale, enlazada a ella.
      const outgoing = await this.prisma.$transaction(async (tx) => {
        const inc = await tx.transaction.create({
          data: { ...shared, accountId: dto.toAccountId!, amount: incAmount },
        });
        return tx.transaction.create({
          data: { ...shared, accountId: dto.accountId, amount: dto.amount, linkedTransactionId: inc.id },
        });
      });

      const result = await this.prisma.transaction.findUniqueOrThrow({
        where: { id: outgoing.id },
        include: TRANSACTION_INCLUDE,
      });
      if (status === TransactionStatus.APPROVED) this.notifyPair(orgId, dto, result);
      else this.telegram.notifyPending(orgId, userId, result);

      this.audit.log({
        action: 'CREATE',
        entity: 'Transaction',
        entityId: outgoing.id,
        metadata: { type: dto.type, status },
        userId,
        orgId,
      });

      return result;
    }

    if (dto.toAccountId || dto.toAmount) {
      throw new BadRequestException('toAccountId and toAmount are only for TRANSFER and EXCHANGE');
    }
    if (dto.debtId) {
      const debt = await this.prisma.debt.findUniqueOrThrow({ where: { id: dto.debtId } });
      if (accounts.get(dto.accountId)!.currency !== debt.currency) {
        throw new BadRequestException(`This debt is in ${debt.currency}; the account must be in the same currency`);
      }
      if (debt.approvalStatus !== TransactionStatus.APPROVED) {
        throw new BadRequestException('This debt is waiting for approval; register payments once it is approved');
      }
    }
    const status = await decideStatusFor(this.prisma, orgId, userId, [
      { currency: accounts.get(dto.accountId)!.currency, amount: dto.amount },
    ]);

    // INCOME / EXPENSE
    const tx = await this.prisma.transaction.create({
      data: {
        ...statusFields(status, userId),
        date,
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
        ...tags,
      },
      include: TRANSACTION_INCLUDE,
    });
    if (dto.debtId) await recomputeDebt(this.prisma, dto.debtId);

    this.audit.log({
      action: 'CREATE',
      entity: 'Transaction',
      entityId: tx.id,
      metadata: { type: dto.type, status },
      userId,
      orgId,
    });

    if (status !== TransactionStatus.APPROVED) {
      this.telegram.notifyPending(orgId, userId, tx);
      return tx;
    }

    const icon = dto.type === 'INCOME' ? '💵' : '💸';
    const label = dto.type === 'INCOME' ? 'Ingreso' : 'Gasto';
    const balance = await computeAccountBalance(this.prisma, dto.accountId, orgId);
    const fmt = (n: number) => (n / 100).toFixed(2);
    const catLine = tx.category ? `\n📂 Categoria   : ${tx.category.name}` : '';
    const noteLine = dto.notes ? `\n📝 Nota          : ${dto.notes}` : '';
    this.telegram.notify(orgId, `${icon} *Nuevo ${label}*\n━━━━━━━━━━━━━━━━━━\n📋 Descripcion : ${dto.description}\n💰 Monto          : ${fmt(dto.amount)} ${tx.account.currency}${catLine}\n🏦 Cuenta        : ${tx.account.name}\n💵 Saldo           : ${fmt(balance)} ${tx.account.currency}${noteLine}\n━━━━━━━━━━━━━━━━━━`);

    return tx;
  }

  private async notifyPair(
    orgId: string,
    dto: CreateTransactionDto,
    result: Prisma.TransactionGetPayload<{ include: typeof TRANSACTION_INCLUDE }>,
  ) {
    const [srcBalance, dstBalance] = await Promise.all([
      computeAccountBalance(this.prisma, dto.accountId, orgId),
      computeAccountBalance(this.prisma, dto.toAccountId!, orgId),
    ]);
    const src = result.account;
    const dst = result.linkedTransaction?.account;
    const fmt = (n: number) => (n / 100).toFixed(2);
    const noteLine = dto.notes ? `\n📝 Nota          : ${dto.notes}` : '';
    if (dto.type === 'TRANSFER') {
      this.telegram.notify(orgId, `🔄 *Transferencia*\n━━━━━━━━━━━━━━━━━━\n📋 Descripcion : ${dto.description}\n💰 Monto          : ${fmt(dto.amount)} ${src.currency}\n🏦 Origen         : ${src.name}\n💵 Saldo           : ${fmt(srcBalance)} ${src.currency}\n🏦 Destino       : ${dst?.name ?? '?'}\n💵 Saldo           : ${fmt(dstBalance)} ${dst?.currency ?? ''}${noteLine}\n━━━━━━━━━━━━━━━━━━`);
    } else {
      this.telegram.notify(orgId, `💱 *Cambio de divisa*\n━━━━━━━━━━━━━━━━━━\n📋 Descripcion : ${dto.description}\n🏦 Origen         : ${src.name}\n💰 Monto          : ${fmt(dto.amount)} ${src.currency}\n💵 Saldo           : ${fmt(srcBalance)} ${src.currency}\n🏦 Destino       : ${dst?.name ?? '?'}\n💰 Monto          : ${fmt(dto.toAmount!)} ${dst?.currency ?? ''}\n💵 Saldo           : ${fmt(dstBalance)} ${dst?.currency ?? ''}${noteLine}\n━━━━━━━━━━━━━━━━━━`);
    }
  }

  /**
   * Traduce el query a un `where` de Prisma.
   *
   * Lo usan `findAll` y `getSummary`: antes `getSummary` solo miraba from/to e
   * ignoraba en silencio el resto de filtros, asi que el resumen no cuadraba con
   * la lista que el usuario tenia delante.
   */
  private buildWhere(orgId: string, query: TransactionQueryDto, actor: Actor): Prisma.TransactionWhereInput {
    const { from, to, type, categoryId, accountId, projectId, currency, deleted, uncategorized } = query;

    const where: Prisma.TransactionWhereInput = {
      orgId,
      deletedAt: deleted ? { not: null } : null,
      // Pendientes y rechazados solo los ven quien los anoto y quien aprueba.
      AND: [visibleWhere(actor, query.status)],
    };

    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }

    if (type?.length) {
      where.type = type.length === 1 ? (type[0] as any) : { in: type as any };
    }
    // `uncategorized` gana sobre `categoryId`: pedir ambos es contradictorio.
    if (uncategorized) {
      where.categoryId = null;
    } else if (categoryId?.length) {
      where.categoryId = categoryId.length === 1 ? categoryId[0] : { in: categoryId };
    }
    if (accountId?.length) {
      where.accountId = accountId.length === 1 ? accountId[0] : { in: accountId };
    }
    if (projectId) where.projectId = projectId;
    if (currency) where.account = { currency };

    return where;
  }

  async findAll(orgId: string, query: TransactionQueryDto, actor: Actor) {
    const { page = 1, limit = 15, sortBy, sortOrder } = query;

    const where = this.buildWhere(orgId, query, actor);
    // reportAmount/valuationStatus al dia (recalcula solo si cambio algo)
    await this.valuation.ensureFresh(orgId);

    // Build orderBy from sortBy/sortOrder, default to createdAt desc
    const dir = sortOrder ?? 'desc';

    let orderBy: Prisma.TransactionOrderByWithRelationInput = { createdAt: 'desc' };
    if (sortBy && ALLOWED_SORT_FIELDS.includes(sortBy)) {
      orderBy = { [sortBy]: dir };
    }

    const [transactions, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: TRANSACTION_INCLUDE,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return {
      data: transactions,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(orgId: string, id: string, actor: Actor) {
    await this.valuation.ensureFresh(orgId);
    const transaction = await this.prisma.transaction.findFirst({
      where: {
        id,
        orgId,
        deletedAt: null,
        AND: [visibleWhere(actor, [TransactionStatus.APPROVED, TransactionStatus.PENDING, TransactionStatus.REJECTED])],
      },
      include: TRANSACTION_INCLUDE,
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction with id ${id} not found`);
    }

    return transaction;
  }

  /** Las dos piernas de un par a partir de cualquiera de ellas. */
  async findPair(db: Prisma.TransactionClient, t: Transaction, where: Prisma.TransactionWhereInput = {}): Promise<Pair | null> {
    if (t.linkedTransactionId) {
      const inc = await db.transaction.findFirst({ where: { id: t.linkedTransactionId, ...where } });
      return inc ? { out: t, inc } : null;
    }
    const out = await db.transaction.findFirst({ where: { linkedTransactionId: t.id, ...where } });
    return out ? { out, inc: t } : null;
  }

  /** Ids de las piernas hermanas de los pares incluidos en `ids`. */
  private async withPairedIds(db: Prisma.TransactionClient, orgId: string, ids: string[], where: Prisma.TransactionWhereInput) {
    const rows = await db.transaction.findMany({
      where: { orgId, ...where, OR: [{ id: { in: ids } }, { linkedTransactionId: { in: ids } }] },
      select: { id: true, linkedTransactionId: true, type: true },
    });
    const all = new Set(ids);
    for (const r of rows) {
      if (!isPair(r.type)) continue;
      all.add(r.id);
      if (r.linkedTransactionId) all.add(r.linkedTransactionId);
    }
    return all;
  }

  /**
   * Edita un movimiento.
   *
   * En un traspaso o cambio se edita el par completo, se haya abierto desde la
   * pierna que sea: `accountId`/`amount` son siempre los de la que sale y
   * `toAccountId`/`toAmount` los de la que entra. Antes solo se tocaba la pierna
   * pulsada y el par quedaba descuadrado (otro importe, otra fecha), y
   * `toAccountId`/`toAmount` se ignoraban en silencio.
   */
  async update(orgId: string, id: string, userId: string, dto: UpdateTransactionDto) {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id, orgId, deletedAt: null },
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction with id ${id} not found`);
    }

    const { tagIds } = dto;
    const { before, after } = await this.prisma.$transaction((tx) => this.applyEdits(tx, orgId, transaction, dto));

    this.audit.log({
      action: 'UPDATE',
      entity: 'Transaction',
      entityId: after.id,
      changes: { before, after: snapshot(after, after.linkedTransaction ?? undefined), ...(tagIds !== undefined && { tagIds }) } as Prisma.InputJsonValue,
      userId,
      orgId,
    });
    return after;
  }

  /**
   * Aplica una edicion dentro de una transaccion de base de datos abierta. La
   * usan editar un movimiento y "corregir y aprobar". Devuelve como estaba
   * (para el historial) y como queda (siempre la pierna que sale, si es par).
   */
  async applyEdits(tx: Prisma.TransactionClient, orgId: string, transaction: Transaction, dto: UpdateTransactionDto) {
    const pair = isPair(transaction.type) ? await this.findPair(tx, transaction, { deletedAt: null }) : null;
    if (isPair(transaction.type)) {
      if (!pair) throw new BadRequestException('This transfer has lost its other side; delete it and enter it again');
      await this.updatePair(tx, orgId, pair, dto);
    } else {
      await this.updateSingle(tx, orgId, transaction, dto);
    }
    const out = pair?.out ?? transaction;
    const after = await tx.transaction.findUniqueOrThrow({ where: { id: out.id }, include: TRANSACTION_INCLUDE });
    return { before: snapshot(out, pair?.inc), after, pair };
  }

  private async updatePair(tx: Prisma.TransactionClient, orgId: string, { out, inc }: Pair, dto: UpdateTransactionDto) {
    if (dto.type !== undefined && dto.type !== out.type) {
      throw new BadRequestException('The type of a transfer or exchange cannot be changed; delete it and enter it again');
    }
    if (dto.debtId) {
      throw new BadRequestException('Transfers and exchanges cannot be linked to a debt');
    }

    const outAccountId = dto.accountId ?? out.accountId;
    const incAccountId = dto.toAccountId ?? inc.accountId;
    if (outAccountId === incAccountId) {
      throw new BadRequestException('Source and destination accounts must be different');
    }
    // Solo las cuentas que cambian tienen que estar activas.
    const changed = [outAccountId, incAccountId].filter((a, i) => a !== [out.accountId, inc.accountId][i]);
    await assertOrgRefs(tx, orgId, { accountIds: changed, categoryId: dto.categoryId, projectId: dto.projectId, tagIds: dto.tagIds });
    const accounts = await tx.account.findMany({ where: { id: { in: [outAccountId, incAccountId] } } });
    const byId = new Map(accounts.map((a) => [a.id, a]));
    this.assertPairCurrencies(out.type, byId.get(outAccountId)!, byId.get(incAccountId)!);

    const outAmount = dto.amount ?? out.amount;
    const incAmount = out.type === 'TRANSFER' ? outAmount : (dto.toAmount ?? inc.amount);

    const shared = this.sharedData(dto);
    await tx.transaction.update({ where: { id: out.id }, data: { ...shared, accountId: outAccountId, amount: outAmount } });
    await tx.transaction.update({ where: { id: inc.id }, data: { ...shared, accountId: incAccountId, amount: incAmount } });
  }

  private async updateSingle(tx: Prisma.TransactionClient, orgId: string, t: Transaction, dto: UpdateTransactionDto) {
    if (dto.type !== undefined && dto.type !== t.type && !(['INCOME', 'EXPENSE'] as TransactionType[]).includes(dto.type)) {
      throw new BadRequestException('An income or expense cannot become a transfer or exchange; delete it and enter it again');
    }
    if (dto.toAccountId || dto.toAmount) {
      throw new BadRequestException('toAccountId and toAmount are only for TRANSFER and EXCHANGE');
    }
    const debtId = dto.debtId !== undefined ? dto.debtId : t.debtId;
    if (t.debtId && dto.type !== undefined && dto.type !== t.type) {
      throw new BadRequestException('The type of a debt movement cannot be changed');
    }

    const accountChanged = dto.accountId !== undefined && dto.accountId !== t.accountId;
    const accounts = await assertOrgRefs(tx, orgId, {
      accountIds: accountChanged ? [dto.accountId] : [],
      categoryId: dto.categoryId,
      projectId: dto.projectId,
      debtId: dto.debtId,
      tagIds: dto.tagIds,
    });
    // Un movimiento de deuda va siempre en la moneda de la deuda.
    if (debtId && (accountChanged || dto.debtId !== undefined)) {
      const debt = await tx.debt.findUniqueOrThrow({ where: { id: debtId } });
      const account = accounts.get(dto.accountId ?? '') ?? (await tx.account.findUniqueOrThrow({ where: { id: t.accountId } }));
      if (account.currency !== debt.currency) {
        throw new BadRequestException(`This debt is in ${debt.currency}; the account must be in the same currency`);
      }
    }

    await tx.transaction.update({
      where: { id: t.id },
      data: {
        ...this.sharedData(dto),
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.accountId !== undefined && { accountId: dto.accountId }),
        ...(dto.debtId !== undefined && { debtId: dto.debtId }),
      },
    });

    for (const id of new Set([t.debtId, debtId])) {
      if (id) await recomputeDebt(tx, id);
    }
  }

  /** Lo que se escribe igual en una o en las dos piernas. */
  private sharedData(dto: UpdateTransactionDto): Prisma.TransactionUncheckedUpdateInput {
    const data: Prisma.TransactionUncheckedUpdateInput = {};
    for (const f of SHARED_FIELDS) {
      if (dto[f] === undefined) continue;
      (data as any)[f] = f === 'date' ? parseEntryDate(dto.date!) : dto[f];
    }
    if (dto.tagIds !== undefined) {
      data.tags = {
        deleteMany: {},
        ...(dto.tagIds.length && { create: dto.tagIds.map((tagId) => ({ tagId })) }),
      };
    }
    return data;
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
    if (isPair(transaction.type)) {
      const pair = await this.findPair(this.prisma, transaction, { deletedAt: null });
      if (pair) {
        const pairedId = pair.out.id === id ? pair.inc.id : pair.out.id;
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
    if (transaction.debtId) await recomputeDebt(this.prisma, transaction.debtId);

    const balance = await computeAccountBalance(this.prisma, transaction.accountId, orgId);
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
    if (isPair(transaction.type)) {
      const pair = await this.findPair(this.prisma, transaction);
      if (pair) {
        const pairedId = pair.out.id === id ? pair.inc.id : pair.out.id;
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
    if (transaction.debtId) await recomputeDebt(this.prisma, transaction.debtId);

    this.audit.log({
      action: 'RESTORE',
      entity: 'Transaction',
      entityId: id,
      userId,
      orgId,
    });

    return result;
  }

  /**
   * Cambia categoria y/o cuenta de varios movimientos.
   *
   * La categoria se aplica a las dos piernas de un par. La cuenta no se cambia
   * en pares (seria rehacer el traspaso) y la nueva tiene que ser de la misma
   * moneda: si no, el importe pasaria a significar otra cosa.
   */
  async bulkUpdate(orgId: string, userId: string, role: Role, dto: BulkUpdateDto) {
    const where = { orgId, deletedAt: null } as const;

    const count = await this.prisma.$transaction(async (tx) => {
      const accounts = await assertOrgRefs(tx, orgId, {
        accountIds: dto.accountId !== undefined ? [dto.accountId] : [],
        categoryId: dto.categoryId,
      });

      const rows = await tx.transaction.findMany({
        where: { ...where, id: { in: dto.ids } },
        select: { id: true, type: true, debtId: true, status: true, createdBy: true, account: { select: { currency: true } } },
      });
      // El contador solo reordena lo suyo que aun no esta aprobado: lo aprobado
      // ya cuenta y solo lo cambia quien aprueba.
      if (role === Role.ACCOUNTANT && rows.some((r) => r.createdBy !== userId || r.status === TransactionStatus.APPROVED)) {
        throw new ForbiddenException('You can only change your own movements that are not approved yet');
      }

      if (dto.accountId !== undefined) {
        const target = accounts.get(dto.accountId)!;
        if (rows.some((r) => isPair(r.type))) {
          throw new BadRequestException('The account of a transfer or exchange cannot be changed in bulk');
        }
        if (rows.some((r) => r.account.currency !== target.currency)) {
          throw new BadRequestException(`Only movements in ${target.currency} can be moved to this account`);
        }
      }

      let n = 0;
      if (dto.accountId !== undefined) {
        n = (await tx.transaction.updateMany({ where: { ...where, id: { in: dto.ids } }, data: { accountId: dto.accountId } })).count;
      }
      if (dto.categoryId !== undefined) {
        const ids = await this.withPairedIds(tx, orgId, dto.ids, where);
        n = (await tx.transaction.updateMany({ where: { ...where, id: { in: [...ids] } }, data: { categoryId: dto.categoryId } })).count;
      }
      return n;
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

    return { count };
  }

  async bulkDelete(orgId: string, userId: string, dto: BulkDeleteDto) {
    const now = new Date();
    const where = { orgId, deletedAt: null } as const;

    const allIds = await this.withPairedIds(this.prisma, orgId, dto.ids, where);
    const debtIds = await this.prisma.transaction.findMany({
      where: { ...where, id: { in: [...allIds] }, debtId: { not: null } },
      select: { debtId: true },
      distinct: ['debtId'],
    });

    const result = await this.prisma.transaction.updateMany({
      where: { ...where, id: { in: Array.from(allIds) } },
      data: { deletedAt: now, deleteReason: dto.reason },
    });
    for (const { debtId } of debtIds) await recomputeDebt(this.prisma, debtId!);

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

  async getSummary(orgId: string, query: TransactionQueryDto, actor: Actor) {
    const where = this.buildWhere(orgId, query, actor);

    // Solo INCOME/EXPENSE son flujo, pero hay que INTERSECAR con el filtro de tipo
    // del usuario en vez de pisarlo: si filtro a INCOME, el resumen no debe
    // devolverle tambien los gastos. Mismas reglas que el panel y Analisis
    // (sin deudas ni ajustes), salvo en la papelera, donde no hay flujo que filtrar.
    const flowTypes: TransactionType[] = [TransactionType.INCOME, TransactionType.EXPENSE];
    const selected = query.type?.length
      ? flowTypes.filter((t) => query.type!.includes(t))
      : flowTypes;
    const filter = { ...where, type: { in: selected } };

    const transactions = selected.length
      ? await this.prisma.transaction.findMany({
          where: query.deleted ? filter : flowWhere(filter),
          include: { account: { select: { currency: true } } },
        })
      : [];

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
}

/** Lo que se guarda en el historial antes y despues de editar. */
export function snapshot(out: Transaction, inc?: Transaction) {
  return {
    date: out.date,
    description: out.description,
    amount: out.amount,
    type: out.type,
    accountId: out.accountId,
    categoryId: out.categoryId,
    projectId: out.projectId,
    debtId: out.debtId,
    notes: out.notes,
    ...(inc && { toAccountId: inc.accountId, toAmount: inc.amount }),
  };
}
