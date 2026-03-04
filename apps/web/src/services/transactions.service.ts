import { api } from './api';

export interface TransactionFilters {
  type?: string;
  accountId?: string;
  categoryId?: string;
  currency?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
  deleted?: boolean;
}

export interface CreateTransactionDto {
  date: string;
  description: string;
  amount: number;
  type: string;
  accountId: string;
  categoryId?: string;
  toAccountId?: string;
  toAmount?: number;
  notes?: string;
}

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: string;
  notes: string | null;
  categoryId: string | null;
  accountId: string;
  projectId: string | null;
  debtId: string | null;
  linkedTransactionId: string | null;
  orgId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  deleteReason: string | null;
  category: { id: string; name: string; icon?: string; color?: string } | null;
  account: { id: string; name: string; currency: string; color?: string; icon?: string };
  project: unknown;
  debt: unknown;
}

export interface TransactionListResponse {
  data: Transaction[];
  meta: {
    cursor: string | null;
    hasMore: boolean;
  };
}

export interface TransactionSummary {
  income: Record<string, number>;
  expense: Record<string, number>;
  balance: Record<string, number>;
}

export interface TransactionSummaryParams {
  from?: string;
  to?: string;
  groupBy?: string;
}

export const transactionsService = {
  async getAll(params?: TransactionFilters): Promise<TransactionListResponse> {
    const { data } = await api.get('/transactions', { params });
    return data; // returns { data: [...], meta: { cursor, hasMore } }
  },

  async getOne(id: string): Promise<Transaction> {
    const { data } = await api.get(`/transactions/${id}`);
    return data;
  },

  async create(payload: CreateTransactionDto): Promise<Transaction> {
    const { data } = await api.post('/transactions', payload);
    return data;
  },

  async update(id: string, payload: Partial<CreateTransactionDto>): Promise<Transaction> {
    const { data } = await api.patch(`/transactions/${id}`, payload);
    return data;
  },

  async remove(id: string, reason: string): Promise<void> {
    await api.delete(`/transactions/${id}`, { data: { reason } });
  },

  async restore(id: string): Promise<Transaction> {
    const { data } = await api.patch(`/transactions/${id}/restore`);
    return data;
  },

  async getSummary(params?: TransactionSummaryParams): Promise<TransactionSummary> {
    const { data } = await api.get('/transactions/summary', { params });
    return data; // returns { income, expense, balance }
  },
};
