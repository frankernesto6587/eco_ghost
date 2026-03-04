import { api } from './api';

export interface Account {
  id: string;
  name: string;
  type: string;
  currency: string;
  balance: number;
  isActive: boolean;
  icon?: string;
  orgId: string;
}

export interface CreateAccountDto {
  name: string;
  type: string;
  currency: string;
  initialBalance?: number;
  color?: string;
  icon?: string;
}

export const accountsService = {
  async getAll(): Promise<Account[]> {
    const { data } = await api.get('/accounts');
    return data;
  },

  async getOne(id: string): Promise<Account> {
    const { data } = await api.get(`/accounts/${id}`);
    return data;
  },

  async create(payload: CreateAccountDto): Promise<Account> {
    const { data } = await api.post('/accounts', payload);
    return data;
  },

  async update(id: string, payload: Partial<CreateAccountDto>): Promise<Account> {
    const { data } = await api.patch(`/accounts/${id}`, payload);
    return data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/accounts/${id}`);
  },
};
