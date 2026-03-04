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

/** Dashboard overview data */
export interface DashboardOverview {
  totalBalance: Record<string, number>;
  monthIncome: Record<string, number>;
  monthExpense: Record<string, number>;
  pendingDebtsReceivable: Record<string, number>;
  pendingDebtsPayable: Record<string, number>;
  activeProjects: number;
  recentTransactions: TransactionSummary[];
}

/** Transaction summary for lists */
export interface TransactionSummary {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: TransactionType;
  categoryName: string | null;
  accountName: string;
}
