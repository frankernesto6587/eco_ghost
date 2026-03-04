# EcoGhost - Documento de Diseno Completo

## Resumen del Proyecto

EcoGhost es una plataforma SaaS de gestion financiera personal y empresarial. Permite a usuarios y organizaciones controlar ingresos, gastos, deudas, proyectos con presupuesto, arqueo de caja y multiples monedas. Arquitectura multi-tenant con roles, pensada para escalar comercialmente.

---

## Stack Tecnologico

### Infraestructura
| Componente | Tecnologia |
|------------|-----------|
| Monorepo | Turborepo + pnpm workspaces |
| Lenguaje | TypeScript (strict mode) |
| CI/CD | GitHub Actions |
| Deploy API | Railway / Render / VPS |
| Deploy Web | Vercel / Cloudflare Pages |
| DB Hosting | Supabase / Railway PostgreSQL |

### Backend (apps/api)
| Componente | Tecnologia |
|------------|-----------|
| Framework | NestJS (Fastify adapter) |
| ORM | Prisma |
| Base de datos | PostgreSQL |
| Auth | Passport.js (Local + Google OAuth) + JWT |
| Validacion | class-validator + class-transformer |
| Docs API | Swagger (@nestjs/swagger) |
| Testing | Jest + Supertest |

### Frontend Web (apps/web)
| Componente | Tecnologia |
|------------|-----------|
| Framework | React 19 + Vite |
| UI Components | Ant Design 5 |
| Estilos | Ant Design Tokens + CSS Modules |
| Iconos | Ant Design Icons + Lucide React |
| State global | Zustand |
| Server state | TanStack Query (React Query) |
| HTTP Client | Axios |
| Formularios | Ant Design Form |
| Routing | React Router v7 |
| Charts | @ant-design/charts |
| Fechas | Day.js |
| Exportacion | jsPDF + SheetJS |
| i18n | react-i18next (es/en) |

### Paquete Compartido (packages/shared)
- Tipos TypeScript (DTOs, enums, interfaces)
- Constantes (roles, planes, limites)
- Funciones de validacion reutilizables

---

## Estructura del Proyecto

```
EcoGhost/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── auth/
│   │   │   │   ├── users/
│   │   │   │   ├── organizations/
│   │   │   │   ├── transactions/
│   │   │   │   ├── accounts/
│   │   │   │   ├── currencies/
│   │   │   │   ├── debts/
│   │   │   │   ├── projects/
│   │   │   │   ├── cash-count/
│   │   │   │   ├── categories/
│   │   │   │   ├── reports/
│   │   │   │   ├── notifications/
│   │   │   │   ├── integrations/
│   │   │   │   ├── plans/
│   │   │   │   └── dashboard/
│   │   │   ├── common/
│   │   │   │   ├── guards/         # AuthGuard, RolesGuard, PlanLimitGuard
│   │   │   │   ├── interceptors/   # TenantInterceptor, LoggingInterceptor
│   │   │   │   ├── decorators/     # @CurrentUser, @Roles, @OrgId
│   │   │   │   └── filters/        # GlobalExceptionFilter
│   │   │   ├── prisma/
│   │   │   │   ├── schema.prisma
│   │   │   │   └── seed.ts
│   │   │   └── main.ts
│   │   ├── test/
│   │   └── package.json
│   └── web/
│       ├── src/
│       │   ├── assets/
│       │   ├── components/
│       │   │   ├── layout/
│       │   │   ├── common/
│       │   │   └── feedback/
│       │   ├── features/
│       │   │   ├── auth/
│       │   │   ├── dashboard/
│       │   │   ├── transactions/
│       │   │   ├── accounts/
│       │   │   ├── debts/
│       │   │   ├── projects/
│       │   │   ├── cash-count/
│       │   │   ├── categories/
│       │   │   ├── reports/
│       │   │   ├── settings/
│       │   │   └── organization/
│       │   ├── hooks/
│       │   ├── services/
│       │   ├── store/
│       │   ├── lib/
│       │   ├── routes/
│       │   ├── theme/
│       │   ├── i18n/
│       │   ├── App.tsx
│       │   └── main.tsx
│       └── package.json
├── packages/
│   └── shared/
│       ├── src/
│       │   ├── types/
│       │   ├── constants/
│       │   └── validators/
│       └── package.json
├── docs/
│   └── plans/
├── turbo.json
├── pnpm-workspace.yaml
├── .env.example
├── .gitignore
└── package.json
```

