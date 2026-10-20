import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Debt, Prisma, TransactionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { computeAccountBalance } from '../../common/account-balance.util';
import { debtInitialType, debtPaymentType, recomputeDebt } from '../../common/debt-balance.util';
import { decideStatusFor, statusFields } from '../../common/approval-policy';
import { Actor, ENTRY_HEAD, PENDING_LIVE, canApprove } from '../../common/tx-filters';
import { TelegramService } from '../telegram/telegram.service';
import { assertOpenPeriod } from '../../common/period-lock.util';
import { TransactionsService, isPair, snapshot } from '../transactions/transactions.service';
import { UpdateTransactionDto } from '../transactions/dto';
import { ApprovalQueryDto } from './dto';

const ENTRY_INCLUDE = {
  account: true,
  category: true,
  debt: true,
  linkedTransaction: { include: { account: true } },
} satisfies Prisma.TransactionInclude;

type Head = Prisma.TransactionGetPayload<{ include: typeof ENTRY_INCLUDE }>;

export type EntryKind = 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'EXCHANGE' | 'DEBT_CREATE' | 'DEBT_PAYMENT';

/** Una entrada de la bandeja: un gasto, un par completo, una deuda o un pago. */
interface Entry {
  head: Head;
  debt: Debt | null;
  kind: EntryKind;
  legIds: string[];
}

const KIND_LABEL: Record<EntryKind, string> = {
  INCOME: 'Ingreso',
  EXPENSE: 'Gasto',
  TRANSFER: 'Transferencia',
  EXCHANGE: 'Cambio',
  DEBT_CREATE: 'Deuda nueva',
  DEBT_PAYMENT: 'Pago de deuda',
};

function kindOf(head: { type: Head['type'] }, debt: Debt | null): EntryKind {
  if (debt) return head.type === debtInitialType(debt.type) ? 'DEBT_CREATE' : 'DEBT_PAYMENT';
  return head.type;
}

const hasEdits = (e?: UpdateTransactionDto) => !!e && Object.values(e).some((v) => v !== undefined);

/**
 * Aprobacion de movimientos (maker-checker).
 *
 * Lo que anota un contador sin autoconfirmar queda PENDING y no cuenta en
 * ningun numero hasta que un propietario o admin lo aprueba (pudiendo
 * corregirlo antes) o lo rechaza con un motivo. El autor puede editar, reenviar
 * o retirar lo suyo mientras no este aprobado.
 */
