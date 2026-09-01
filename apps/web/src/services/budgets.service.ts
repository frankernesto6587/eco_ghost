import { api } from './api';
import type { Budget, BudgetProgress } from '@ecoghost/shared';

export interface CreateBudgetDto {
  categoryId?: string | null;
  currency: string;
  /** Tope en centavos */
  amount: number;
  /** 'YYYY-MM' */
  startMonth: string;
  endMonth?: string | null;
  rollover?: boolean;
  notes?: string;
}

export interface UpdateBudgetDto {
  amount?: number;
  endMonth?: string | null;
  rollover?: boolean;
  notes?: string;
  isActive?: boolean;
}

export const budgetsService = {
  async getAll(params?: { currency?: string; month?: string; includeInactive?: boolean }) {
    const { data } = await api.get<Budget[]>('/budgets', { params });
    return data;
  },

  async getProgress(params: { currency: string; month?: string }) {
    const { data } = await api.get<BudgetProgress>('/budgets/progress', { params });
    return data;
  },

  async create(payload: CreateBudgetDto) {
    const { data } = await api.post<Budget>('/budgets', payload);
    return data;
  },

  async update(id: string, payload: UpdateBudgetDto) {
    const { data } = await api.patch<Budget>(`/budgets/${id}`, payload);
    return data;
  },

  async remove(id: string) {
    const { data } = await api.delete<Budget>(`/budgets/${id}`);
    return data;
  },
};
