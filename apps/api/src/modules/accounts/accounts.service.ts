import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TransactionStatus } from '@prisma/client';
import { computeAccountBalance, computeAccountBalances } from '../../common/account-balance.util';
import { Actor, PENDING_LIVE, pendingScope } from '../../common/tx-filters';
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

  /**
   * Cuentas con su saldo (solo lo aprobado) y, aparte, lo que moveria lo
   * pendiente que el usuario puede ver: `pendingDelta` y `pendingCount`.
   */
  async findAll(orgId: string, actor: Actor) {
    const accounts = await this.prisma.account.findMany({
      where: { orgId, isActive: true },
      orderBy: { name: 'asc' },
    });
    const accountIds = accounts.map((a) => a.id);
    const scope = pendingScope(actor);

    const [balanceMap, pendingMap, pendingRows] = await Promise.all([
      computeAccountBalances(this.prisma, orgId, { accountIds }),
      scope
        ? computeAccountBalances(this.prisma, orgId, { accountIds, statuses: [TransactionStatus.PENDING], extraWhere: scope })
        : new Map<string, number>(),
      scope
        ? this.prisma.transaction.groupBy({
            by: ['accountId'],
            where: { orgId, accountId: { in: accountIds }, ...PENDING_LIVE, ...scope },
            _count: { _all: true },
          })
        : [],
    ]);
    const pendingCount = new Map(pendingRows.map((r) => [r.accountId, r._count._all]));

    return accounts.map((account) => ({
      ...account,
      balance: balanceMap.get(account.id) ?? 0,
      pendingDelta: pendingMap.get(account.id) ?? 0,
      pendingCount: pendingCount.get(account.id) ?? 0,
    }));
  }

  async findOne(orgId: string, id: string) {
    const account = await this.prisma.account.findFirst({
      where: { id, orgId },
    });

    if (!account) {
      throw new NotFoundException(`Account with id ${id} not found`);
    }

    const balance = await computeAccountBalance(this.prisma, account.id, orgId);
    return { ...account, balance };
  }

  async update(orgId: string, id: string, dto: UpdateAccountDto) {
    const account = await this.prisma.account.findFirst({
      where: { id, orgId },
    });

    if (!account) {
      throw new NotFoundException(`Account with id ${id} not found`);
    }

    // Cambiar la moneda de una cuenta con historia reetiquetaria todos sus
    // importes: 6 400 MN pasarian a ser 6 400 USD.
    if (dto.currency !== undefined && dto.currency !== account.currency) {
      const used = await this.prisma.transaction.count({ where: { accountId: id } });
      if (used > 0) {
        throw new ConflictException('This account already has movements; its currency cannot be changed');
      }
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

    const balance = await computeAccountBalance(this.prisma, id, orgId);
    const fmt = (n: number) => (n / 100).toFixed(2);

    const result = await this.prisma.account.update({
      where: { id },
      data: { isActive: false },
    });

    this.telegram.notify(orgId, `🗑 *Cuenta desactivada*\n${account.name} (${account.currency})\nSaldo final: ${fmt(balance)} ${account.currency}`);

    return result;
  }
}