---

## Multi-Tenancy

### Estrategia: Row-Level Isolation
- Cada tabla con datos de negocio tiene columna `orgId`
- `TenantInterceptor` en NestJS inyecta automaticamente el `orgId` del usuario autenticado en cada query
- Header `X-Organization-Id` permite al usuario cambiar entre organizaciones
- El interceptor valida que el usuario sea miembro de la organizacion solicitada

### Flujo:
1. Usuario se autentica -> JWT contiene `userId`
2. Frontend envia header `X-Organization-Id` con cada request
3. `TenantInterceptor` valida membresia y extrae `orgId`
4. Todos los services reciben `orgId` via decorator `@OrgId()`
5. Prisma queries filtran automaticamente por `orgId`

---

## Roles y Permisos

| Permiso | OWNER | ADMIN | ACCOUNTANT | VIEWER |
|---------|-------|-------|------------|--------|
| Ver datos financieros | Si | Si | Si | Si |
| Crear/editar transacciones | Si | Si | Si | No |
| Gestionar deudas | Si | Si | Si | No |
| Gestionar proyectos | Si | Si | Si | No |
| Arqueo de caja | Si | Si | Si | No |
| Exportar reportes | Si | Si | Si | No |
| Invitar miembros | Si | Si | No | No |
| Cambiar roles | Si | Si | No | No |
| Gestionar cuentas | Si | Si | No | No |
| Configurar integraciones | Si | Si | No | No |
| Eliminar organizacion | Si | No | No | No |
| Gestionar facturacion/plan | Si | No | No | No |

---

## Modelo de Datos (Prisma Schema)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum AuthProvider {
  LOCAL
  GOOGLE
  GITHUB
}

enum Role {
  OWNER
  ADMIN
  ACCOUNTANT
  VIEWER
}

enum Plan {
  FREE
  PRO
  BUSINESS
}

enum AccountType {
  CASH
  BANK
  DIGITAL
  OTHER
}

enum TransactionType {
  INCOME
  EXPENSE
  TRANSFER
}

enum DebtType {
  RECEIVABLE
  PAYABLE
}

enum DebtStatus {
  PENDING
  PARTIAL
  PAID
}

enum ProjectStatus {
  ACTIVE
  COMPLETED
  CANCELLED
}

model User {
  id            String       @id @default(cuid())
  email         String       @unique
  name          String
  passwordHash  String?
  avatarUrl     String?
  provider      AuthProvider @default(LOCAL)
  providerId    String?
  isVerified    Boolean      @default(false)
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt

  memberships   OrgMember[]
  refreshTokens RefreshToken[]
}

model RefreshToken {
  id        String   @id @default(cuid())
  token     String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())

  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model Organization {
  id           String   @id @default(cuid())
  name         String
  slug         String   @unique
  plan         Plan     @default(FREE)
  baseCurrency String   @default("USD")
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  members       OrgMember[]
  accounts      Account[]
  transactions  Transaction[]
  categories    Category[]
  debts         Debt[]
  projects      Project[]
  cashCounts    CashCount[]
  exchangeRates ExchangeRate[]
  integrations  Integration[]
  invitations   Invitation[]
  notifications Notification[]
}

model OrgMember {
  id       String   @id @default(cuid())
  role     Role     @default(VIEWER)
  joinedAt DateTime @default(now())

  userId String
  user   User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  orgId  String
  org    Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)

  @@unique([userId, orgId])
  @@index([orgId])
}

model Invitation {
  id        String   @id @default(cuid())
  email     String
  role      Role     @default(VIEWER)
  token     String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())

  orgId String
  org   Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)

  @@index([orgId])
}

