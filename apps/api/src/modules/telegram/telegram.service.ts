import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

interface TelegramUpdate {
  message?: {
    chat: { id: number; title?: string; type: string };
    text?: string;
    from?: { first_name?: string };
    group_chat_created?: boolean;
    new_chat_members?: { id: number; is_bot?: boolean }[];
  };
  my_chat_member?: {
    chat: { id: number; title?: string; type: string };
    new_chat_member: { status: string; user: { id: number } };
  };
}

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly botToken: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.botToken = this.config.get<string>('TELEGRAM_BOT_TOKEN', '');
  }

  // ─── Handle incoming Telegram update ────────────────────────────────

  async handleUpdate(update: TelegramUpdate) {
    // Handle bot being added to a group (deep link startgroup)
    if (update.message?.group_chat_created || update.message?.new_chat_members) {
      // When added via deep link, Telegram doesn't send the token in group context.
      // The token comes as /start parameter only in private chat.
      // For groups we handle via /conectar command instead.
    }

    const msg = update.message;
    if (!msg?.text) return;

    const chatId = msg.chat.id;
    const text = msg.text.trim();

    // Handle /start in private chat (deep link: /start <token>)
    if (text.startsWith('/start ') && msg.chat.type === 'private') {
      // Private chat deep links aren't used for groups, ignore
      return;
    }

    // Handle /start with payload in group (startgroup deep link)
    if (text.startsWith('/start')) {
      const parts = text.split(' ');
      if (parts.length > 1) {
        await this.handleConnect(chatId, parts[1], msg.chat.title);
        return;
      }
    }

    // Strip @botUsername from commands (e.g., /balance@EcoGhostBot)
    const command = text.split('@')[0].toLowerCase();

    switch (command) {
      case '/conectar':
        const token = text.split(' ')[1];
        if (!token) {
          await this.sendMessage(chatId, 'Uso: /conectar <token de invitacion>');
          return;
        }
        await this.handleConnect(chatId, token, msg.chat.title);
        break;
      case '/balance':
        await this.handleBalance(chatId);
        break;
      case '/resumen':
        await this.handleResumen(chatId);
        break;
      case '/deudas':
        await this.handleDeudas(chatId);
        break;
      case '/desconectar':
        await this.handleDisconnect(chatId);
        break;
    }
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
      `✅ *Conectado a ${this.escape(org.name)}*\n\nEste grupo recibira notificaciones de todas las operaciones.\n\nComandos disponibles:\n/balance — Saldos actuales\n/resumen — Ingresos y gastos del mes\n/deudas — Deudas pendientes\n/desconectar — Desconectar grupo`,
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

    const balanceRows = await this.prisma.transaction.groupBy({
      by: ['accountId', 'type'],
      where: { orgId: org.id, accountId: { in: accounts.map((a) => a.id) } },
      _sum: { amount: true },
    });

    const balanceMap = new Map<string, number>();
    for (const row of balanceRows) {
      const current = balanceMap.get(row.accountId) ?? 0;
      const amount = row._sum.amount ?? 0;
      const sign = row.type === 'INCOME' ? 1 : -1;
      balanceMap.set(row.accountId, current + sign * amount);
    }

    const lines = accounts.map((a) => {
      const balance = balanceMap.get(a.id) ?? 0;
      return `• *${this.escape(a.name)}*: ${this.formatAmount(balance, a.currency)}`;
    });

    await this.sendMessage(chatId, `💰 *Saldos — ${this.escape(org.name)}*\n\n${lines.join('\n')}`);
  }

  // ─── /resumen ──────────────────────────────────────────────────────

  private async handleResumen(chatId: number) {
    const org = await this.findOrgByChatId(chatId);
    if (!org) return;

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const transactions = await this.prisma.transaction.findMany({
      where: {
        orgId: org.id,
        type: { in: ['INCOME', 'EXPENSE'] },
        date: { gte: startOfMonth, lte: endOfMonth },
      },
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

    const monthName = now.toLocaleString('es', { month: 'long' });
    let text = `📈 *Resumen de ${monthName} — ${this.escape(org.name)}*\n\n`;

    const currencies = new Set([...Object.keys(income), ...Object.keys(expense)]);
    if (currencies.size === 0) {
      text += 'Sin movimientos este mes.';
    } else {
      for (const c of currencies) {
        const inc = income[c] ?? 0;
        const exp = expense[c] ?? 0;
        text += `*${c}*\n`;
        text += `  Ingresos: ${this.formatAmount(inc, c)}\n`;
        text += `  Gastos: ${this.formatAmount(exp, c)}\n`;
        text += `  Balance: ${this.formatAmount(inc - exp, c)}\n\n`;
      }
    }

    await this.sendMessage(chatId, text.trim());
  }

  // ─── /deudas ───────────────────────────────────────────────────────

  private async handleDeudas(chatId: number) {
    const org = await this.findOrgByChatId(chatId);
    if (!org) return;

    const debts = await this.prisma.debt.findMany({
      where: { orgId: org.id, status: { in: ['PENDING', 'PARTIAL'] } },
      orderBy: { createdAt: 'desc' },
    });

    if (debts.length === 0) {
      await this.sendMessage(chatId, '✅ No hay deudas pendientes.');
      return;
    }

    const receivable = debts.filter((d) => d.type === 'RECEIVABLE');
    const payable = debts.filter((d) => d.type === 'PAYABLE');

    let text = `📋 *Deudas pendientes — ${this.escape(org.name)}*\n\n`;

    if (receivable.length > 0) {
      text += '*Por cobrar:*\n';
      for (const d of receivable) {
        const remaining = d.totalAmount - d.paidAmount;
        text += `• ${this.escape(d.personName)}: $${(remaining / 100).toFixed(2)}\n`;
      }
      text += '\n';
    }

    if (payable.length > 0) {
      text += '*Por pagar:*\n';
      for (const d of payable) {
        const remaining = d.totalAmount - d.paidAmount;
        text += `• ${this.escape(d.personName)}: $${(remaining / 100).toFixed(2)}\n`;
      }
    }

    await this.sendMessage(chatId, text.trim());
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

  // ─── Webhook management ──────────────────────────────────────────

  async getWebhookInfo() {
    if (!this.botToken) return { url: '' };
    const res = await fetch(`https://api.telegram.org/bot${this.botToken}/getWebhookInfo`);
    const data = await res.json();
    return { url: (data as any).result?.url ?? '' };
  }

  async setWebhook(baseUrl: string) {
    if (!this.botToken) {
      return { ok: false, error: 'TELEGRAM_BOT_TOKEN not configured' };
    }

    // Strip any trailing path — only keep protocol + host
    const parsed = new URL(baseUrl);
    const webhookUrl = `${parsed.origin}/api/v1/telegram/webhook`;
    const secret = this.config.get<string>('TELEGRAM_WEBHOOK_SECRET', '');

    const res = await fetch(`https://api.telegram.org/bot${this.botToken}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: secret || undefined,
      }),
    });

    const data = await res.json();
    this.logger.log(`Webhook set to ${webhookUrl}: ${JSON.stringify(data)}`);
    return { ok: (data as any).ok, url: webhookUrl };
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

  // ─── Helpers ───────────────────────────────────────────────────────

  private async findOrgByChatId(chatId: number) {
    const org = await this.prisma.organization.findFirst({
      where: { telegramChatId: BigInt(chatId) },
    });

    if (!org) {
      await this.sendMessage(chatId, '⚠️ Este grupo no esta conectado a ninguna organizacion.\nUsa /conectar <token> para conectar.');
      return null;
    }

    return org;
  }

  async sendMessage(chatId: number, text: string) {
    if (!this.botToken) {
      this.logger.warn('TELEGRAM_BOT_TOKEN not configured, skipping message');
      return;
    }

    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;

    const res = await fetch(url, {
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
    }
  }

  private formatAmount(amount: number, currency: string): string {
    return `${(amount / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
  }

  /** Escape Markdown special characters */
  private escape(text: string): string {
    return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
  }
}
