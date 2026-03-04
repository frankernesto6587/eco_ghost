# Gastos por Telegram

## Resumen
Permitir a los usuarios registrar gastos directamente desde el grupo de Telegram vinculado a la organización. El grupo es exclusivamente para finanzas — todos los mensajes de usuarios se borran, solo quedan los del bot.

## Modelo de datos

### Campos nuevos
- `User.telegramId` — BigInt opcional. Se guarda al vincular cuenta.
- `Transaction.source` — String opcional (`'web'` | `'telegram'`). Nullable para datos existentes.
- `Organization.defaultAccountId` — String opcional, FK a Account. Cuenta default para gastos por Telegram.

## Flujos

### 1. Manejo de mensajes (orden de evaluación)
1. **Cualquier mensaje** → bot lo borra siempre (bot debe ser admin del grupo)
2. ¿Es un comando (`/balance`, `/resumen`, etc.)? → ejecutar comando normalmente
3. ¿Autor vinculado? No → bot pide vinculación o valida si es un código de vinculación
4. ¿Tiene rol de escritura (OWNER/ADMIN/ACCOUNTANT)? No → bot responde que no tiene permisos
5. ¿Empieza con número entero? No → solo se borra, nada más
6. ¿Empieza con número entero? Sí → flujo de gasto

### 2. Vinculación de usuario (una sola vez)
1. Usuario escribe cualquier mensaje en el grupo
2. Bot borra mensaje, detecta que `telegramId` no está vinculado a ningún User
3. Bot responde: "No estás vinculado. Ve a la app → Perfil → Vincular Telegram, copia el código y pégalo aquí"
4. En la app web: botón "Vincular Telegram" en perfil genera código temporal (expira en 10 minutos)
5. Usuario pega el código en el grupo
6. Bot valida código, guarda `telegramId` en el User, confirma: "Vinculado como Frank (Contador)"
7. Bot borra todos los mensajes intermedios (código, instrucciones)
8. Si el usuario tiene rol VIEWER → "No tienes permisos para registrar gastos"

### 3. Configuración cuenta default (una sola vez por org)
1. Primer gasto de la org (org no tiene `defaultAccountId`)
2. Bot muestra botones inline con las cuentas disponibles
3. Usuario selecciona → se guarda en `Organization.defaultAccountId`
4. Comando `/cuenta` permite cambiarla después

### 4. Flujo de gasto
1. Usuario escribe: `500 cemento + acarreo`
2. Bot borra mensaje del usuario
3. Bot muestra confirmación con botones inline:
   ```
   💸 Registrar gasto?
   Monto: 500.00 MN
   Descripción: cemento + acarreo
   Cuenta: Efectivo MN

   [✅ Confirmar]  [❌ Cancelar]
   ```
4. **Confirmar** → bot muestra botones de categoría:
   - Ordenados por frecuencia de uso (más usadas primero)
   - Paginados con botón "→ Más" si hay muchas
   - Botón "❌ Cancelar" siempre presente
5. Selecciona categoría → se guarda como EXPENSE con `source: 'telegram'`, `createdBy: userId`
6. Bot muestra reporte final del gasto (formato actual de notificación)
7. **Cancelar** en cualquier paso → borra todos los mensajes del bot, no se guarda nada

## Formato de mensaje
- `{monto entero} {descripción}`
- El monto siempre va primero
- Solo valores enteros (se multiplican x100 internamente para centavos)
- Si no empieza con número → no es un gasto, se ignora silenciosamente

## Reglas
- Bot debe ser **administrador** del grupo con permiso "Eliminar mensajes"
- Todo mensaje de usuario se borra siempre
- Solo queda en el grupo: mensajes del bot (reportes, errores, confirmaciones)
- Sin timeout — confirmaciones/categorías quedan pendientes indefinidamente hasta interacción
- Obligatorio seleccionar categoría (no hay "sin categoría")
- Solo EXPENSE — no se pueden registrar ingresos, transferencias ni cambios por Telegram
- Roles: solo OWNER, ADMIN, ACCOUNTANT pueden registrar gastos

## Archivos a modificar

### Backend
1. `apps/api/src/prisma/schema.prisma` — campos nuevos (telegramId, source, defaultAccountId)
2. `apps/api/src/modules/telegram/telegram.service.ts` — lógica principal de gastos
3. `apps/api/src/modules/users/` — endpoint para generar token de vinculación
4. `apps/api/src/modules/transactions/transactions.service.ts` — aceptar campo source

### Frontend
5. `apps/web/src/pages/Profile.tsx` (o similar) — botón "Vincular Telegram" + generar código
6. Mostrar campo `source` en detalles de transacción (opcional)
