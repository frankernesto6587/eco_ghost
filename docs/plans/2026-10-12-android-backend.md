# App Android de EcoGhost — Backend (S3)

> Estado: **PROPUESTA**, pendiente de aprobación de Frank.
> Depende de S1 (`2026-10-12-android-arquitectura.md`) y S2 (`2026-10-12-android-diseno.md`).

## Decisiones ya tomadas (2026-10-12)
- **Editar/eliminar/restaurar movimientos:** Propietario **y Administrador** (hoy solo Propietario).
- **Orden:** seguridad → `prisma migrate` → entorno de pruebas → login de Google móvil.
- **Despliegue:** cada fase en su rama con PR; Frank aprueba el merge a `main`. Ojo: Dokploy hace **autodeploy de `main`** en `ecoghost-api` y `ecoghost-front`, así que el merge = despliegue a producción.
- **Tests:** se monta jest en `apps/api` y se cubre lo que toque S3.

## Estado actual (lo medido)
- Producción: `apieco.merxbit.com` (API) y `eco.merxbit.com` (web), Postgres 18 `ecoghost-db` (~10 MB, 603 movimientos, 4 usuarios). Último despliegue: 2026-09-02.
- Variables en producción: `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_BOT_TOKEN`, `GOOGLE_CLIENT_ID`, `FRONTEND_URL` presentes.
- Sin tests, sin CI, sin carpeta `migrations` (todo con `db push --accept-data-loss`).

## Fase 1 — Seguridad y permisos (rama `s3/seguridad`)
1. **IDOR en organizaciones** (`organizations.controller.ts`): los endpoints con `:id` (`GET`, `PATCH`, `DELETE`, `regenerate-token`, `disconnect-telegram`, `members`, `members/:memberId`) usan el rol de la cabecera `X-Organization-Id` pero actúan sobre el `:id` de la URL. Arreglo: si `:id !== request.orgId` → 403. `GET :id/members` pasa a exigir pertenencia. El `RolesGuard` falla cerrado si un endpoint con `@Roles` llega sin cabecera.
2. **`GET /organizations`:** devuelve `inviteToken` y `telegramChatId` (BigInt) a cualquier rol. Arreglo: `inviteToken` solo para Propietario; `telegramChatId` se sustituye por `telegramConnected: boolean` (como ya hace `findOne`).
3. **Telegram `webhook-info` / `set-webhook`:** cualquier usuario autenticado puede redirigir el bot. Propuesta: ver *Decisiones pendientes*.
4. **Permisos de movimientos:** `PATCH /transactions/:id`, `DELETE /transactions/:id`, `PATCH /:id/restore` y `POST /bulk/delete` → `OWNER, ADMIN`. Se añade `TX_EDIT_ROLES` en `packages/shared`.
5. **Web alineada con la API:** `usePermissions` gana `canEditTx` (Propietario/Admin) y `canDeleteBudget` (Propietario/Admin); `TransactionDrawer`, `Transactions` y `BudgetProgressList` los usan.
6. **Editar deuda en la web:** `Debts.tsx` manda solo `personName`, `description`, `dueDate` (hoy da 400) y la descripción pasa a obligatoria en el formulario, como en la API.
7. **Tests:** jest + ts-jest en `apps/api`; tests unitarios del guard y de las comprobaciones de organización (con Prisma simulado) y de los `@Roles` de movimientos.

Verificación: `pnpm --filter api test`; arranque local contra una copia de la base; con curl, un Propietario de la org A no puede tocar la org B (403), un Admin puede editar un movimiento, un Contador no; la web de un Contador ya no enseña Editar/Eliminar.

## Fase 2 — `prisma migrate` (rama `s3/migrate`)
1. **Copia de seguridad** antes de nada: `pg_dump` de `ecoghost-db` a `/home/frank/backups/ecoghost/` (con fecha), y comprobar que se restaura en una base temporal.
2. **Comprobar que producción coincide con el schema:** `prisma migrate diff --from-url <prod> --to-schema-datamodel schema.prisma` debe salir vacío. Si no, se reconcilia primero.
3. **Migración base:** `prisma migrate diff --from-empty --to-schema-datamodel ... --script` → `migrations/0_init/migration.sql`.
4. **Marcar la base como aplicada en producción**, una sola vez y antes del despliegue: `prisma migrate resolve --applied 0_init`.
5. **`entrypoint.sh`:** `prisma migrate deploy` en lugar de `db push --accept-data-loss`. El Dockerfile copia la carpeta `migrations`.
6. A partir de aquí, cada cambio de schema = `prisma migrate dev --name ...` en local y la migración va en el PR.

Verificación: restaurar la copia en una base local, aplicar `migrate resolve` + `migrate deploy` y arrancar la API; tras el merge, revisar logs de Dokploy (`No pending migrations`) y que la web sigue funcionando.

## Fase 3 — Entorno de pruebas (rama `prueba`)
- En Dokploy: Postgres `ecoghost-prueba-db`, app `ecoghost-prueba-api` (Dockerfile `apps/api/Dockerfile`) y, opcional, `ecoghost-prueba-front`, siguiendo la rama `prueba` con autodeploy.
- Dominios `apieco-prueba.merxbit.com` (y `eco-prueba.merxbit.com`): registro DNS con la API de Hostinger y dominio en Dokploy (certificado automático).
- Variables propias: secretos JWT distintos, `FRONTEND_URL` de prueba, **sin `TELEGRAM_BOT_TOKEN`** (el bot no se arranca) para no mandar avisos al grupo real.
- **Datos de prueba sintéticos:** script `prisma/seed-prueba.ts` con una organización, cuentas en MN/USD/MLC, categorías, ~3 meses de movimientos, deudas y presupuestos parecidos a los del prototipo. No se copian datos reales.
- Flujo de trabajo: rama de trabajo → merge a `prueba` (se despliega en pruebas) → PR a `main` (producción).
- CORS: la API de prueba admite su propio `FRONTEND_URL`. La app Android no necesita CORS.

