#!/usr/bin/env node
// Consulta o configura el webhook del bot de Telegram. Sustituye a los antiguos
// endpoints /telegram/webhook-info y /telegram/set-webhook, que cualquier usuario
// autenticado podia usar para redirigir el bot.
//
//   TELEGRAM_BOT_TOKEN=... node scripts/telegram-webhook.mjs info
//   TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... \
//     node scripts/telegram-webhook.mjs set https://apieco.merxbit.com
//
// En produccion, dentro del contenedor de la API (las variables ya estan):
//   docker exec <contenedor-api> node scripts/telegram-webhook.mjs info

const [cmd, baseUrl] = process.argv.slice(2);
const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!token) {
  console.error('Falta TELEGRAM_BOT_TOKEN');
  process.exit(1);
}
const api = (method, body) =>
  fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }).then((r) => r.json());

if (cmd === 'info') {
  const { result } = await api('getWebhookInfo');
  console.log(JSON.stringify({ url: result?.url ?? '', pending: result?.pending_update_count, lastError: result?.last_error_message }, null, 2));
} else if (cmd === 'set' && baseUrl) {
  if (!secret) {
    console.error('Falta TELEGRAM_WEBHOOK_SECRET: la API rechaza el webhook sin secreto');
    process.exit(1);
  }
  const url = `${new URL(baseUrl).origin}/api/v1/telegram/webhook`;
  const res = await api('setWebhook', { url, secret_token: secret });
  console.log(JSON.stringify({ ok: res.ok, url, description: res.description }, null, 2));
  process.exit(res.ok ? 0 : 1);
} else {
  console.error('Uso: node scripts/telegram-webhook.mjs info | set <https://api-base-url>');
  process.exit(1);
}