model Account {
  id       String      @id @default(cuid())
  name     String
  type     AccountType
  currency String
  icon     String?
  isActive Boolean     @default(true)

  orgId        String
  org          Organization  @relation(fields: [orgId], references: [id], onDelete: Cascade)
  transactions Transaction[]
  cashCounts   CashCount[]

  @@index([orgId])
}

model Transaction {
  id          String          @id @default(cuid())
  date        DateTime
  description String
  amount      Int
  type        TransactionType
  notes       String?

  categoryId String?
  category   Category? @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  accountId  String
  account    Account   @relation(fields: [accountId], references: [id], onDelete: Cascade)
  projectId  String?
  project    Project?  @relation(fields: [projectId], references: [id], onDelete: SetNull)
  debtId     String?
  debt       Debt?     @relation(fields: [debtId], references: [id], onDelete: SetNull)

  linkedTransactionId String?      @unique
  linkedTransaction   Transaction? @relation("TransferLink", fields: [linkedTransactionId], references: [id])
  linkedBy            Transaction? @relation("TransferLink")

  orgId     String
  org       Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  createdBy String
  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt

  @@index([orgId])
  @@index([orgId, date])
  @@index([orgId, accountId])
  @@index([orgId, categoryId])
  @@index([orgId, projectId])
}

model Category {
  id       String  @id @default(cuid())
  name     String
  icon     String?
  color    String?
  parentId String?
  parent   Category?  @relation("CategoryTree", fields: [parentId], references: [id])
  children Category[] @relation("CategoryTree")

  orgId        String
  org          Organization  @relation(fields: [orgId], references: [id], onDelete: Cascade)
  transactions Transaction[]

  @@index([orgId])
}

model Debt {
  id          String     @id @default(cuid())
  personName  String
  description String
  totalAmount Int
  paidAmount  Int        @default(0)
  type        DebtType
  status      DebtStatus @default(PENDING)
  dueDate     DateTime?
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  orgId        String
  org          Organization  @relation(fields: [orgId], references: [id], onDelete: Cascade)
  transactions Transaction[]

  @@index([orgId])
}

model Project {
  id          String        @id @default(cuid())
  name        String
  description String?
  budget      Int
  startDate   DateTime
  endDate     DateTime?
  status      ProjectStatus @default(ACTIVE)
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  orgId        String
  org          Organization  @relation(fields: [orgId], references: [id], onDelete: Cascade)
  transactions Transaction[]

  @@index([orgId])
}

model CashCount {
  id            String   @id @default(cuid())
  date          DateTime
  denominations Json
  countedTotal  Int
  systemBalance Int
  difference    Int
  notes         String?
  createdAt     DateTime @default(now())

  accountId String
  account   Account      @relation(fields: [accountId], references: [id], onDelete: Cascade)
  orgId     String
  org       Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)

  @@index([orgId])
}

model ExchangeRate {
  id           String   @id @default(cuid())
  fromCurrency String
  toCurrency   String
  rate         Decimal  @db.Decimal(16, 6)
  date         DateTime
  source       String   @default("MANUAL")

  orgId String
  org   Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)

  @@unique([orgId, fromCurrency, toCurrency, date])
  @@index([orgId])
}

model Integration {
  id       String  @id @default(cuid())
  type     String
  config   Json
  isActive Boolean @default(true)

  orgId String
  org   Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)

  @@index([orgId])
}

