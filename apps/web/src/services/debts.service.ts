import { api } from './api';

export interface CreateDebtDto {
  personName: string;
  description?: string;
  totalAmount: number;
  type: string;
  accountId: string;
  dueDate?: string;
}

export interface AddPaymentDto {
  amount: number;
  date: string;
  accountId: string;
  description?: string;
}

export const debtsService = {
  async getAll(params?: { type?: string; status?: string }) {
    const { data } = await api.get('/debts', { params });
    return data;
  },

  async getOne(id: string) {
    const { data } = await api.get(`/debts/${id}`);
    return data;
  },

  async create(payload: CreateDebtDto) {
    const { data } = await api.post('/debts', payload);
    return data;
  },

  async update(id: string, payload: Partial<CreateDebtDto>) {
    const { data } = await api.patch(`/debts/${id}`, payload);
    return data;
  },

  async remove(id: string) {
    await api.delete(`/debts/${id}`);
  },

  async addPayment(id: string, payload: AddPaymentDto) {
    const { data } = await api.post(`/debts/${id}/payments`, payload);
    return data;
  },
};
