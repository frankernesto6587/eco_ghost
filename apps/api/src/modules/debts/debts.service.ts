import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DebtStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { CreateDebtDto, UpdateDebtDto, AddPaymentDto, DebtQueryDto } from './dto';
import { computeAccountBalance } from '../../common/account-balance.util';

/** Nombre de la categoria de los movimientos de deudas. */
const LOAN_CATEGORY = 'Prestamos';

@Injectable()
export class DebtsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
  ) {}

  /**
   * Categoria a la que se cuelgan los movimientos que genera este modulo.
   *
   * Sin ella, cada deuda y cada pago nacian con `categoryId` null y el aviso de
   * "% sin categorizar" de Analisis los contaba como descuido del usuario,
   * cuando no hay forma de categorizarlos desde la UI: los crea el backend.
   *
   * Se resuelve dentro de la transaccion en curso para no dejar la categoria
   * creada si el resto falla.
   */
  private async loanCategoryId(tx: Prisma.TransactionClient, orgId: string): Promise<string> {
    const existing = await tx.category.findFirst({
      where: { orgId, name: LOAN_CATEGORY },
      select: { id: true },
    });
    if (existing) return existing.id;

    const created = await tx.category.create({
      data: { name: LOAN_CATEGORY, icon: 'transaction', orgId },
      select: { id: true },
    });
    return created.id;
  }

  async create(orgId: string, userId: string, dto: CreateDebtDto) {
    return this.prisma.$transaction(async (tx) => {
      const debt = await tx.debt.create({
        data: {
          personName: dto.personName,
          description: dto.description,
          totalAmount: dto.totalAmount,
          type: dto.type,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          orgId,
        },
      });

      // Create initial transaction linked to the debt.
      // RECEIVABLE = we lent money, so money goes OUT (EXPENSE).
      // PAYABLE = we borrowed money, so money comes IN (INCOME).
      const transactionType = dto.type === 'RECEIVABLE' ? 'EXPENSE' : 'INCOME';

      await tx.transaction.create({
        data: {
          date: new Date(),
          description: `Debt: ${dto.description}`,
          amount: dto.totalAmount,
          type: transactionType,
          accountId: dto.accountId,
          categoryId: await this.loanCategoryId(tx, orgId),
          debtId: debt.id,
          orgId,
          createdBy: userId,
        },
      });

      const account = await tx.account.findUnique({ where: { id: dto.accountId }, select: { name: true, currency: true } });
      const balance = await computeAccountBalance(tx, dto.accountId, orgId);
      const fmt = (n: number) => (n / 100).toFixed(2);
      const cur = account?.currency ?? '';
      this.telegram.notify(orgId, `📋 *Nueva deuda*\n━━━━━━━━━━━━━━━━━━\n👤 Persona       : ${debt.personName}\n📋 Descripcion : ${dto.description}\n💰 Monto          : ${fmt(dto.totalAmount)} ${cur}\n🔖 Tipo              : ${dto.type === 'RECEIVABLE' ? 'Por cobrar' : 'Por pagar'}\n🏦 Cuenta        : ${account?.name ?? '?'}\n💵 Saldo           : ${fmt(balance)} ${cur}\n━━━━━━━━━━━━━━━━━━`);

      return debt;
    });
  }

  async findAll(orgId: string, query: DebtQueryDto) {
    const where: Prisma.DebtWhereInput = { orgId };

    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;

    const debts = await this.prisma.debt.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        transactions: {
          take: 1,
          orderBy: { createdAt: 'asc' },
          include: { account: { select: { currency: true } } },
        },
      },
    });

    return debts.map((debt) => {
      const { transactions, ...rest } = debt;
      return {
        ...rest,
        currency: transactions[0]?.account?.currency ?? 'USD',
      };
    });
  }

  async findOne(orgId: string, id: string) {
    const debt = await this.prisma.debt.findFirst({
      where: { id, orgId },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          include: { account: true },
        },
      },
    });

    if (!debt) {
      throw new NotFoundException(`Debt with id ${id} not found`);
    }

    const currency = debt.transactions[0]?.account?.currency ?? 'USD';
    return { ...debt, currency };
  }

  async update(orgId: string, id: string, dto: UpdateDebtDto) {
    const debt = await this.prisma.debt.findFirst({
      where: { id, orgId },
    });

    if (!debt) {
      throw new NotFoundException(`Debt with id ${id} not found`);
    }

    return this.prisma.debt.update({
      where: { id },
      data: {
        ...(dto.personName !== undefined && { personName: dto.personName }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.dueDate !== undefined && { dueDate: new Date(dto.dueDate) }),
      },
    });
  }

  async remove(orgId: string, id: string) {
    const debt = await this.prisma.debt.findFirst({
      where: { id, orgId },
    });

    if (!debt) {
      throw new NotFoundException(`Debt with id ${id} not found`);
    }

    const deleted = await this.prisma.debt.delete({
      where: { id },
    });

    this.telegram.notify(orgId, `🗑 *Deuda eliminada*\n━━━━━━━━━━━━━━━━━━\n👤 Persona       : ${debt.personName}\n📋 Descripcion : ${debt.description}\n━━━━━━━━━━━━━━━━━━`);

    return deleted;
  }

  async addPayment(
    orgId: string,
    userId: string,
    debtId: string,
    dto: AddPaymentDto,
  ) {
    const debt = await this.prisma.debt.findFirst({
      where: { id: debtId, orgId },
    });

    if (!debt) {
      throw new NotFoundException(`Debt with id ${debtId} not found`);
    }

    if (debt.status === 'PAID') {
      throw new BadRequestException('This debt is already fully paid');
    }

    const remaining = debt.totalAmount - debt.paidAmount;
    if (dto.amount > remaining) {
      throw new BadRequestException(
        `Payment amount (${dto.amount}) exceeds remaining balance (${remaining})`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // RECEIVABLE debts: payments are INCOME (money coming in).
      // PAYABLE debts: payments are EXPENSE (money going out).
      const transactionType = debt.type === 'RECEIVABLE' ? 'INCOME' : 'EXPENSE';

      const transaction = await tx.transaction.create({
        data: {
          date: new Date(dto.date),
          description: dto.description || `Payment for debt: ${debt.description}`,
          amount: dto.amount,
          type: transactionType,
          accountId: dto.accountId,
          categoryId: await this.loanCategoryId(tx, orgId),
          debtId,
          orgId,
          createdBy: userId,
        },
      });

      const newPaidAmount = debt.paidAmount + dto.amount;
      const newStatus: DebtStatus = newPaidAmount >= debt.totalAmount ? 'PAID' : 'PARTIAL';

      await tx.debt.update({
        where: { id: debtId },
        data: {
          paidAmount: newPaidAmount,
          status: newStatus,
        },
      });

      const account = await tx.account.findUnique({ where: { id: dto.accountId }, select: { name: true, currency: true } });
      const balance = await computeAccountBalance(tx, dto.accountId, orgId);
      const fmt = (n: number) => (n / 100).toFixed(2);
      const cur = account?.currency ?? '';
      const statusLabel = newStatus === 'PAID' ? '\n✅ Estado         : Pagada completa' : '';
      this.telegram.notify(orgId, `💰 *Pago registrado*\n━━━━━━━━━━━━━━━━━━\n👤 Persona       : ${debt.personName}\n📋 Descripcion : ${debt.description}\n💰 Monto          : ${fmt(dto.amount)} ${cur}\n📊 Pagado        : ${fmt(newPaidAmount)} / ${fmt(debt.totalAmount)} ${cur}${statusLabel}\n🏦 Cuenta        : ${account?.name ?? '?'}\n💵 Saldo           : ${fmt(balance)} ${cur}\n━━━━━━━━━━━━━━━━━━`);

      return transaction;
    });
  }

}
