import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { CreateDebtDto, UpdateDebtDto, AddPaymentDto, DebtQueryDto } from './dto';
import { computeAccountBalance } from '../../common/account-balance.util';
import { parseEntryDate } from '../../common/date-range.util';
import { assertOrgRefs } from '../../common/org-refs.util';
import { debtInitialType, debtPaymentType, recomputeDebt } from '../../common/debt-balance.util';
import { COUNTED } from '../../common/tx-filters';

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
      // La deuda va en la moneda de la cuenta con la que se abre.
      const accounts = await assertOrgRefs(tx, orgId, { accountIds: [dto.accountId] });
      const currency = accounts.get(dto.accountId)!.currency;

      const debt = await tx.debt.create({
        data: {
          personName: dto.personName,
          description: dto.description,
          totalAmount: dto.totalAmount,
          type: dto.type,
          currency,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          createdBy: userId,
          orgId,
        },
      });

      // Create initial transaction linked to the debt.
      // RECEIVABLE = we lent money, so money goes OUT (EXPENSE).
      // PAYABLE = we borrowed money, so money comes IN (INCOME).
      await tx.transaction.create({
        data: {
          date: dto.date ? parseEntryDate(dto.date) : new Date(),
          description: `Debt: ${dto.description}`,
          amount: dto.totalAmount,
          type: debtInitialType(dto.type),
          accountId: dto.accountId,
          categoryId: await this.loanCategoryId(tx, orgId),
          debtId: debt.id,
          orgId,
          createdBy: userId,
        },
      });

      const account = accounts.get(dto.accountId);
      const balance = await computeAccountBalance(tx, dto.accountId, orgId);
      const fmt = (n: number) => (n / 100).toFixed(2);
      const cur = currency;
      this.telegram.notify(orgId, `📋 *Nueva deuda*\n━━━━━━━━━━━━━━━━━━\n👤 Persona       : ${debt.personName}\n📋 Descripcion : ${dto.description}\n💰 Monto          : ${fmt(dto.totalAmount)} ${cur}\n🔖 Tipo              : ${dto.type === 'RECEIVABLE' ? 'Por cobrar' : 'Por pagar'}\n🏦 Cuenta        : ${account?.name ?? '?'}\n💵 Saldo           : ${fmt(balance)} ${cur}\n━━━━━━━━━━━━━━━━━━`);

      return debt;
    });
  }

  async findAll(orgId: string, query: DebtQueryDto) {
    const where: Prisma.DebtWhereInput = { orgId, deletedAt: null };

    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;

    return this.prisma.debt.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(orgId: string, id: string) {
    const debt = await this.prisma.debt.findFirst({
      where: { id, orgId, deletedAt: null },
      include: {
        transactions: {
          where: COUNTED,
          orderBy: { createdAt: 'desc' },
          include: { account: true },
        },
      },
    });

    if (!debt) {
      throw new NotFoundException(`Debt with id ${id} not found`);
    }

    return debt;
  }

  async update(orgId: string, id: string, dto: UpdateDebtDto) {
    const debt = await this.prisma.debt.findFirst({
      where: { id, orgId, deletedAt: null },
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

  /**
   * Borrado suave de la deuda y de sus movimientos a la vez.
   *
   * Antes se borraba la deuda de verdad y sus movimientos se quedaban con
   * `debtId` a null: el prestamo y los pagos pasaban a contar como gasto e
   * ingreso normales en el panel, Analisis y presupuestos.
   */
  async remove(orgId: string, id: string) {
    const debt = await this.prisma.debt.findFirst({
      where: { id, orgId, deletedAt: null },
    });

    if (!debt) {
      throw new NotFoundException(`Debt with id ${id} not found`);
    }

    const now = new Date();
    const deleted = await this.prisma.$transaction(async (tx) => {
      await tx.transaction.updateMany({
        where: { debtId: id, deletedAt: null },
        data: { deletedAt: now, deleteReason: 'Deuda eliminada' },
      });
      return tx.debt.update({ where: { id }, data: { deletedAt: now } });
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
      where: { id: debtId, orgId, deletedAt: null },
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
      // Los pagos van en la moneda de la deuda. Si alguien paga en otra, se
      // anota primero el cambio de moneda y luego el pago.
      const accounts = await assertOrgRefs(tx, orgId, { accountIds: [dto.accountId] });
      const account = accounts.get(dto.accountId)!;
      if (account.currency !== debt.currency) {
        throw new BadRequestException(`This debt is in ${debt.currency}; pay it from an account in ${debt.currency}`);
      }

      // RECEIVABLE debts: payments are INCOME (money coming in).
      // PAYABLE debts: payments are EXPENSE (money going out).
      const transaction = await tx.transaction.create({
        data: {
          date: parseEntryDate(dto.date),
          description: dto.description || `Payment for debt: ${debt.description}`,
          amount: dto.amount,
          type: debtPaymentType(debt.type),
          accountId: dto.accountId,
          categoryId: await this.loanCategoryId(tx, orgId),
          debtId,
          orgId,
          createdBy: userId,
        },
      });

      await recomputeDebt(tx, debtId);
      const { paidAmount: newPaidAmount, status: newStatus } = await tx.debt.findUniqueOrThrow({ where: { id: debtId } });

      const balance = await computeAccountBalance(tx, dto.accountId, orgId);
      const fmt = (n: number) => (n / 100).toFixed(2);
      const cur = debt.currency;
      const statusLabel = newStatus === 'PAID' ? '\n✅ Estado         : Pagada completa' : '';
      this.telegram.notify(orgId, `💰 *Pago registrado*\n━━━━━━━━━━━━━━━━━━\n👤 Persona       : ${debt.personName}\n📋 Descripcion : ${debt.description}\n💰 Monto          : ${fmt(dto.amount)} ${cur}\n📊 Pagado        : ${fmt(newPaidAmount)} / ${fmt(debt.totalAmount)} ${cur}${statusLabel}\n🏦 Cuenta        : ${account.name}\n💵 Saldo           : ${fmt(balance)} ${cur}\n━━━━━━━━━━━━━━━━━━`);

      return transaction;
    });
  }

}