model Notification {
  id        String   @id @default(cuid())
  title     String
  message   String
  type      String
  isRead    Boolean  @default(false)
  metadata  Json?
  createdAt DateTime @default(now())

  userId String
  orgId  String
  org    Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)

  @@index([orgId, userId])
}
```

---

## API Endpoints

### Auth
| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| POST | /api/v1/auth/register | Registro email/password |
| POST | /api/v1/auth/login | Login email/password |
| POST | /api/v1/auth/refresh | Refrescar access token |
| POST | /api/v1/auth/logout | Invalidar refresh token |
| GET | /api/v1/auth/google | Iniciar OAuth Google |
| GET | /api/v1/auth/google/callback | Callback OAuth Google |
| GET | /api/v1/auth/me | Info usuario actual + organizaciones |

### Organizations
| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| POST | /api/v1/organizations | Crear organizacion |
| GET | /api/v1/organizations | Listar mis organizaciones |
| GET | /api/v1/organizations/:id | Detalle de organizacion |
| PATCH | /api/v1/organizations/:id | Editar organizacion |
| DELETE | /api/v1/organizations/:id | Eliminar organizacion (OWNER) |
| POST | /api/v1/organizations/:id/invite | Invitar miembro por email |
| GET | /api/v1/organizations/:id/members | Listar miembros |
| PATCH | /api/v1/organizations/:id/members/:mid | Cambiar rol |
| DELETE | /api/v1/organizations/:id/members/:mid | Remover miembro |
| POST | /api/v1/invitations/:token/accept | Aceptar invitacion |

### Scoped Resources (Header: X-Organization-Id)

#### Accounts
| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| POST | /api/v1/accounts | Crear cuenta |
| GET | /api/v1/accounts | Listar cuentas con balance |
| GET | /api/v1/accounts/:id | Detalle con balance |
| PATCH | /api/v1/accounts/:id | Editar cuenta |
| DELETE | /api/v1/accounts/:id | Desactivar cuenta |

#### Transactions
| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| POST | /api/v1/transactions | Crear transaccion |
| GET | /api/v1/transactions | Listar con filtros y paginacion |
| GET | /api/v1/transactions/:id | Detalle |
| PATCH | /api/v1/transactions/:id | Editar |
| DELETE | /api/v1/transactions/:id | Eliminar |
| GET | /api/v1/transactions/summary | Totales por periodo |

#### Categories
| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| POST | /api/v1/categories | Crear categoria |
| GET | /api/v1/categories | Listar arbol de categorias |
| PATCH | /api/v1/categories/:id | Editar |
| DELETE | /api/v1/categories/:id | Eliminar |

#### Debts
| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| POST | /api/v1/debts | Crear deuda |
| GET | /api/v1/debts | Listar con filtros |
| GET | /api/v1/debts/:id | Detalle con pagos |
| PATCH | /api/v1/debts/:id | Editar |
| DELETE | /api/v1/debts/:id | Eliminar |
| POST | /api/v1/debts/:id/payments | Registrar pago |

#### Projects
| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| POST | /api/v1/projects | Crear proyecto |
| GET | /api/v1/projects | Listar proyectos |
| GET | /api/v1/projects/:id | Detalle con resumen financiero |
| PATCH | /api/v1/projects/:id | Editar |
| DELETE | /api/v1/projects/:id | Eliminar |

#### Cash Counts
| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| POST | /api/v1/cash-counts | Crear arqueo |
| GET | /api/v1/cash-counts | Historial de arqueos |
| GET | /api/v1/cash-counts/:id | Detalle |
| DELETE | /api/v1/cash-counts/:id | Eliminar |

#### Exchange Rates
| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| POST | /api/v1/exchange-rates | Crear tasa |
| GET | /api/v1/exchange-rates | Listar tasas |
| GET | /api/v1/exchange-rates/latest | Ultima tasa por par |
| GET | /api/v1/exchange-rates/convert | Convertir monto |

#### Dashboard
| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | /api/v1/dashboard/overview | Balance total, ingresos/gastos del mes, deudas pendientes |
| GET | /api/v1/dashboard/charts | Datos para graficos (gastos por categoria, tendencia mensual) |

#### Reports
| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | /api/v1/reports/monthly | Reporte mensual detallado |
| GET | /api/v1/reports/by-category | Gastos agrupados por categoria |
| GET | /api/v1/reports/by-project | Gastos por proyecto vs presupuesto |
| GET | /api/v1/reports/export/pdf | Exportar reporte en PDF |
| GET | /api/v1/reports/export/excel | Exportar reporte en Excel |

#### Integrations
| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | /api/v1/integrations | Listar integraciones |
| POST | /api/v1/integrations | Configurar integracion |
| PATCH | /api/v1/integrations/:id | Actualizar config |
| DELETE | /api/v1/integrations/:id | Desactivar |
| POST | /api/v1/integrations/telegram/link | Vincular cuenta Telegram |

#### Notifications
| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | /api/v1/notifications | Listar notificaciones |
| PATCH | /api/v1/notifications/:id/read | Marcar como leida |
| POST | /api/v1/notifications/read-all | Marcar todas como leidas |

---

## Planes de Suscripcion

| Limite | FREE | PRO | BUSINESS |
|--------|------|-----|----------|
| Organizaciones | 1 | 3 | Ilimitado |
| Miembros por org | 2 (owner + 1) | 10 | Ilimitado |
| Transacciones/mes | 100 | Ilimitado | Ilimitado |
| Cuentas | 2 | 10 | Ilimitado |
| Proyectos | 1 | Ilimitado | Ilimitado |
| Reportes basicos | Si | Si | Si |
| Reportes avanzados | No | Si | Si |
| Exportar PDF/Excel | No | Si | Si |
| Integraciones | No | Si | Si |
| API access | No | No | Si |
| Audit log | No | No | Si |
| Soporte prioritario | No | No | Si |

---

## Fases de Implementacion

### FASE 1 - Core MVP
1. Setup monorepo (Turborepo + pnpm + TypeScript)
2. Setup NestJS con Fastify adapter
3. Setup Prisma + PostgreSQL + schema + seed
4. Modulo Auth (registro, login, JWT + refresh tokens)
5. OAuth Google
6. Modulo Organizations (CRUD + miembros + roles)
7. TenantInterceptor + RolesGuard
8. Modulo Accounts (CRUD + balance calculado)
9. Modulo Transactions (CRUD + filtros + paginacion cursor)
10. Modulo Categories (CRUD jerarquico + seed defaults)
11. Modulo Debts (CRUD + pagos parciales)
12. Dashboard endpoint (overview)
13. Setup React + Vite + Ant Design + tema
14. Auth pages (login, registro, OAuth)
15. Layout principal (sidebar, header, org switcher)
16. Dashboard page con widgets
17. Transactions page (tabla, filtros, crear/editar modal)
18. Accounts page
19. Debts page
20. Categories management
21. Organization settings (miembros, invitar)
22. Paquete shared (tipos, constantes)

### FASE 2 - Avanzado
1. Modulo Projects (CRUD + summary endpoint)
2. Projects page frontend (con charts de presupuesto)
3. Modulo CashCount
4. Cash count page frontend
5. Modulo ExchangeRates
6. Conversion de moneda en dashboard y reportes
7. Modulo Reports (monthly, by-category, by-project)
8. Reports page frontend con Ant Design Charts
9. Export PDF (jsPDF) y Excel (SheetJS)
10. Notifications modulo + in-app notifications
11. Profile settings page

### FASE 3 - Integraciones y Monetizacion
1. Telegram Bot integration
2. Integration settings page
3. Plan limits enforcement (PlanLimitGuard)
4. Stripe integration para pagos
5. Billing page
6. Landing page publica
7. i18n (espanol + ingles)
8. Webhook system

---

## Funcionalidades Competitivas Recomendadas

1. **Telegram Bot bidireccional**: No solo notificaciones, tambien registrar gastos via chat
2. **Arqueo de caja digital**: Funcionalidad unica que la mayoria de apps no tienen
3. **Proyectos con presupuesto visual**: Barras de progreso, alertas de exceso
4. **Multi-moneda real**: No solo tracking sino conversion historica
5. **Roles granulares**: Contador puede gestionar sin ver configuracion
6. **Quick entry**: Registro rapido de transaccion desde cualquier pagina (FAB button)
7. **Recurrentes**: Transacciones que se repiten automaticamente (salario, renta)
8. **Modo offline** (futuro mobile): Registrar gastos sin internet, sincronizar despues
