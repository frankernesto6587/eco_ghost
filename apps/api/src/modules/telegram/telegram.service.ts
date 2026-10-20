import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { computeAccountBalance, computeAccountBalances } from '../../common/account-balance.util';
import { APP_TZ, resolveRange } from '../../common/date-range.util';
import { COUNTED, ENTRY_HEAD, PENDING_LIVE, flowWhere } from '../../common/tx-filters';
import { decideStatusFor, statusFields } from '../../common/approval-policy';
import { TransactionStatus } from '@prisma/client';

interface TelegramFrom {
  id: number;
  first_name?: string;
  username?: string;
}

interface TelegramMessage {
  message_id: number;
  chat: { id: number; title?: string; type: string };
  from?: TelegramFrom;
  text?: string;
  group_chat_created?: boolean;
  new_chat_members?: { id: number; is_bot?: boolean }[];
}

interface TelegramCallbackQuery {
  id: string;
  from: TelegramFrom;
  message?: { message_id: number; chat: { id: number } };
  data?: string;
}

interface TelegramUpdate {
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
  my_chat_member?: {
    chat: { id: number; title?: string; type: string };
    new_chat_member: { status: string; user: { id: number } };
  };
}

/** Pending expense waiting for confirmation or category */
interface PendingExpense {
  /** Cuando se pregunto: las elecciones a medio hacer caducan (ver PENDING_TTL_MS). */
  createdAt: number;
  amount: number;
  description: string;
  orgId: string;
  userId: string;
  accountId: string;
  accountName: string;
  currency: string;
  botMessageId?: number;
  chatId: number;
}

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly botToken: string;

  /** In-memory store for pending expenses: key = `${chatId}:${messageId}` */
  private pendingExpenses = new Map<string, PendingExpense>();

  /**
   * Las elecciones a medio hacer viven en memoria: se pierden al reiniciar (se
   * acepta, duran segundos) y sin limpieza el mapa solo crecia.
   */
  private static readonly PENDING_TTL_MS = 15 * 60 * 1000;

  private getPending(key: string): PendingExpense | undefined {
    const pending = this.getPending(key);
    if (pending && Date.now() - pending.createdAt > TelegramService.PENDING_TTL_MS) {
      this.pendingExpenses.delete(key);
      return undefined;
    }
    return pending;
  }

  private sweepPending() {
    const now = Date.now();
    for (const [key, p] of this.pendingExpenses) {
      if (now - p.createdAt > TelegramService.PENDING_TTL_MS) this.pendingExpenses.delete(key);
    }
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.botToken = this.config.get<string>('TELEGRAM_BOT_TOKEN', '');
  }

  // ─── Handle incoming Telegram update ────────────────────────────────

  async handleUpdate(update: TelegramUpdate) {
    // Handle callback queries (inline button presses)
    if (update.callback_query) {
      await this.handleCallbackQuery(update.callback_query);
      return;
    }

    const msg = update.message;
    if (!msg?.text && !msg?.group_chat_created && !msg?.new_chat_members) return;

    const chatId = msg.chat.id;
    const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';

    // Always delete user messages in groups
    if (isGroup && msg.message_id) {
      this.deleteMessage(chatId, msg.message_id).catch(() => {});
    }

    if (!msg.text) return;
    const text = msg.text.trim();

    // ─── Handle commands first ─────────────────────────────────

    // /start with payload (deep link for groups)
    if (text.startsWith('/start')) {
      const parts = text.split(' ');
      if (parts.length > 1 && isGroup) {
        await this.handleConnect(chatId, parts[1], msg.chat.title);
      }
      return;
    }

    // Strip @botUsername from commands
    const firstWord = text.split(' ')[0].split('@')[0].toLowerCase();

    if (firstWord.startsWith('/')) {
      switch (firstWord) {
        case '/conectar': {
          const token = text.split(' ')[1];
          if (!token) {
            await this.sendTempMessage(chatId, 'Uso: /conectar <token de invitacion>');
            return;
          }
          await this.handleConnect(chatId, token, msg.chat.title);
          return;
        }
        case '/balance':
          await this.handleBalance(chatId);
          return;
        case '/resumen':
          await this.handleResumen(chatId);
          return;
        case '/deudas':
          await this.handleDeudas(chatId);
          return;
        case '/desconectar':
          await this.handleDisconnect(chatId);
          return;
        case '/cuenta':
          await this.handleCuentaCommand(chatId, msg.from);
          return;
        default:
          return; // Unknown command, ignore
      }
    }

    // ─── Non-command messages in groups ─────────────────────────

    if (!isGroup) return; // Ignore private chat non-commands

    const org = await this.findOrgByChatId(chatId, true);
    if (!org) return; // Group not connected, silently ignore

    const telegramUserId = msg.from?.id;
    if (!telegramUserId) return;

    // Check if user is linked
    const user = await this.findUserByTelegramId(telegramUserId);

    if (!user) {
      // Check if this is a linking code (6-digit number)
      if (/^\d{6}$/.test(text)) {
        await this.handleLinkCode(chatId, telegramUserId, text, msg.from!);
        return;
      }

      await this.sendTempMessage(
        chatId,
        `⚠️ *No estas vinculado*\n\nPara vincular tu cuenta:\n1. Abre la app → Perfil → Vincular Telegram\n2. Copia el codigo de 6 digitos\n3. Pegalo aqui en el grupo`,
      );
      return;
    }

    // Check role
    const membership = await this.prisma.orgMember.findFirst({
      where: { userId: user.id, orgId: org.id },
      select: { role: true },
    });

    if (!membership) {
      await this.sendTempMessage(chatId, '⚠️ No eres miembro de esta organizacion.');
      return;
    }

    const canWrite = ['OWNER', 'ADMIN', 'ACCOUNTANT'].includes(membership.role);
    if (!canWrite) {
      await this.sendTempMessage(chatId, '🚫 No tienes permisos para registrar gastos.');
      return;
    }

    // ─── Parse expense message ─────────────────────────────────

    const match = text.match(/^(\d+)\s+(.+)$/);
    if (!match) return; // Not an expense format, just deleted

    const amount = parseInt(match[1], 10);
    const description = match[2].trim();

    if (amount <= 0) return;

    // Check default account
    if (!org.defaultAccountId) {
      await this.promptDefaultAccount(chatId, org.id);
      return;
    }

    const account = await this.prisma.account.findUnique({
      where: { id: org.defaultAccountId },
      select: { id: true, name: true, currency: true },
    });

    if (!account) {
      await this.promptDefaultAccount(chatId, org.id);
      return;
    }

    // Show confirmation
    const fmt = (n: number) => (n / 100).toFixed(2);
    const confirmMsg = await this.sendMessageWithButtons(
      chatId,
      `💸 *Registrar gasto?*\n━━━━━━━━━━━━━━━━━━\n💰 Monto          : ${fmt(amount * 100)} ${account.currency}\n📋 Descripcion : ${this.escape(description)}\n🏦 Cuenta        : ${account.name}`,
      [[
        { text: '✅ Confirmar', callback_data: 'exp_confirm' },
        { text: '❌ Cancelar', callback_data: 'exp_cancel' },
      ]],
    );

    if (confirmMsg) {
      const key = `${chatId}:${confirmMsg.message_id}`;
      this.sweepPending();
      this.pendingExpenses.set(key, {
        createdAt: Date.now(),
        amount: amount * 100, // Store in cents
        description,
        orgId: org.id,
        userId: user.id,
        accountId: account.id,
        accountName: account.name,
        currency: account.currency,
        botMessageId: confirmMsg.message_id,
        chatId,
      });
    }
  }

  // ─── Callback query handler ─────────────────────────────────────────

  private async handleCallbackQuery(cq: TelegramCallbackQuery) {
    const data = cq.data ?? '';
    const chatId = cq.message?.chat.id;
    const messageId = cq.message?.message_id;

    if (!chatId || !messageId) {
      await this.answerCallbackQuery(cq.id);
      return;
    }

    // Default account selection
    if (data.startsWith('acct:')) {
      await this.handleAccountSelection(cq, data);
      return;
    }

    const key = `${chatId}:${messageId}`;

    // Expense confirmation
    if (data === 'exp_confirm') {
      const pending = this.getPending(key);
      if (!pending) {
        await this.answerCallbackQuery(cq.id, 'Operacion expirada');
        await this.deleteMessage(chatId, messageId);
        return;
      }

      // Show parent categories first
      await this.showParentCategories(chatId, messageId, pending, 0);
      await this.answerCallbackQuery(cq.id);
      return;
    }

    if (data === 'exp_cancel') {
      this.pendingExpenses.delete(key);
      await this.deleteMessage(chatId, messageId);
      await this.answerCallbackQuery(cq.id, 'Cancelado');
      return;
    }

    // Parent category pagination
    if (data.startsWith('exp_ppage:')) {
      const page = parseInt(data.split(':')[1], 10);
      const pending = this.getPending(key);
      if (!pending) {
        await this.answerCallbackQuery(cq.id, 'Operacion expirada');
        await this.deleteMessage(chatId, messageId);
        return;
      }
      await this.showParentCategories(chatId, messageId, pending, page);
      await this.answerCallbackQuery(cq.id);
      return;
    }

    // Parent category selected → show children
    if (data.startsWith('exp_parent:')) {
      const parts = data.split(':');
      const parentId = parts[1];
      const page = parseInt(parts[2] ?? '0', 10);
      const pending = this.getPending(key);
      if (!pending) {
        await this.answerCallbackQuery(cq.id, 'Operacion expirada');
        await this.deleteMessage(chatId, messageId);
        return;
      }
      await this.showChildCategories(chatId, messageId, pending, parentId, page);
      await this.answerCallbackQuery(cq.id);
      return;
    }

    // Category selection (final)
    if (data.startsWith('exp_cat:')) {
      const categoryId = data.substring(8);
      const pending = this.getPending(key);
      if (!pending) {
        await this.answerCallbackQuery(cq.id, 'Operacion expirada');
        await this.deleteMessage(chatId, messageId);
        return;
      }

      await this.saveExpense(pending, categoryId, chatId, messageId);
      this.pendingExpenses.delete(key);
      await this.answerCallbackQuery(cq.id, 'Gasto registrado ✅');
      return;
    }

    // Back to parent categories
    if (data === 'exp_back') {
      const pending = this.getPending(key);
      if (!pending) {
        await this.answerCallbackQuery(cq.id, 'Operacion expirada');
        await this.deleteMessage(chatId, messageId);
        return;
      }
      await this.showParentCategories(chatId, messageId, pending, 0);
      await this.answerCallbackQuery(cq.id);
      return;
    }

    await this.answerCallbackQuery(cq.id);
  }

  // ─── Show parent categories ─────────────────────────────────────────

  private async showParentCategories(
    chatId: number,
    messageId: number,
    pending: PendingExpense,
    page: number,
  ) {
    const PAGE_SIZE = 12; // 6 rows x 2 buttons

    const parents = await this.prisma.category.findMany({
      where: { orgId: pending.orgId, parentId: null },
      select: { id: true, name: true, _count: { select: { children: true } } },
      orderBy: { name: 'asc' },
    });

    if (parents.length === 0) {
      await this.editMessage(chatId, messageId, '⚠️ No hay categorias configuradas. Crea categorias en la app primero.', []);
      this.pendingExpenses.delete(`${chatId}:${messageId}`);
      return;
    }

    // Sort parents by usage frequency of their children
    const counts = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: { orgId: pending.orgId, type: 'EXPENSE', ...COUNTED, categoryId: { not: null } },
      _count: { id: true },
    });
    const countMap = new Map<string, number>();
    for (const row of counts) {
      if (row.categoryId) countMap.set(row.categoryId, row._count.id);
    }

    const allCategories = await this.prisma.category.findMany({
      where: { orgId: pending.orgId },
      select: { id: true, parentId: true },
    });

    // Sum child usage per parent
    const parentUsage = new Map<string, number>();
    for (const cat of allCategories) {
      const parentKey = cat.parentId ?? cat.id;
      parentUsage.set(parentKey, (parentUsage.get(parentKey) ?? 0) + (countMap.get(cat.id) ?? 0));
    }

    parents.sort((a, b) => {
      const diff = (parentUsage.get(b.id) ?? 0) - (parentUsage.get(a.id) ?? 0);
      return diff !== 0 ? diff : a.name.localeCompare(b.name);
    });

    const start = page * PAGE_SIZE;
    const pageItems = parents.slice(start, start + PAGE_SIZE);
    const hasMore = start + PAGE_SIZE < parents.length;

    const rows: { text: string; callback_data: string }[][] = [];
    for (let i = 0; i < pageItems.length; i += 2) {
      const p = pageItems[i];
      const row = [
        {
          text: p._count.children > 0 ? `${p.name} →` : p.name,
          callback_data: p._count.children > 0 ? `exp_parent:${p.id}:0` : `exp_cat:${p.id}`,
        },
      ];
      if (pageItems[i + 1]) {
        const p2 = pageItems[i + 1];
        row.push({
          text: p2._count.children > 0 ? `${p2.name} →` : p2.name,
          callback_data: p2._count.children > 0 ? `exp_parent:${p2.id}:0` : `exp_cat:${p2.id}`,
        });
      }
      rows.push(row);
    }

    const navRow: { text: string; callback_data: string }[] = [];
    if (page > 0) navRow.push({ text: '⬅️ Anterior', callback_data: `exp_ppage:${page - 1}` });
    if (hasMore) navRow.push({ text: '➡️ Mas', callback_data: `exp_ppage:${page + 1}` });
    if (navRow.length > 0) rows.push(navRow);

    rows.push([{ text: '❌ Cancelar', callback_data: 'exp_cancel' }]);

    const fmt = (n: number) => (n / 100).toFixed(2);
    await this.editMessage(
      chatId,
      messageId,
      `📂 *Selecciona categoria*\n━━━━━━━━━━━━━━━━━━\n💰 Monto          : ${fmt(pending.amount)} ${pending.currency}\n📋 Descripcion : ${this.escape(pending.description)}`,
      rows,
    );
  }

  // ─── Show child categories of a parent ────────────────────────────

  private async showChildCategories(
    chatId: number,
    messageId: number,
    pending: PendingExpense,
    parentId: string,
    page: number,
  ) {
    const PAGE_SIZE = 12;

    const parent = await this.prisma.category.findUnique({
      where: { id: parentId },
      select: { name: true },
    });

    const children = await this.prisma.category.findMany({
      where: { orgId: pending.orgId, parentId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    // Sort by usage frequency
    const counts = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: { orgId: pending.orgId, type: 'EXPENSE', ...COUNTED, categoryId: { in: children.map(c => c.id) } },
      _count: { id: true },
    });
    const countMap = new Map<string, number>();
    for (const row of counts) {
      if (row.categoryId) countMap.set(row.categoryId, row._count.id);
    }
    children.sort((a, b) => {
      const diff = (countMap.get(b.id) ?? 0) - (countMap.get(a.id) ?? 0);
      return diff !== 0 ? diff : a.name.localeCompare(b.name);
    });

    const start = page * PAGE_SIZE;
    const pageItems = children.slice(start, start + PAGE_SIZE);
    const hasMore = start + PAGE_SIZE < children.length;

    const rows: { text: string; callback_data: string }[][] = [];
    for (let i = 0; i < pageItems.length; i += 2) {
      const row = [{ text: pageItems[i].name, callback_data: `exp_cat:${pageItems[i].id}` }];
      if (pageItems[i + 1]) {
        row.push({ text: pageItems[i + 1].name, callback_data: `exp_cat:${pageItems[i + 1].id}` });
      }
      rows.push(row);
    }

    const navRow: { text: string; callback_data: string }[] = [];
    if (page > 0) navRow.push({ text: '⬅️ Anterior', callback_data: `exp_parent:${parentId}:${page - 1}` });
    if (hasMore) navRow.push({ text: '➡️ Mas', callback_data: `exp_parent:${parentId}:${page + 1}` });
    if (navRow.length > 0) rows.push(navRow);

    rows.push([
      { text: '⬅️ Volver', callback_data: 'exp_back' },
      { text: '❌ Cancelar', callback_data: 'exp_cancel' },
    ]);

    const fmt = (n: number) => (n / 100).toFixed(2);
    await this.editMessage(
      chatId,
      messageId,
      `📂 *${this.escape(parent?.name ?? 'Categoria')}* → subcategoria\n━━━━━━━━━━━━━━━━━━\n💰 Monto          : ${fmt(pending.amount)} ${pending.currency}\n📋 Descripcion : ${this.escape(pending.description)}`,
      rows,
    );
  }

  // ─── Save expense transaction ──────────────────────────────────────

  private async saveExpense(
    pending: PendingExpense,
    categoryId: string,
    chatId: number,
    messageId: number,
  ) {
    // Mismas reglas que la app y la web: si quien escribe no aprueba ni tiene
    // autoconfirmar, el gasto queda pendiente hasta que lo acepte un admin.
    const status = await decideStatusFor(this.prisma, pending.orgId, pending.userId, [
      { currency: pending.currency, amount: pending.amount },
    ]);
    const tx = await this.prisma.transaction.create({
      data: {
        date: new Date(),
        description: pending.description,
        amount: pending.amount,
        type: 'EXPENSE',
        categoryId,
        accountId: pending.accountId,
        orgId: pending.orgId,
        createdBy: pending.userId,
        source: 'telegram',
        ...statusFields(status, pending.userId),
      },
      include: { category: true, account: true },
    });

    // Compute new balance
    const balance = await computeAccountBalance(this.prisma, pending.accountId, pending.orgId);
    const fmt = (n: number) => (n / 100).toFixed(2);
    const catLine = tx.category ? `\n📂 Categoria   : ${tx.category.name}` : '';

    const user = await this.prisma.user.findUnique({
      where: { id: pending.userId },
      select: { name: true },
    });

    if (status !== TransactionStatus.APPROVED) {
      const queue = await this.pendingQueue(pending.orgId);
      await this.editMessage(
        chatId,
        messageId,
        `⏳ *Gasto pendiente de aprobación*\n━━━━━━━━━━━━━━━━━━\n📋 Descripcion : ${this.escape(tx.description)}\n💰 Monto          : ${fmt(tx.amount)} ${tx.account.currency}${catLine}\n🏦 Cuenta        : ${tx.account.name}\n👤 Por              : ${user?.name ?? '?'}\n━━━━━━━━━━━━━━━━━━\nLo revisará un administrador en la app (${queue} en cola).`,
        [],
      );
      return;
    }

    await this.editMessage(
      chatId,
      messageId,
      `💸 *Gasto registrado*\n━━━━━━━━━━━━━━━━━━\n📋 Descripcion : ${this.escape(tx.description)}\n💰 Monto          : ${fmt(tx.amount)} ${tx.account.currency}${catLine}\n🏦 Cuenta        : ${tx.account.name}\n💵 Saldo           : ${fmt(balance)} ${tx.account.currency}\n👤 Por              : ${user?.name ?? '?'}\n━━━━━━━━━━━━━━━━━━`,
      [],
    );
  }

  // ─── Handle linking code ────────────────────────────────────────────

  private async handleLinkCode(
    chatId: number,
    telegramUserId: number,
    code: string,
    from: TelegramFrom,
  ) {
    const token = await this.prisma.telegramLinkToken.findUnique({
      where: { code },
      include: { user: { select: { id: true, name: true } } },
    });

    if (!token || token.expiresAt < new Date()) {
      await this.sendTempMessage(chatId, '❌ Codigo invalido o expirado. Genera uno nuevo desde la app.');
      if (token) {
        await this.prisma.telegramLinkToken.delete({ where: { id: token.id } });
      }
      return;
    }

    // Link Telegram ID to user
    await this.prisma.user.update({
      where: { id: token.user.id },
      data: { telegramId: BigInt(telegramUserId) },
    });

    // Clean up token
    await this.prisma.telegramLinkToken.delete({ where: { id: token.id } });

    // Check role in org
    const org = await this.findOrgByChatId(chatId, true);
    if (org) {
      const membership = await this.prisma.orgMember.findFirst({
        where: { userId: token.user.id, orgId: org.id },
        select: { role: true },
      });
      const roleLabel = this.getRoleLabel(membership?.role);
      await this.sendTempMessage(
        chatId,
        `✅ *Vinculado correctamente*\n━━━━━━━━━━━━━━━━━━\n👤 Usuario       : ${this.escape(token.user.name)}\n🔑 Rol              : ${roleLabel}\n━━━━━━━━━━━━━━━━━━`,
        10000,
      );
    }

    this.logger.log(`Telegram user ${telegramUserId} linked to user ${token.user.id}`);
  }

  // ─── /cuenta command ────────────────────────────────────────────────

  private async handleCuentaCommand(chatId: number, from?: TelegramFrom) {
    const org = await this.findOrgByChatId(chatId);
    if (!org) return;

    if (from) {
      const user = await this.findUserByTelegramId(from.id);
      if (!user) {
        await this.sendTempMessage(chatId, '⚠️ Debes vincular tu cuenta primero.');
        return;
      }
      const membership = await this.prisma.orgMember.findFirst({
        where: { userId: user.id, orgId: org.id },
        select: { role: true },
      });
      if (!membership || !['OWNER', 'ADMIN'].includes(membership.role)) {
        await this.sendTempMessage(chatId, '🚫 Solo OWNER o ADMIN pueden cambiar la cuenta por defecto.');
        return;
      }
    }

    await this.promptDefaultAccount(chatId, org.id);
  }

  // ─── Prompt to select default account ──────────────────────────────

  private async promptDefaultAccount(chatId: number, orgId: string) {
    const accounts = await this.prisma.account.findMany({
      where: { orgId, isActive: true },
      select: { id: true, name: true, currency: true },
    });

    if (accounts.length === 0) {
      await this.sendTempMessage(chatId, '⚠️ No hay cuentas activas. Crea una en la app primero.');
      return;
    }

    const rows = accounts.map((a) => [
      { text: `${a.name} (${a.currency})`, callback_data: `acct:${a.id}` },
    ]);

    await this.sendMessageWithButtons(
      chatId,
      '🏦 *Selecciona la cuenta por defecto para gastos:*',
      rows,
    );
  }

  // ─── Handle account selection callback ─────────────────────────────

  private async handleAccountSelection(cq: TelegramCallbackQuery, data: string) {
    const accountId = data.substring(5);
    const chatId = cq.message!.chat.id;
    const messageId = cq.message!.message_id;

    const org = await this.findOrgByChatId(chatId, true);
    if (!org) {
      await this.answerCallbackQuery(cq.id, 'Error');
      return;
    }

    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { name: true, currency: true },
    });

    await this.prisma.organization.update({
      where: { id: org.id },
      data: { defaultAccountId: accountId },
    });

    await this.editMessage(
      chatId,
      messageId,
      `✅ Cuenta por defecto: *${this.escape(account?.name ?? '?')}* (${account?.currency ?? ''})`,
      [],
    );

    await this.answerCallbackQuery(cq.id, 'Cuenta guardada');
    this.logger.log(`Default account set to ${accountId} for org ${org.id}`);
  }

  // ─── Connect group to org ──────────────────────────────────────────

  private async handleConnect(chatId: number, token: string, chatTitle?: string) {
    const org = await this.prisma.organization.findUnique({
      where: { inviteToken: token },
    });

    if (!org) {
      await this.sendMessage(chatId, '❌ Token de invitacion invalido.');
      return;
    }

    await this.prisma.organization.update({
      where: { id: org.id },
      data: { telegramChatId: BigInt(chatId) },
    });

    await this.sendMessage(
      chatId,
      `✅ *Conectado a ${this.escape(org.name)}*\n\nEste grupo recibira notificaciones y podran registrar gastos.\n\nComandos:\n/balance — Saldos actuales\n/resumen — Ingresos y gastos del mes\n/deudas — Deudas pendientes\n/cuenta — Cambiar cuenta por defecto\n/desconectar — Desconectar grupo\n\nPara registrar un gasto escribe:\nmonto descripcion\nEjemplo: 500 cemento + acarreo`,
    );

    this.logger.log(`Telegram group "${chatTitle}" connected to org "${org.name}"`);
  }

  // ─── /balance ──────────────────────────────────────────────────────

  private async handleBalance(chatId: number) {
    const org = await this.findOrgByChatId(chatId);
    if (!org) return;

    const accounts = await this.prisma.account.findMany({
      where: { orgId: org.id, isActive: true },
      select: { id: true, name: true, currency: true },
    });

    if (accounts.length === 0) {
      await this.sendMessage(chatId, '📊 No hay cuentas activas.');
      return;
    }

    const accountIds = accounts.map((a) => a.id);
    const [map, pendingMap, queue] = await Promise.all([
      computeAccountBalances(this.prisma, org.id, { accountIds }),
      computeAccountBalances(this.prisma, org.id, { accountIds, statuses: [TransactionStatus.PENDING] }),
      this.pendingQueue(org.id),
    ]);

    const lines = accounts.map((a) => {
      const pend = pendingMap.get(a.id) ?? 0;
      const pendLine = pend ? `\n      ⏳ pendiente: ${this.formatAmount(pend, a.currency)}` : '';
      return `🏦 ${this.escape(a.name)}  :  ${this.formatAmount(map.get(a.id) ?? 0, a.currency)}${pendLine}`;
    });
    const queueLine = queue ? `\n⏳ ${queue} por aprobar` : '';

    await this.sendMessage(chatId, `💰 *Saldos*\n━━━━━━━━━━━━━━━━━━\n${lines.join('\n')}\n━━━━━━━━━━━━━━━━━━${queueLine}`);
  }

  // ─── /resumen ──────────────────────────────────────────────────────

  private async handleResumen(chatId: number) {
    const org = await this.findOrgByChatId(chatId);
    if (!org) return;

    // Mes en curso en APP_TZ y mismas reglas que el panel (sin deudas ni ajustes).
    const range = resolveRange();
    const transactions = await this.prisma.transaction.findMany({
      where: flowWhere({ orgId: org.id, date: { gte: range.from, lt: range.to } }),
      include: { account: { select: { currency: true } } },
    });

    const income: Record<string, number> = {};
    const expense: Record<string, number> = {};

    for (const tx of transactions) {
      const c = tx.account.currency;
      if (tx.type === 'INCOME') {
        income[c] = (income[c] ?? 0) + tx.amount;
      } else {
        expense[c] = (expense[c] ?? 0) + tx.amount;
      }
    }

    const monthName = range.from.toLocaleString('es', { month: 'long', timeZone: APP_TZ });
    let text = `📈 *Resumen de ${monthName}*\n━━━━━━━━━━━━━━━━━━\n`;

    const currencies = new Set([...Object.keys(income), ...Object.keys(expense)]);
    if (currencies.size === 0) {
      text += 'Sin movimientos este mes.';
    } else {
      for (const c of currencies) {
        const inc = income[c] ?? 0;
        const exp = expense[c] ?? 0;
        text += `\n💱 *${c}*\n`;
        text += `💵 Ingresos    : ${this.formatAmount(inc, c)}\n`;
        text += `💸 Gastos        : ${this.formatAmount(exp, c)}\n`;
        text += `📊 Balance      : ${this.formatAmount(inc - exp, c)}\n`;
      }
    }
    text += `━━━━━━━━━━━━━━━━━━`;
    const queue = await this.pendingQueue(org.id);
    if (queue) text += `\n⏳ ${queue} por aprobar (no cuentan todavía)`;

    await this.sendMessage(chatId, text);
  }

  // ─── /deudas ───────────────────────────────────────────────────────

  private async handleDeudas(chatId: number) {
    const org = await this.findOrgByChatId(chatId);
    if (!org) return;

    const debts = await this.prisma.debt.findMany({
      where: { orgId: org.id, deletedAt: null, approvalStatus: TransactionStatus.APPROVED, status: { in: ['PENDING', 'PARTIAL'] } },
      orderBy: { createdAt: 'desc' },
    });

    if (debts.length === 0) {
      await this.sendMessage(chatId, '✅ No hay deudas pendientes.');
      return;
    }

    const receivable = debts.filter((d) => d.type === 'RECEIVABLE');
    const payable = debts.filter((d) => d.type === 'PAYABLE');

    let text = `📋 *Deudas pendientes*\n━━━━━━━━━━━━━━━━━━\n`;

    if (receivable.length > 0) {
      text += '\n📥 *Por cobrar:*\n';
      for (const d of receivable) {
        const remaining = d.totalAmount - d.paidAmount;
        text += `👤 ${this.escape(d.personName)}  :  ${this.formatAmount(remaining, d.currency)}\n`;
      }
    }

    if (payable.length > 0) {
      text += '\n📤 *Por pagar:*\n';
      for (const d of payable) {
        const remaining = d.totalAmount - d.paidAmount;
        text += `👤 ${this.escape(d.personName)}  :  ${this.formatAmount(remaining, d.currency)}\n`;
      }
    }
    text += `━━━━━━━━━━━━━━━━━━`;

    await this.sendMessage(chatId, text);
  }

  // ─── /desconectar ──────────────────────────────────────────────────

  private async handleDisconnect(chatId: number) {
    const org = await this.findOrgByChatId(chatId);
    if (!org) return;

    await this.prisma.organization.update({
      where: { id: org.id },
      data: { telegramChatId: null },
    });

    await this.sendMessage(chatId, `🔌 Grupo desconectado de *${this.escape(org.name)}*.`);
    this.logger.log(`Telegram group disconnected from org "${org.name}"`);
  }

  // ─── Public: send notification to an org's Telegram group ─────────

  async notify(orgId: string, message: string) {
    try {
      const org = await this.prisma.organization.findUnique({
        where: { id: orgId },
        select: { telegramChatId: true },
      });

      if (!org?.telegramChatId) return;

      await this.sendMessage(Number(org.telegramChatId), message);
    } catch (err) {
      this.logger.warn(`Failed to send Telegram notification for org ${orgId}: ${err}`);
    }
  }

  /**
   * Cuantas entradas esperan aprobacion. Un traspaso o cambio cuenta una vez
   * (por la pierna que sale), no dos.
   */
  async pendingQueue(orgId: string): Promise<number> {
    return this.prisma.transaction.count({ where: { orgId, ...PENDING_LIVE, ...ENTRY_HEAD } });
  }

  /** Aviso al grupo de que algo espera aprobacion (sin saldo: aun no cuenta). */
  async notifyPending(
    orgId: string,
    authorId: string,
    tx: {
      type: string;
      description: string;
      amount: number;
      account: { name: string; currency: string };
      linkedTransaction?: { amount: number; account: { name: string; currency: string } } | null;
      debtId?: string | null;
    },
  ) {
    try {
      const [author, queue] = await Promise.all([
        this.prisma.user.findUnique({ where: { id: authorId }, select: { name: true } }),
        this.pendingQueue(orgId),
      ]);
      const fmt = (n: number) => (n / 100).toFixed(2);
      const kind = tx.debtId ? 'Deuda' : ({ INCOME: 'Ingreso', EXPENSE: 'Gasto', TRANSFER: 'Transferencia', EXCHANGE: 'Cambio' } as Record<string, string>)[tx.type];
      const to = tx.linkedTransaction ? `\n🏦 Destino       : ${tx.linkedTransaction.account.name} (${fmt(tx.linkedTransaction.amount)} ${tx.linkedTransaction.account.currency})` : '';
      await this.notify(orgId, `⏳ *Por aprobar* — ${author?.name ?? '?'}\n━━━━━━━━━━━━━━━━━━\n🔖 ${kind}: ${this.escape(tx.description)}\n💰 Monto          : ${fmt(tx.amount)} ${tx.account.currency}\n🏦 Cuenta        : ${tx.account.name}${to}\n━━━━━━━━━━━━━━━━━━\n${queue} en cola`);
    } catch (err) {
      this.logger.warn(`Failed to send pending notification for org ${orgId}: ${err}`);
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────

  private async findOrgByChatId(chatId: number, silent = false) {
    const org = await this.prisma.organization.findFirst({
      where: { telegramChatId: BigInt(chatId) },
    });

    if (!org && !silent) {
      await this.sendMessage(chatId, '⚠️ Este grupo no esta conectado a ninguna organizacion.\nUsa /conectar <token> para conectar.');
    }

    return org;
  }

  private async findUserByTelegramId(telegramId: number) {
    return this.prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) },
      select: { id: true, name: true },
    });
  }

  private getRoleLabel(role?: string): string {
    switch (role) {
      case 'OWNER': return 'Propietario';
      case 'ADMIN': return 'Administrador';
      case 'ACCOUNTANT': return 'Contador';
      case 'VIEWER': return 'Visor';
      default: return 'Sin rol';
    }
  }

  async sendMessage(chatId: number, text: string) {
    if (!this.botToken) {
      this.logger.warn('TELEGRAM_BOT_TOKEN not configured, skipping message');
      return null;
    }

    const res = await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      this.logger.warn(`Telegram sendMessage failed: ${res.status} ${body}`);
      return null;
    }

    const data = await res.json() as any;
    return data.result as { message_id: number };
  }

  /** Send a message that auto-deletes after a delay */
  private async sendTempMessage(chatId: number, text: string, delayMs = 15000) {
    const sent = await this.sendMessage(chatId, text);
    if (sent) {
      setTimeout(() => this.deleteMessage(chatId, sent.message_id).catch(() => {}), delayMs);
    }
  }

  private async sendMessageWithButtons(
    chatId: number,
    text: string,
    buttons: { text: string; callback_data: string }[][],
  ) {
    if (!this.botToken) return null;

    const res = await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      this.logger.warn(`Telegram sendMessageWithButtons failed: ${res.status} ${body}`);
      return null;
    }

    const data = await res.json() as any;
    return data.result as { message_id: number };
  }

  private async editMessage(
    chatId: number,
    messageId: number,
    text: string,
    buttons: { text: string; callback_data: string }[][],
  ) {
    if (!this.botToken) return;

    const body: any = {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'Markdown',
    };

    if (buttons.length > 0) {
      body.reply_markup = { inline_keyboard: buttons };
    } else {
      body.reply_markup = { inline_keyboard: [] };
    }

    const res = await fetch(`https://api.telegram.org/bot${this.botToken}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const resBody = await res.text();
      this.logger.warn(`Telegram editMessage failed: ${res.status} ${resBody}`);
    }
  }

  private async deleteMessage(chatId: number, messageId: number) {
    if (!this.botToken) return;

    const res = await fetch(`https://api.telegram.org/bot${this.botToken}/deleteMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
    });

    if (!res.ok) {
      const body = await res.text();
      this.logger.warn(`Telegram deleteMessage failed: ${res.status} ${body}`);
    }
  }

  private async answerCallbackQuery(callbackQueryId: string, text?: string) {
    if (!this.botToken) return;

    await fetch(`https://api.telegram.org/bot${this.botToken}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text,
      }),
    });
  }

  private formatAmount(amount: number, currency: string): string {
    return `${(amount / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
  }

  /** Escape Markdown special characters */
  private escape(text: string): string {
    return text.replace(/[_*[`]/g, '\\$&');
  }
}
