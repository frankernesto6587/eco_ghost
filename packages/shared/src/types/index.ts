/** Authentication provider types */
export enum AuthProvider {
  LOCAL = 'LOCAL',
  GOOGLE = 'GOOGLE',
  GITHUB = 'GITHUB',
}

/** Organization member roles - ordered by permission level */
export enum Role {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  ACCOUNTANT = 'ACCOUNTANT',
  VIEWER = 'VIEWER',
}

/** Subscription plan tiers */
export enum Plan {
  FREE = 'FREE',
  PRO = 'PRO',
  BUSINESS = 'BUSINESS',
}

/** Account types representing where money is held */
export enum AccountType {
  CASH = 'CASH',
  BANK = 'BANK',
  DIGITAL = 'DIGITAL',
  OTHER = 'OTHER',
}

/** Transaction types */
export enum TransactionType {
  INCOME = 'INCOME',
  EXPENSE = 'EXPENSE',
  TRANSFER = 'TRANSFER',
  EXCHANGE = 'EXCHANGE',
}

/** Debt direction: RECEIVABLE = they owe me, PAYABLE = I owe them */
export enum DebtType {
  RECEIVABLE = 'RECEIVABLE',
  PAYABLE = 'PAYABLE',
}

/** Debt payment status */
export enum DebtStatus {
  PENDING = 'PENDING',
  PARTIAL = 'PARTIAL',
  PAID = 'PAID',
}

/** Project lifecycle status */
export enum ProjectStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

/** Standard API response wrapper */
export interface ApiResponse<T> {
  data: T;
  meta?: {
    cursor?: string;
    hasMore?: boolean;
    total?: number;
  };
}

/** Standard API error response */
export interface ApiError {
  statusCode: number;
  message: string;
  error: string;
}

/** User profile (safe to expose to frontend) */
export interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  provider: AuthProvider;
  isVerified: boolean;
  createdAt: string;
}

/** Organization summary */
export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  plan: Plan;
  baseCurrency: string;
  role: Role;
}

/** Auth tokens response */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/** Login/Register response */
export interface AuthResponse {
  user: UserProfile;
  tokens: AuthTokens;
  organizations: OrganizationSummary[];
}

/** GET /auth/me response (no tokens) */
export interface ProfileResponse {
  user: UserProfile;
  organizations: OrganizationSummary[];
}

/** Cash count denomination entry */
export interface Denomination {
  value: number;
  quantity: number;
}

/** Saldo de una cuenta concreta, tal como lo devuelve el dashboard */
export interface DashboardAccountBalance {
  id: string;
  name: string;
  currency: string;
  balance: number;
}

/** Punto de la serie diaria de saldo acumulado, por moneda */
export interface DashboardDailyBalance {
  date: string;
  balances: Record<string, number>;
}

/** Transaccion tal como la anida el dashboard (category/account expandidos) */
export interface DashboardTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: `${TransactionType}`;
  notes: string | null;
  categoryId: string | null;
  accountId: string;
  linkedTransactionId: string | null;
  category: { id: string; name: string; icon: string | null; color: string | null } | null;
  account: { id: string; name: string; type: string; currency: string; icon: string | null };
}

/** Dashboard overview data — GET /dashboard/overview */
export interface DashboardOverview {
  /** Saldo acumulado actual, por moneda */
  totalBalance: Record<string, number>;
  /** Neto del rango seleccionado (ingresos - gastos), por moneda */
  rangeBalance: Record<string, number>;
  /** Saldo acumulado a hace 30 dias (no respeta from/to) */
  balance30dAgo: Record<string, number>;
  accountBalances: DashboardAccountBalance[];
  monthIncome: Record<string, number>;
  monthExpense: Record<string, number>;
  pendingDebtsReceivable: Record<string, number>;
  pendingDebtsPayable: Record<string, number>;
  activeProjects: number;
  recentTransactions: DashboardTransaction[];
  dailyBalance: DashboardDailyBalance[];
}

// ─── Analitica ───────────────────────────────────────────────────────

/** Rango de fechas de calendario, inclusivo, 'YYYY-MM-DD' */
export interface AnalyticsRange {
  from: string;
  to: string;
}

/**
 * Nodo del ranking por categoria.
 * `amount` es el rollup (propio + descendientes); `ownAmount` solo lo directo.
 * Invariante: amount === ownAmount + suma de children[].amount
 */
