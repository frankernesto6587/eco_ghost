# EcoGhost — Aprobaciones y estadísticas en USD (FIFO)

> Estado: **ACEPTADO** (2026-10-20). Decisiones tomadas con Frank en una ronda de 23 preguntas.
> Avance: Fases 0, 1 y 2 en producción (PR #6, #7, #8). Fase 2c (diferencias de cambio) hecha y en el entorno de pruebas (rama `s7/diferencias-cambio`; app 0.5.0 en `s6/android-aprobaciones`).
> Valores tomados por defecto en la Fase 2: las piernas huérfanas de cambios viejos se valoran como entradas a la tasa del día; la cuenta USDT de Home sigue en moneda USD (1:1) hasta que haya una herramienta para cambiarla.

## Contexto
Frank quiere cambiar dos lógicas de fondo antes de seguir con más pantallas:
1. **Aprobaciones (maker-checker):** lo que anote alguien que no es propietario ni admin queda pendiente hasta que un admin lo acepte, y el admin puede corregirlo antes de aceptar. Algunos usuarios se pueden autoconfirmar.
2. **Estadísticas en USD:** los ingresos entran sobre todo en USD y los gastos salen en MN. Los gastos en MN se valoran a la tasa real de los cambios mediante FIFO, como hacen las empresas (es la regla por defecto en contabilidad fiscal de divisas, y cuadra exacto con los USD cambiados).

Al explorar el código salieron problemas que hay que arreglar antes (Fase 0):
- La app Android guarda las fechas un día antes.
- Al editar un cambio o transferencia, sus dos patas se desincronizan.
- Las deudas no tienen moneda propia.
- Los cálculos de saldo están duplicados.

## Decisiones de Frank (2026-10-20)

**Aprobaciones**
- **Quién aprueba:** el propietario y los admins. Lo que anotan ellos entra directo.
- **Pendiente:** no cuenta en saldos, estadísticas ni presupuestos hasta que se aprueba. Se ve aparte: "3 por aprobar" y, en cada cuenta, "pendiente: −6 400 MN".
- **Correcciones:** el admin puede cambiarlo todo antes de aprobar. Se guarda lo original y se avisa al autor.
- **Autoconfirmar:**
  - Interruptor por usuario, con tope opcional por moneda.
  - En una moneda sin tope, el movimiento espera aprobación.
  - Con el interruptor activo y sin ningún tope, todo entra solo.
- **Rechazo:** con motivo obligatorio. El autor lo corrige y lo reenvía. Nunca cuenta.
- **Autor:** puede editar o retirar lo suyo mientras está pendiente o rechazado. Lo aprobado solo lo cambia un admin, y queda en el historial.
- **Telegram:** mismas reglas. El bot responde "pendiente de aprobación"; se aprueba solo en la app o la web.
- **Deudas:** crear una deuda y registrar pagos también se aprueba.
- **Visualizador:** ve solo lo aprobado.
- **Propietario y admins:** pueden cambiar lo aprobado por cualquiera, con historial de antes y después.
- **Bot de prueba:** no hay. El bot se prueba con tests automáticos.

**USD**
- **Moneda de estadísticas:** configurable por organización (`reportCurrency`, USD por defecto). No se reutiliza `baseCurrency`, que es la moneda que muestran los clientes.
- **Bolsas:** FIFO, una bolsa por moneda y organización. Las transferencias entre cuentas de la misma moneda no afectan.
- **Lotes:**
  - Cambio USD→MN: tasa real.
  - Otra entrada de MN (saldo inicial, ventas, préstamos): tasa de referencia del día. **Si falta la tasa, se exige al admin que la ponga.** No hay valor de reserva silencioso.
- **Fuente de tasas:** un endpoint que Frank va a pasar (extrae la tasa de elTOQUE). URL configurable; el admin puede corregir un día a mano.
- **Bolsa en negativo:** el gasto se muestra como estimado (≈) y lo valora el siguiente lote que entre (idea de Frank).
- **Cambios retroactivos:** se recalcula siempre. El admin puede cerrar un mes, y ese mes queda congelado.
- **Otras monedas:** MLC, EUR y USDT tienen su propia bolsa con su tasa. USDT no vale lo mismo que USD.
- **Patrimonio:**
  - A costo: el MN que queda se valora contra los últimos cambios (es lo que queda en el FIFO).
  - También a tasa de hoy, con la devaluación como diferencia.
- **Vender MN por USD:** la diferencia es "resultado cambiario", en una línea aparte.
- **Presupuestos:** se pueden definir en la moneda de estadísticas.
- **Deudas:** cada una en su moneda, con los pagos en esa misma moneda.
- **Orden:** Fase 0 (arreglos), Fase 1 (aprobaciones), Fase 2 (USD). Cada fase se prueba en apieco-prueba antes de producción.

## Pendientes que quedan anotados
Al salir del modo plan se escriben en `docs/plans/2026-10-20-aprobaciones-y-usd.md` (este plan), en `docs/plans/2026-10-12-android-backend.md` y en la memoria.
- **App S5:** detalle, edición y borrado de movimientos; filtros y búsqueda; etiquetas en "Anotar"; caché offline (Room).
- **S6 Deudas y presupuestos. S7 Análisis. S8/S9:** push, widget, biometría, CI.
- **Google en la app:** Frank tiene que crear los clientes OAuth Android (`com.merxbit.ecoghost` y `.prueba`, SHA-1 `B4:EA:3C:EA:63:B6:B8:C8:28:CA:B5:B6:A2:8D:22:71:69:95:3A:64`). Después, Credential Manager en la app.
- **Código Android sin mergear a `main`:** está en las ramas `s4/andamiaje` y `s5/alta-rapida`, sin PR.
- **Limpieza:** el registro DNS `eco-prueba` ya no se usa.
- **Endpoint de tasas:** lo tiene que pasar Frank, y hace falta para la Fase 2.

## Fase 0 — Integridad (rama `s6/integridad`, migración `1_integridad`)
- **A0. Script de auditoría** (solo lectura): `apps/api/scripts/audit-integridad.ts`. Frank lo corre en producción antes de desplegar. Busca:
  - pares con la moneda equivocada y patas huérfanas;
  - deudas con varias monedas, o con `paidAmount` distinto de la suma de sus pagos;
  - referencias a otra organización;
  - fechas a medianoche UTC.
- **A1. Pares sincronizados al editar.** Nuevo `applyEntryEdits(tx, entry, edits)` en `transactions.service.ts`:
  - Las dos patas se cambian juntas. `accountId`/`amount` corresponden a la pata que sale y `toAccountId`/`toAmount` a la que entra.
  - Solo se permite cambiar el tipo entre INCOME y EXPENSE.
  - `TRANSACTION_INCLUDE` incluye `linkedTransaction` y `linkedBy`.
  - En la web, el formulario de edición (`Transactions.tsx` openEditModal) rellena las dos patas.
  - Al cambiar la cuenta en lote, se rechazan las patas de pares.
- **A2.** La moneda de una cuenta no se puede cambiar si ya tiene movimientos (devuelve 409).
- **A3.** Un EXCHANGE exige monedas distintas y un TRANSFER, la misma.
- **A4. Deudas:**
  - Columnas nuevas: `Debt.currency` (rellenada desde el movimiento más antiguo), `deletedAt` y `createdBy`.
  - Los pagos deben ser en la moneda de la deuda.
  - `recomputeDebt()` recalcula lo pagado sumando solo los pagos aprobados.
  - Borrar una deuda pasa a ser borrado suave, y solo lo pueden hacer OWNER y ADMIN.
  - Fecha opcional al crearla.
- **A5.** `common/org-refs.util.ts` `assertOrgRefs()`: cuentas, categoría, deuda y etiquetas deben ser de la organización, y las cuentas deben estar activas.
- **A6. Filtros y saldo en un solo sitio:**
  - `account-balance.util.ts` pasa a tener `computeAccountBalances()` y sustituye a las copias de `accounts.service.ts`, `dashboard.service.ts` y `telegram.service.ts`.
  - `/transactions/summary` y el `/resumen` del bot usan las mismas reglas que el panel.
- **A7. Fechas (arregla la app):** `common/entry-date.util.ts` `parseEntryDate()` convierte "YYYY-MM-DD" en las 12:00 hora de La Habana (APP_TZ). Se usa en movimientos y deudas.
- **A8. Bot:** las elecciones a medio hacer del bot caducan a los 15 minutos, con el aviso "vuelve a enviarlo".

## Fase 1 — Aprobaciones (rama `s6/aprobaciones`, migración `2_aprobaciones`)
**Esquema**
- `enum TransactionStatus { PENDING APPROVED REJECTED }`.
- En `Transaction`: `status` (sin valor por defecto en Prisma, para que el compilador señale cada sitio que crea movimientos), `submittedAt`, `reviewedBy`, `reviewedAt`, `rejectionReason` y `originalSnapshot Json?`.
- Índice `[orgId, deletedAt, status, type, date]`.
- `OrgMember.autoApprove` y `autoApproveLimits Json?` (centavos por moneda).
- `Debt.approvalStatus`.
- Migración SQL editada a mano: los datos existentes quedan como APPROVED.
- Las dos patas de un par comparten siempre el estado.

**Reglas**
- `modules/approvals/approval-policy.service.ts` `decide()`:
  - OWNER y ADMIN → APPROVED.
  - ACCOUNTANT → APPROVED solo con `autoApprove` activo y cada pata dentro del tope de su moneda.
  - Moneda sin tope → PENDING. Interruptor activo sin ningún tope → APPROVED.
- `common/tx-filters.ts`:
  - `COUNTED` (borrado nulo y aprobado), `flowWhere()`, `countedSql()` y `flowSql()` para el SQL a mano.
  - Se aplican en todos los sitios: saldos, panel, análisis (incluidos el SQL de tendencia y el de recurrentes), presupuestos, resumen y bot.
  - Un test que hace de guardián (`tx-filters.guard.spec.ts`) falla si aparece un `deletedAt: null` suelto.
- `buildWhere` acepta `status`. El visualizador recibe solo lo aprobado.

**Endpoints (nuevo módulo `ApprovalsModule`)**

| Endpoint | Quién | Qué hace |
|---|---|---|
| `GET /approvals?scope=review\|mine` | review: OWNER/ADMIN; mine: el autor | Lista de entradas (un par o una deuda cuenta como una) |
| `GET /approvals/counts` | Todos | Números para las insignias |
| `POST /approvals/:id/approve {edits?}` | OWNER/ADMIN | Valida, guarda `originalSnapshot`, aplica con `applyEntryEdits` y marca las dos patas. Si dos admins aprueban a la vez, uno recibe 409 |
| `POST /approvals/:id/reject {reason}` | OWNER/ADMIN | Rechaza con motivo |
| `PATCH /approvals/:id` | El autor | Edita lo suyo pendiente o rechazado; si estaba rechazado, lo reenvía |
| `POST /approvals/:id/resubmit` y `/withdraw` | El autor | Reenviar sin cambios o retirarlo |
| `PATCH /organizations/:id/members/:memberId/approval` | OWNER/ADMIN | Autoconfirmar y topes del miembro, con historial |
| `GET /notifications` | Todos | Avisos al autor, usando el modelo `Notification`, que existe sin usar |

**Permisos**
- ACCOUNTANT: crea en PENDING (salvo autoconfirmar). El cambio en lote solo afecta a lo suyo pendiente. Ya no puede borrar deudas.
- `packages/shared`: `APPROVE_ROLES`, el tipo `TransactionStatus` y los tipos `ApprovalItem`/`ApprovalCounts`.

**Historial y avisos**
- `AuditService.log` guarda antes y después (`diffEntry()`) dentro de la misma transacción de base de datos.
- Mensajes al grupo de Telegram: "⏳ Por aprobar", "✅ Aprobado (con correcciones)" y "❌ Rechazado: motivo".
- El bot, en `saveExpense`, usa `decide()`. `/balance` muestra los pendientes aparte y `/deudas` usa la moneda de la deuda.

**Web**
- Menú "Aprobaciones" con insignia; se actualiza cada 60 s y al volver a la ventana.
- `pages/Approvals.tsx` con dos pestañas: "Por revisar" (Aprobar / Editar y aprobar / Rechazar) y "Mis envíos".
- Etiquetas de estado y filtro en Movimientos. "Pendiente" en el Panel y en Cuentas.
- En la página de Organización: interruptor y topes por miembro.
- Textos en español e inglés.

**Android (v0.3.0)**
- DTOs con `status`.
- `createTransaction` devuelve el movimiento, y la app avisa "Enviado · pendiente de aprobación".
- Inicio muestra "N por aprobar" y el pendiente de cada cuenta.
- Pantalla de aprobaciones con hoja de revisión (los campos de EntrySheet) y diálogo de rechazo.
- "Mis envíos" en Más.

**Datos de prueba (`seed-prueba.ts`):**
- Todo lo creado lleva `status`, y las deudas, `currency`.
- Nuevo usuario Pedro (ACCOUNTANT, sin autoconfirmar). Carlos, con topes.
- Pendientes de muestra: un gasto, un cambio y un pago de deuda. Además, uno rechazado y uno aprobado con correcciones.

## Fase 2 — Valoración FIFO (ramas `s8/valuacion-api` y `s8/valuacion-web`, migración `3_valuacion`)
**Modelo**
- En `Organization`: `reportCurrency`, `valuationEnabled`, `valuationDirtyFrom`, `valuationVersion` y `closedThrough`.
- En `Transaction`: `reportAmount`, `valuationStatus` (EXACT / ESTIMATE / MISSING_RATE) y `fxResult`.
- Tablas nuevas `FxLot` y `FxAllocation`. Se guardan en la base de datos para explicar cada cifra: "400 000 MN del cambio del 01/10 @600 + …".
- Tabla nueva `MonthClose`.
- `ExchangeRate` (ya existe sin usar): se ancla en MN (1 X = N MN). MLC, EUR y USDT se valoran con tasa cruzada. MANUAL tiene prioridad sobre la automática.
- `Budget.basis`: NATIVE o REPORT.

**Motor:** `modules/valuation/fifo-engine.ts`, una función pura.
- **Eventos:** movimientos aprobados, ordenados por fecha, `createdAt` e id.
- **Precisión:** el costo se lleva en micros (`BigInt`) y se conserva exacto.
- **Cómo trata cada movimiento:**
  - **Entrada en otra moneda C:** lote a la tasa de referencia. Si falta la tasa, MISSING_RATE y aviso bloqueante.
  - **Gasto en C:** consume los lotes más viejos primero. Si no alcanza, el déficit es ESTIMATE hasta que lo cubra el siguiente lote; entonces pasa a EXACT.
  - **Cambio USD→C:** crea un lote con la tasa exacta.
  - **Cambio C→USD:** consume lotes y genera `fxResult`.
  - **Cambio C1→C2:** consume lotes de C1 y crea un lote de C2 al mismo costo.
  - **Transferencias:** se ignoran.
- **Comprobación tras cada cálculo:** lo que queda en los lotes, menos el déficit, debe ser igual a la suma de saldos de esa moneda.

**Recálculo y cierres**
- `markDirty()` en cada cambio que afecte a lo aprobado: aprobar, editar, borrar, una tasa, `reportCurrency`.
- Tarea en el propio proceso, con un retardo de 2 s y un bloqueo de PostgreSQL (`pg_advisory_xact_lock`). Recalcula desde el primer mes abierto y solo escribe lo que cambió.
- Una tarea de respaldo cada 5 minutos y al arrancar (`@nestjs/schedule`) recoge lo que quedara a medias.
- **Cerrar un mes** (OWNER/ADMIN): exige que el anterior esté cerrado y que no haya pendientes ni tasas faltantes en ese mes. Congela el estado del mes.
- **Reabrir:** solo el propietario, y solo el último mes cerrado.
- `assertOpenPeriod()` bloquea anotar, editar o aprobar con fecha en un mes cerrado.

**Tasas (`modules/rates`)**
- **Fuente (pasada por Frank el 2026-10-20):** `https://eltoke.merxbit.com` (doc en `/doc`, sin auth).
  - `GET /tasa?fecha=YYYY-MM-DD` da un valor por día: el que elTOQUE publica a las 7:00 hora de Cuba. Hay histórico desde al menos 2024.
  - Viene en **CUP por unidad** (USD, EUR, MLC, `USDT_TRC20`→USDT).
  - Antes de las 7:00, hoy da 404. Si elTOQUE limita (503), se reintenta con espera.
- Descarga diaria desde el endpoint que pase Frank (`RATES_SOURCE_URL`).
- Rellena los últimos 14 días que falten y tiene un script para el histórico.
- Hoy (y ayer hasta las 06:00) se marca como ≈. Después, si falta la tasa, bloquea.
- `PUT /rates/:date` para poner la tasa a mano (OWNER/ADMIN, con historial).
- Si falla la descarga, avisa por Telegram.

**API**
- `GET /valuation/status`: aviso de tasas que faltan.
- `GET /valuation/transactions/:id`: de qué lotes salió un movimiento.
- `GET /valuation/lots`.
- `GET /valuation/patrimony`: a costo, a tasa de hoy y la devaluación.
- Panel: `report{…}`.
- Análisis y presupuestos: `basis=REPORT`, más `fxResult` e `incomplete`.

**Clientes**
- Las cifras se muestran como "6 400 MN ≈ 10,67 USD".
- Páginas nuevas de Tasas y Cierres.
- Aviso al admin de tasas que faltan.
- Tarjetas de Patrimonio. En Análisis, el chip "Todo en USD" y la línea "Resultado cambiario".
- En Android, los totales de Inicio en ≈ USD.

## Fase 2c — Diferencias de cambio como la NIC 21 (rama `s7/diferencias-cambio`, migración `5_diferencias_cambio`)
Idea de Frank (2026-10-20): por cada gasto en otra moneda, comparar la tasa a la que se cambió con la de elTOQUE, para saber cuánto se gana o se pierde por retener MN.

**Decisiones de Frank**
- Se compara contra la tasa del **lote FIFO** de donde salió el MN, no contra la del último cambio, para que todo cuadre al centavo con los USD que salieron.
- La diferencia se parte en dos:
  - **por cambio**: el lote contra el mercado del día en que entró. Vale 0 en el MN que entró por ventas o saldo inicial.
  - **por retener**: el mercado de ese día contra el del día del gasto.
- **Panel al estilo NIC 21:** los gastos se ven a mercado del día, y cada gasto genera su línea de diferencia de cambio. En palabras de Frank: "al final cuadra más porque por cada gasto se genera una línea para compensar pérdida o ganancia". El neto incluye esa línea.

**Modelo**
- En `transactions`: `marketAmount`, `fxExchange` y `fxHolding`. `fxResult` = `fxExchange` + `fxHolding`.
- En un gasto: `reportAmount` (costo FIFO) = `marketAmount` − `fxResult`.
- En `fx_lots`: `marketMicros` y `remainingMarketMicros`. En `fx_allocations`: `marketMicros`.
- `ENGINE_VERSION` entra en la huella, así que un cambio de reglas fuerza el recálculo.

**Reglas**
- **Venta de MN por USD:** "por cambio" suma lo recibido contra el mercado del día.
- **Déficit de un mes cerrado, o de un cambio entre monedas de bolsa:** al cubrirse, su diferencia va a quien trajo el lote, partida igual.
- **Valor a mercado de un día sin tasa** (valor por defecto, no preguntado): se usa la última tasa anterior, marcada como estimada, y el día queda en "tasas que faltan". Si no hay ninguna tasa anterior, el gasto queda sin valorar.
- **Patrimonio:** lo no realizado (a tasa de hoy − a costo) también se parte en por cambio y por retener.
- **Presupuestos en USD** (valor por defecto): suman a mercado, igual que el análisis.

**Clientes**
- **Panel:** tarjeta "Diferencias de cambio". Debajo del patrimonio, "sin realizar: por cambio · por retener".
- **Análisis "Todo en USD":** cuarta tarjeta con la diferencia de cambio. El neto y la tendencia la incluyen.
- **Detalle del movimiento:** a mercado, costo real y diferencia, con las dos partes. Debajo, de qué cambios salió, con su tasa y la del mercado de ese día.
- **App 0.5.0:** "Gastos a mercado" y la línea de diferencias de cambio en Inicio. El "≈ USD" de cada movimiento es su valor a mercado.

**Verificación**
- `fifo-engine.spec.ts` (24 tests) incluye el ejemplo de Frank: 60 000 MN cambiados a 600 (mercado a 610) y gastados con el mercado a 650. Resultado: 100,00 = 92,31 a mercado + 1,64 por cambio + 6,05 por retener.
- La prueba con secuencias al azar comprueba en cada gasto que costo = mercado − diferencia y que la diferencia es la suma de sus dos partes.
- `check-valuacion.mjs` usa tasas puestas a mano y comprueba que el neto a mercado más las diferencias es igual al neto a costo FIFO (3 848,49).

## Archivos críticos
- `apps/api/src/prisma/schema.prisma` y las migraciones nuevas.
- `apps/api/src/modules/transactions/transactions.service.ts`.
- `apps/api/src/common/account-balance.util.ts`, más los nuevos `tx-filters.ts`, `entry-date.util.ts` y `org-refs.util.ts`.
- `apps/api/src/modules/debts/debts.service.ts` y `telegram/telegram.service.ts`.
- `dashboard.service.ts`, `analytics.service.ts`, `budgets.service.ts`, `accounts.service.ts`, `audit.service.ts` y `organizations.service.ts`.
- `seed-prueba.ts` y `packages/shared/src/constants/index.ts`.
- Web: `Transactions.tsx` y `AppLayout.tsx`, más la página nueva `Approvals.tsx`.
- Android: `Api.kt`, `EntryRepository.kt` y `EntrySheet.kt`.

## Verificación
Flujo de cada fase:
- Rama → despliegue en prueba (`migrate deploy`) → volver a cargar los datos de prueba (`seed-prueba`) → checks con script → prueba manual de Frank → PR a `main` (con su OK) → `pg_dump` de producción antes de migrar.

Fases:
- **Fase 0:**
  - Editar un par desde cualquiera de sus patas mantiene las dos sincronizadas.
  - Cambiar la moneda de una cuenta con movimientos → 409. EXCHANGE con la misma moneda → 400. Pago de deuda en otra moneda → 400. Referencia a otra organización → 400.
  - Una fecha enviada desde Android cae en el día correcto.
- **Fase 1:** `scripts/check-aprobaciones.mjs`.
  - Lo de Pedro queda pendiente y no mueve saldos.
  - Aprobado con corrección: se guardan antes y después, y Pedro recibe el aviso.
  - Rechazar sin motivo → 400. Rechazado → corregido → reenviado.
  - Dos aprobaciones a la vez → 409 en una.
  - Pedro editando algo aprobado → 403.
  - Los topes de Carlos funcionan.
  - Deuda pendiente y pagos.
  - El bot, con tests unitarios.
  - APK de pruebas probado con Frank, un admin y Pedro.
- **Fase 2:** `fifo-engine.spec.ts` con los ejemplos.
  - 1 000 USD→600 000 MN y 500 USD→330 000 MN; gastos de 200 000 y 500 000 MN → **333,33** y **818,18** USD. Quedan **348,48**. Total 1 500.
  - Bolsa negativa: 161,29 estimado → 151,52 exacto.
  - Cambio con fecha atrasada: 325,00 / 828,03 / 446,97.
  - Venta de MN por USD: −18,48.
  - MN→MLC.
  - Tasa que falta.
  - USDT.
  - Cierre de mes.
  - Prueba con secuencias aleatorias de conservación del costo.
  - `check-valuacion.mjs` contra prueba con tasas sintéticas.
  - En producción: cargar las tasas desde el primer movimiento, activar la valoración en la organización de Frank y revisar el patrimonio.

## Valores por defecto que no se preguntaron (se pueden cambiar al revisar)
- En la migración, lo pagado de cada deuda se recalcula a partir de los movimientos, después de revisar el script A0 con Frank.
- Al cerrar un mes con déficit abierto, se congela a la tasa de referencia y la diferencia posterior va a resultado cambiario.
- En un cambio C1→C2 con déficit, la diferencia va a resultado cambiario (no se arrastra al lote).
- En el patrimonio, las deudas se valoran a la tasa de hoy.
- Los miembros ACCOUNTANT que ya existen empiezan sin autoconfirmar.