Verificación: `curl https://apieco-prueba.merxbit.com/api/v1/...` con un usuario sembrado; login en `eco-prueba.merxbit.com`.

**Hecho (2026-10-16).** En Dokploy, proyecto EcoGhost, entorno `prueba`: Postgres `db-prueba` (`ecoghost-prueba-db-ouctla`), apps `API prueba` y `front prueba`, las dos en la rama `prueba` con autodeploy. DNS `apieco-prueba` y `eco-prueba` → 157.173.210.111, certificados de Let's Encrypt.
- Usuarios sembrados (misma contraseña, en el VPS en `~/.config/ecoghost-prueba/seed-password`): `frankernesto6587@gmail.com` (OWNER de *Casa (prueba)* y *Negocio (prueba)*), `admin@prueba.ecoghost` (ADMIN), `contable@prueba.ecoghost` (ACCOUNTANT), `lector@prueba.ecoghost` (VIEWER).
- *Casa (prueba)*: 5 cuentas (MN, USD, MLC), 6 meses de movimientos, transferencias y cambios enlazados, 3 deudas (pendiente, parcial, pagada), presupuestos con ventana de meses, etiquetas y un movimiento en la papelera. *Negocio (prueba)*: una caja USD con ventas, para probar el cambio de organización.
- Volver a sembrar (borra y recrea solo las organizaciones "(prueba)"; se niega si `DATABASE_URL` no es de pruebas):
  ```sh
  docker run --rm --network dokploy-network -v $PWD:$PWD -w $PWD/apps/api \
    -e DATABASE_URL="postgresql://ecoghost:$(cat ~/.config/ecoghost-prueba/db-password)@ecoghost-prueba-db-ouctla:5432/ecoghost" \
    -e SEED_PASSWORD="$(cat ~/.config/ecoghost-prueba/seed-password)" \
    node:22-bookworm node_modules/.bin/ts-node --compiler-options '{"module":"CommonJS"}' src/prisma/seed-prueba.ts
  ```
  (Debian y no Alpine: el motor de Prisma de `node_modules` es de glibc.)
- Login con Google en la web de pruebas: falta añadir `https://apieco-prueba.merxbit.com/api/v1/auth/google/callback` como URI de redirección del cliente web en la consola de Google. Con usuario y contraseña ya funciona.

## Fase 4 — Login de Google para móvil (rama `s3/google-mobile`)
- `POST /auth/google/mobile` `{ idToken }`, público. Verifica con `google-auth-library` (`verifyIdToken`), exige `email_verified`, y reutiliza `authService.validateOAuthUser` + `authService.login` (misma respuesta que `/auth/login`).
- `audience` = el **cliente web** actual (`GOOGLE_CLIENT_ID`): con Credential Manager la app pide el token con ese `serverClientId`, así que no hace falta otra variable. Opcional: `GOOGLE_MOBILE_AUDIENCES` si más adelante se añade iOS.
- **Consola de Google (lo hace Frank, no hay API):** crear dos clientes OAuth de tipo Android, `com.merxbit.ecoghost` y `com.merxbit.ecoghost.prueba`, con el SHA-1 del keystore de firma. El keystore se crea al montar el proyecto Android (S4), así que este paso se hace entonces; el endpoint se puede probar ya con un idToken obtenido desde el navegador.
- Tests: token válido, audiencia equivocada, email sin verificar, usuario nuevo (crea org) y usuario existente (enlaza por email).

## Decisiones pendientes
- [x] **Telegram `set-webhook`/`webhook-info`:** (a) eliminarlos de la API y configurar el webhook con un script, (b) restringirlos a una lista de correos administradores del sistema (`SYSTEM_ADMIN_EMAILS`). Recomendación: (a).
- [x] **Entorno de pruebas sigue la rama `prueba`** (recomendado) o se despliega a mano.
- [x] **Web de pruebas** (`eco-prueba.merxbit.com`): sí o solo la API.
- [x] Aprobar este plan.

## Estado y pendientes (2026-10-20)
- Hecho: fases 1–4 en producción (PR #2, #3, #4); paleta Dracula/Alucard en la web (PR #5).
- App Android: v0.2.0 de pruebas (login, organización, Inicio, Movimientos, botón + "Anotar"). Código en las ramas `s4/andamiaje` y `s5/alta-rapida`, **sin mergear a `main`**.
- Siguiente: rediseño de lógica en `2026-10-20-aprobaciones-y-usd.md` (Fase 0 integridad → Fase 1 aprobaciones → Fase 2 valoración FIFO en USD).
- Pendiente de la app: detalle/edición/borrado de movimientos, filtros y búsqueda, etiquetas en "Anotar", caché offline (Room); Deudas y presupuestos (S6); Análisis (S7); push, widget, biometría, CI (S8/S9).
- Pendiente de Frank: clientes OAuth Android en la consola de Google (`com.merxbit.ecoghost` y `.prueba`, SHA-1 `B4:EA:3C:EA:63:B6:B8:C8:28:CA:B5:B6:A2:8D:22:71:69:95:3A:64`); el endpoint de tasas de elTOQUE para la Fase 2.
- Limpieza: el registro DNS `eco-prueba` ya no se usa.
