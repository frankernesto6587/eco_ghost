import { api } from './api';

export interface Category {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  parentId: string | null;
  orgId: string;
  children: Category[];
}

export interface CreateCategoryDto {
  name: string;
  icon?: string;
  color?: string;
  parentId?: string;
}

export const categoriesService = {
  async getAll(): Promise<Category[]> {
    const { data } = await api.get('/categories');
    return data;
  },

  async create(payload: CreateCategoryDto): Promise<Category> {
    const { data } = await api.post('/categories', payload);
    return data;
  },

  async update(id: string, payload: Partial<CreateCategoryDto>): Promise<Category> {
    const { data } = await api.patch(`/categories/${id}`, payload);
    return data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/categories/${id}`);
  },
};
