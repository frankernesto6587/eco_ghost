import { api } from './api';

export interface Tag {
  id: string;
  name: string;
  color: string | null;
  orgId: string;
  createdAt: string;
}

export interface CreateTagDto {
  name: string;
  color?: string;
}

export const tagsService = {
  async getAll(): Promise<Tag[]> {
    const { data } = await api.get('/tags');
    return data;
  },

  async create(payload: CreateTagDto): Promise<Tag> {
    const { data } = await api.post('/tags', payload);
    return data;
  },

  async update(id: string, payload: Partial<CreateTagDto>): Promise<Tag> {
    const { data } = await api.patch(`/tags/${id}`, payload);
    return data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/tags/${id}`);
  },
};
