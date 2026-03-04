# Integracion Telegram Bot

## Resumen

Bot de Telegram conectado a una organizacion via webhook. Notifica todas las operaciones (transacciones, deudas, cuentas, miembros) y responde comandos (/balance, /resumen, /deudas).

## Asociacion

1. OWNER va a Organizacion > Configuracion > seccion Telegram
2. Click "Conectar grupo de Telegram" → abre `https://t.me/{BOT_USERNAME}?startgroup={inviteToken}`
3. Telegram pide elegir grupo → agrega bot → bot recibe el token como parametro
4. Bot valida token → guarda chatId en la org → envia mensaje de bienvenida
5. 1 org = 1 grupo de Telegram

## Modelo

- Agregar `telegramChatId BigInt?` a modelo `Organization`

## Backend — Modulo Telegram

### Archivos
- `telegram.module.ts` — Registra servicio y controller
- `telegram.controller.ts` — `POST /telegram/webhook` (@Public), valida secret header
- `telegram.service.ts` — handleUpdate(), notify(), sendMessage()

### Comandos
- Deep link con token → asocia grupo a org
- `/balance` → saldos actuales por cuenta
- `/resumen` → ingresos/gastos del mes
- `/deudas` → deudas pendientes
- `/desconectar` → desasocia grupo

### Notificaciones automaticas
Se llama `telegramService.notify(orgId, message)` desde:
- TransactionsService: create, update, delete
- DebtsService: create, update, delete, addPayment
- AccountsService: create, update, delete
- OrganizationsService: join, removeMember, updateRole

### Seguridad webhook
- Telegram envia `X-Telegram-Bot-Api-Secret-Token`
- Se valida contra `TELEGRAM_WEBHOOK_SECRET` del .env

## Frontend

En Organization.tsx tab Configuracion (solo OWNER):
- Sin conexion: boton "Conectar grupo de Telegram" con deep link
- Conectado: badge verde "Conectado" + boton "Desconectar"

## Variables de entorno
- `TELEGRAM_BOT_TOKEN` — Token del bot (BotFather)
- `TELEGRAM_BOT_USERNAME` — Username del bot (sin @)
- `TELEGRAM_WEBHOOK_SECRET` — Secret para validar webhook
