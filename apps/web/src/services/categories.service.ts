import type { CategoryKind } from '@ecoghost/shared';
import { api } from './api';

export interface Category {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  /** Ajuste (saldo inicial, correccion): no cuenta como ingreso ni gasto */
  isAdjustment?: boolean;
  /** En que movimientos sale; las subcategorias llevan el de su grupo. */
  kind: `${CategoryKind}`;
  parentId: string | null;
  orgId: string;
  children: Category[];
}

export interface CreateCategoryDto {
  name: string;
  icon?: string;
  color?: string;
  isAdjustment?: boolean;
  /** Solo en grupos: las subcategorias toman el de su grupo */
  kind?: `${CategoryKind}`;
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