@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactions: TransactionsService,
    private readonly telegram: TelegramService,
  ) {}

  // ─── Lectura ─────────────────────────────────────────────────────

  async list(orgId: string, actor: Actor, q: ApprovalQueryDto) {
    const review = (q.scope ?? 'review') === 'review';
    if (review && !canApprove(actor.role)) {
      throw new ForbiddenException('Only owners and admins review entries');
    }
    const statuses = q.status?.length
      ? q.status
      : review
        ? [TransactionStatus.PENDING]
        : [TransactionStatus.PENDING, TransactionStatus.REJECTED];

    const heads = await this.prisma.transaction.findMany({
      where: {
        orgId,
        deletedAt: null,
        ...ENTRY_HEAD,
        status: { in: statuses },
        ...(!review && { createdBy: actor.userId }),
      },
      include: ENTRY_INCLUDE,
      // La bandeja, de lo mas antiguo a lo mas nuevo; lo mio, al reves.
      orderBy: { createdAt: review ? 'asc' : 'desc' },
      take: 200,
    });

    const names = await this.userNames(heads.flatMap((h) => [h.createdBy, h.reviewedBy]));
    return { data: heads.map((h) => this.toItem(h, names)), counts: await this.counts(orgId, actor) };
  }

  async counts(orgId: string, actor: Actor) {
    const entries = (status: TransactionStatus, extra: Prisma.TransactionWhereInput = {}) =>
      this.prisma.transaction.count({ where: { orgId, deletedAt: null, status, ...ENTRY_HEAD, ...extra } });
    const writer = actor.role !== 'VIEWER';
    const [toReview, pending, rejected, unreadNotifications] = await Promise.all([
      canApprove(actor.role) ? entries(TransactionStatus.PENDING) : 0,
      writer ? entries(TransactionStatus.PENDING, { createdBy: actor.userId }) : 0,
      writer ? entries(TransactionStatus.REJECTED, { createdBy: actor.userId }) : 0,
      this.prisma.notification.count({ where: { orgId, userId: actor.userId, isRead: false } }),
    ]);
    return { toReview, mine: { pending, rejected }, unreadNotifications };
  }

  // ─── Quien aprueba ───────────────────────────────────────────────

  async approve(orgId: string, actor: Actor, id: string, edits?: UpdateTransactionDto) {
    const { entry, before, after, edited } = await this.prisma.$transaction(async (tx) => {
      const entry = await this.lockEntry(tx, orgId, id);
      if (entry.head.status !== TransactionStatus.PENDING) {
        throw new ConflictException('This entry was already reviewed');
      }
      // Aprobar algo de un mes cerrado cambiaria sus numeros congelados.
      await assertOpenPeriod(tx, orgId, [entry.head.date]);

      let before = snapshot(entry.head, entry.head.linkedTransaction ?? undefined);
      if (hasEdits(edits)) {
        await this.checkDebtEdits(tx, entry, edits!);
        before = (await this.transactions.applyEdits(tx, orgId, entry.head, edits!)).before;
      }

      const now = new Date();
      await tx.transaction.updateMany({
        where: { id: { in: entry.legIds } },
        data: { status: TransactionStatus.APPROVED, reviewedBy: actor.userId, reviewedAt: now, rejectionReason: null },
      });
      const approved = await tx.transaction.findUniqueOrThrow({ where: { id: entry.head.id }, include: ENTRY_INCLUDE });
      const edited = JSON.stringify(before) !== JSON.stringify(snapshot(approved, approved.linkedTransaction ?? undefined));
      // Lo que envio el autor se guarda solo si se corrigio algo.
      const after = edited
        ? await tx.transaction.update({ where: { id: approved.id }, data: { originalSnapshot: before as Prisma.InputJsonValue }, include: ENTRY_INCLUDE })
        : approved;

      if (entry.debt) {
        if (entry.kind === 'DEBT_CREATE') {
          await tx.debt.update({ where: { id: entry.debt.id }, data: { approvalStatus: TransactionStatus.APPROVED } });
        }
        await recomputeDebt(tx, entry.debt.id);
      }

      await tx.auditLog.create({
        data: {
          action: 'APPROVE',
          entity: 'Transaction',
          entityId: after.id,
          changes: edited ? ({ before, after: snapshot(after, after.linkedTransaction ?? undefined) } as Prisma.InputJsonValue) : undefined,
          userId: actor.userId,
          orgId,
        },
      });
      await this.notifyAuthor(tx, orgId, actor, after, 'APPROVAL_APPROVED', edited ? 'Aprobado con correcciones' : 'Aprobado', after.description);
      return { entry, before, after, edited };
    });

    this.announceApproved(orgId, actor, entry.kind, before, after, edited);
    return this.item(after);
  }

  async reject(orgId: string, actor: Actor, id: string, reason: string) {
    const after = await this.prisma.$transaction(async (tx) => {
      const entry = await this.lockEntry(tx, orgId, id);
      if (entry.head.status !== TransactionStatus.PENDING) {
        throw new ConflictException('This entry was already reviewed');
      }
      await tx.transaction.updateMany({
        where: { id: { in: entry.legIds } },
        data: { status: TransactionStatus.REJECTED, reviewedBy: actor.userId, reviewedAt: new Date(), rejectionReason: reason.trim() },
      });
      if (entry.kind === 'DEBT_CREATE') {
        await tx.debt.update({ where: { id: entry.debt!.id }, data: { approvalStatus: TransactionStatus.REJECTED } });
      }
      await tx.auditLog.create({
        data: { action: 'REJECT', entity: 'Transaction', entityId: entry.head.id, metadata: { reason }, userId: actor.userId, orgId },
      });
      const after = await tx.transaction.findUniqueOrThrow({ where: { id: entry.head.id }, include: ENTRY_INCLUDE });
      await this.notifyAuthor(tx, orgId, actor, after, 'APPROVAL_REJECTED', 'Rechazado', `${after.description}: ${reason.trim()}`);
      return after;
    });

    const [names] = await Promise.all([this.userNames([actor.userId, after.createdBy])]);
    const fmt = (n: number) => (n / 100).toFixed(2);
    this.telegram.notify(orgId, `❌ *Rechazado* por ${names.get(actor.userId) ?? '?'}\n━━━━━━━━━━━━━━━━━━\n📋 ${after.description} — ${fmt(after.amount)} ${after.account.currency}\n👤 Lo anotó      : ${names.get(after.createdBy) ?? '?'}\n⚠️ Motivo        : ${reason.trim()}\n━━━━━━━━━━━━━━━━━━`);
    return this.item(after);
  }

  // ─── Quien lo anoto ──────────────────────────────────────────────

  /**
   * El autor corrige lo suyo pendiente o rechazado. Un rechazado corregido se
   * reenvia: vuelve a pasar por la regla de autoconfirmar con los nuevos datos.
   */
  async edit(orgId: string, actor: Actor, id: string, edits: UpdateTransactionDto) {
    return this.resubmitWith(orgId, actor, id, edits, false);
  }

  async resubmit(orgId: string, actor: Actor, id: string) {
    return this.resubmitWith(orgId, actor, id, undefined, true);
  }

  private async resubmitWith(orgId: string, actor: Actor, id: string, edits: UpdateTransactionDto | undefined, mustBeRejected: boolean) {
    const { after, status, wasRejected } = await this.prisma.$transaction(async (tx) => {
      const entry = await this.lockEntry(tx, orgId, id);
      this.assertAuthorCanChange(entry, actor);
      const wasRejected = entry.head.status === TransactionStatus.REJECTED;
      if (mustBeRejected && !wasRejected) throw new ConflictException('Only rejected entries can be resubmitted');
      // Con autoconfirmar podria entrar aprobado: no en un mes cerrado.
      await assertOpenPeriod(tx, orgId, [entry.head.date]);

      let before = snapshot(entry.head, entry.head.linkedTransaction ?? undefined);
      if (hasEdits(edits)) {
        await this.checkDebtEdits(tx, entry, edits!);
        before = (await this.transactions.applyEdits(tx, orgId, entry.head, edits!)).before;
      }
      const current = await tx.transaction.findUniqueOrThrow({ where: { id: entry.head.id }, include: ENTRY_INCLUDE });

      // Con los datos nuevos puede entrar ya aprobado (dentro del tope) o volver a esperar.
      const legs = [{ currency: current.account.currency, amount: current.amount }];
      if (current.linkedTransaction) legs.push({ currency: current.linkedTransaction.account.currency, amount: current.linkedTransaction.amount });
      const status = await decideStatusFor(tx, orgId, actor.userId, legs);
      await tx.transaction.updateMany({
        where: { id: { in: entry.legIds } },
        data: {
          ...statusFields(status, actor.userId),
          rejectionReason: null,
          ...(status === TransactionStatus.PENDING && { reviewedBy: null, reviewedAt: null }),
        },
      });
      if (entry.debt) {
        if (entry.kind === 'DEBT_CREATE') await tx.debt.update({ where: { id: entry.debt.id }, data: { approvalStatus: status } });
        await recomputeDebt(tx, entry.debt.id);
      }
      await tx.auditLog.create({
        data: {
          action: wasRejected ? 'RESUBMIT' : 'EDIT_PENDING',
          entity: 'Transaction',
          entityId: entry.head.id,
          changes: hasEdits(edits) ? ({ before, after: snapshot(current, current.linkedTransaction ?? undefined) } as Prisma.InputJsonValue) : undefined,
          metadata: { status },
          userId: actor.userId,
          orgId,
        },
      });
      const after = await tx.transaction.findUniqueOrThrow({ where: { id: entry.head.id }, include: ENTRY_INCLUDE });
      return { after, status, wasRejected };
    });

    if (status === TransactionStatus.PENDING && wasRejected) this.telegram.notifyPending(orgId, actor.userId, after);
    return this.item(after);
  }

  /** El autor retira lo suyo pendiente o rechazado (queda en la papelera). */
  async withdraw(orgId: string, actor: Actor, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const entry = await this.lockEntry(tx, orgId, id);
      this.assertAuthorCanChange(entry, actor);
      const now = new Date();
      const reason = 'Retirado por el autor';
      if (entry.kind === 'DEBT_CREATE') {
        // Retirar una deuda nueva es retirarla entera.
        await tx.transaction.updateMany({ where: { debtId: entry.debt!.id, deletedAt: null }, data: { deletedAt: now, deleteReason: reason } });
        await tx.debt.update({ where: { id: entry.debt!.id }, data: { deletedAt: now } });
      } else {
        await tx.transaction.updateMany({ where: { id: { in: entry.legIds } }, data: { deletedAt: now, deleteReason: reason } });
        if (entry.debt) await recomputeDebt(tx, entry.debt.id);
      }
      await tx.auditLog.create({
        data: { action: 'WITHDRAW', entity: 'Transaction', entityId: entry.head.id, userId: actor.userId, orgId },
      });
      return { id: entry.head.id, withdrawn: true };
    });
  }

  // ─── Ayudas ──────────────────────────────────────────────────────

  /**
   * Carga una entrada desde cualquiera de sus piernas y bloquea sus filas hasta
   * el final de la transaccion. Asi, si dos admins aprueban a la vez, el segundo
   * espera y luego ve que ya no esta pendiente (409) en vez de pisar al primero.
   */
  private async lockEntry(tx: Prisma.TransactionClient, orgId: string, id: string): Promise<Entry> {
    const row = await tx.transaction.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!row) throw new NotFoundException(`Entry ${id} not found`);

    let headId = row.id;
    const legIds = [row.id];
    if (isPair(row.type)) {
      const pair = await this.transactions.findPair(tx, row, { deletedAt: null });
      if (!pair) throw new BadRequestException('This transfer has lost its other side; delete it and enter it again');
      headId = pair.out.id;
      legIds.splice(0, 1, pair.out.id, pair.inc.id);
    }
    await tx.$queryRaw`SELECT "id" FROM "transactions" WHERE "id" IN (${Prisma.join(legIds)}) FOR UPDATE`;

    const head = await tx.transaction.findUniqueOrThrow({ where: { id: headId }, include: ENTRY_INCLUDE });
    const debt = head.debtId ? await tx.debt.findUnique({ where: { id: head.debtId } }) : null;
    return { head, debt, kind: kindOf(head, debt), legIds };
  }

  private assertAuthorCanChange(entry: Entry, actor: Actor) {
    if (entry.head.createdBy !== actor.userId) {
      throw new ForbiddenException('Only the author can change this entry before it is reviewed');
    }
    if (entry.head.status === TransactionStatus.APPROVED) {
      throw new ConflictException('This entry is already approved; ask an admin to change it');
    }
  }

  /** En deudas no se cambia de deuda, y un pago no puede pasarse de lo que falta. */
  private async checkDebtEdits(tx: Prisma.TransactionClient, entry: Entry, edits: UpdateTransactionDto) {
    if (!entry.debt) return;
    if (edits.debtId !== undefined && edits.debtId !== entry.debt.id) {
      throw new BadRequestException('A debt movement cannot be moved to another debt');
    }
    if (entry.kind === 'DEBT_PAYMENT' && edits.amount !== undefined) {
      const debt = entry.debt;
      const others = await tx.transaction.aggregate({
        where: { debtId: debt.id, ...PENDING_LIVE, type: debtPaymentType(debt.type), id: { not: entry.head.id } },
        _sum: { amount: true },
      });
      const remaining = debt.totalAmount - debt.paidAmount - (others._sum.amount ?? 0);
      if (edits.amount > remaining) {
        throw new BadRequestException(`Payment amount (${edits.amount}) exceeds remaining balance (${remaining})`);
      }
    }
  }

  private async notifyAuthor(
    tx: Prisma.TransactionClient,
    orgId: string,
    actor: Actor,
    t: Head,
    type: string,
    title: string,
    message: string,
  ) {
    if (t.createdBy === actor.userId) return;
    await tx.notification.create({
      data: { title, message, type, userId: t.createdBy, orgId, metadata: { transactionId: t.id } },
    });
  }

  /** Aviso al grupo: aprobado, que se corrigio y el saldo que queda (ahora si cuenta). */
  private async announceApproved(orgId: string, actor: Actor, kind: EntryKind, before: ReturnType<typeof snapshot>, after: Head, edited: boolean) {
    try {
      const names = await this.userNames([actor.userId, after.createdBy]);
      const fmt = (n: number) => (n / 100).toFixed(2);
      const changes: string[] = [];
      if (edited) {
        const accountNames = await this.prisma.account.findMany({
          where: { id: { in: [before.accountId, after.accountId] } },
          select: { id: true, name: true },
        });
        const acc = (id: string) => accountNames.find((a) => a.id === id)?.name ?? '?';
        if (before.amount !== after.amount) changes.push(`Monto: ${fmt(before.amount)} → ${fmt(after.amount)} ${after.account.currency}`);
        if (before.accountId !== after.accountId) changes.push(`Cuenta: ${acc(before.accountId)} → ${after.account.name}`);
        if (before.description !== after.description) changes.push(`Descripción: ${before.description} → ${after.description}`);
        if (before.categoryId !== after.categoryId) changes.push(`Categoría: → ${after.category?.name ?? 'sin categoría'}`);
        if (+new Date(before.date) !== +after.date) changes.push('Fecha corregida');
        if ('toAmount' in before && after.linkedTransaction && before.toAmount !== after.linkedTransaction.amount) {
          changes.push(`Recibe: ${fmt(before.toAmount!)} → ${fmt(after.linkedTransaction.amount)} ${after.linkedTransaction.account.currency}`);
        }
      }
      const balance = await computeAccountBalance(this.prisma, after.accountId, orgId);
      const fixes = changes.length ? `\n✏️ Correcciones:\n${changes.map((c) => `   • ${c}`).join('\n')}` : '';
      this.telegram.notify(orgId, `✅ *Aprobado* por ${names.get(actor.userId) ?? '?'}\n━━━━━━━━━━━━━━━━━━\n🔖 ${KIND_LABEL[kind]}: ${after.description}\n💰 Monto          : ${fmt(after.amount)} ${after.account.currency}\n🏦 Cuenta        : ${after.account.name}\n👤 Lo anotó      : ${names.get(after.createdBy) ?? '?'}${fixes}\n💵 Saldo           : ${fmt(balance)} ${after.account.currency}\n━━━━━━━━━━━━━━━━━━`);
    } catch {
      // El aviso es opcional: la aprobacion ya esta hecha.
    }
  }

  private async userNames(ids: (string | null)[]) {
    const unique = [...new Set(ids.filter((x): x is string => !!x))];
    const users = unique.length ? await this.prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } }) : [];
    return new Map(users.map((u) => [u.id, u.name]));
  }

  private async item(head: Head) {
    return this.toItem(head, await this.userNames([head.createdBy, head.reviewedBy]));
  }

  /** Lo que ve la bandeja de una entrada. */
  private toItem(h: Head, names: Map<string, string>) {
    const debt = h.debt;
    return {
      id: h.id,
      kind: kindOf(h, debt),
      status: h.status,
      date: h.date,
      description: h.description,
      notes: h.notes,
      source: h.source,
      author: { id: h.createdBy, name: names.get(h.createdBy) ?? null },
      submittedAt: h.submittedAt ?? h.createdAt,
      reviewer: h.reviewedBy ? { id: h.reviewedBy, name: names.get(h.reviewedBy) ?? null } : null,
      reviewedAt: h.reviewedAt,
      rejectionReason: h.rejectionReason,
      originalSnapshot: h.originalSnapshot,
      from: { accountId: h.accountId, accountName: h.account.name, currency: h.account.currency, amount: h.amount },
      to: h.linkedTransaction
        ? {
            accountId: h.linkedTransaction.accountId,
            accountName: h.linkedTransaction.account.name,
            currency: h.linkedTransaction.account.currency,
            amount: h.linkedTransaction.amount,
          }
        : null,
      category: h.category ? { id: h.category.id, name: h.category.name, icon: h.category.icon, color: h.category.color } : null,
      debt: debt ? { id: debt.id, personName: debt.personName, description: debt.description, type: debt.type, currency: debt.currency } : null,
    };
  }
}