export interface CategoryRollupNode {
  /** null = bucket sintetico "Sin categorizar" */
  categoryId: string | null;
  name: string;
  icon: string | null;
  color: string | null;
  amount: number;
  ownAmount: number;
  count: number;
  /** amount / total del tipo, 0..1 */
  share: number;
  previousAmount: number;
  delta: number;
  /** null cuando previousAmount === 0 (no hay porcentaje que calcular) */
  deltaPct: number | null;
  children: CategoryRollupNode[];
}

/** Movimiento individual destacado */
export interface TopTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: `${TransactionType}`;
  category: { id: string; name: string; color: string | null } | null;
  account: { id: string; name: string; currency: string };
}

export interface AnalyticsTotals {
  income: number;
  expense: number;
  net: number;
  previousIncome: number;
  previousExpense: number;
  previousNet: number;
  expenseDelta: number;
  expenseDeltaPct: number | null;
  incomeDelta: number;
  incomeDeltaPct: number | null;
  transactionCount: number;
}

export interface AnalyticsDataQuality {
  uncategorizedExpense: number;
  uncategorizedExpenseCount: number;
  /** 0..1 */
  uncategorizedExpenseShare: number;
}

/**
 * GET /analytics/summary
 *
 * Todos los importes estan en `currency` y en centavos. En fase 2, `convertTo`
 * hara de `currency` la moneda DESTINO y se anadiran campos nuevos
 * (converted, sourceCurrencies, rates) sin cambiar ninguno de los actuales.
 */
export interface AnalyticsSummary {
  currency: string;
  range: AnalyticsRange;
  previousRange: AnalyticsRange;
  totals: AnalyticsTotals;
  expenseByCategory: CategoryRollupNode[];
  incomeByCategory: CategoryRollupNode[];
  dataQuality: AnalyticsDataQuality;
  topTransactions: TopTransaction[];
}

/** GET /analytics/top-categories — version ligera para el widget del dashboard */
export interface TopCategoriesWidget {
  currency: string;
  range: AnalyticsRange;
  totalExpense: number;
  items: {
    categoryId: string | null;
    name: string;
    icon: string | null;
    color: string | null;
    amount: number;
    share: number;
    deltaPct: number | null;
  }[];
  uncategorizedShare: number;
}

/** GET /analytics/trend */
export interface AnalyticsTrend {
  currency: string;
  /** month = 'YYYY-MM'; incluye los meses sin movimiento, en cero */
  points: { month: string; income: number; expense: number; net: number }[];
  averages: { income: number; expense: number; net: number };
}

/**
 * GET /analytics/recurring
 *
 * Heuristica: agrupa por descripcion normalizada, no hay campo de comercio.
 * La agrupacion es difusa a proposito — la senal fiable es el delta por categoria.
 */
export interface AnalyticsRecurring {
  currency: string;
  items: {
    key: string;
    sample: string;
    occurrences: number;
    total: number;
    average: number;
    firstDate: string;
    lastDate: string;
    categoryId: string | null;
    categoryName: string | null;
  }[];
}

// ─── Presupuestos ────────────────────────────────────────────────────

export type BudgetStatus = 'OK' | 'WARN' | 'OVER';

/**
 * Un presupuesto es una REGLA con ventana de meses, no una fila por mes.
 * `endMonth: null` = abierto, aplica todos los meses desde `startMonth`.
 */
export interface Budget {
  id: string;
  /** null = presupuesto total de la moneda (todos los gastos) */
  categoryId: string | null;
  category: { id: string; name: string; icon: string | null; color: string | null } | null;
  currency: string;
  amount: number;
  period: string;
  /** 'YYYY-MM' */
  startMonth: string;
  /** 'YYYY-MM' inclusive; null = abierto */
  endMonth: string | null;
  rollover: boolean;
  notes: string | null;
  isActive: boolean;
  orgId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetProgressItem {
  budgetId: string;
  categoryId: string | null;
  categoryName: string;
  icon: string | null;
  color: string | null;
  limit: number;
  spent: number;
  /** Puede ser negativo si se paso del tope */
  remaining: number;
  ratio: number;
  status: BudgetStatus;
  /** Extrapolacion lineal a fin de mes; null si el mes ya termino */
  projectedSpend: number | null;
}

/** GET /budgets/progress */
export interface BudgetProgress {
  month: string;
  currency: string;
  items: BudgetProgressItem[];
  totals: { limit: number; spent: number; overCount: number };
}
