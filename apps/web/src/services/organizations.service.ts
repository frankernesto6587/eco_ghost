import { api } from './api';

export interface CreateOrganizationDto {
  name: string;
  baseCurrency: string;
}

export const organizationsService = {
  async getAll() {
    const { data } = await api.get('/organizations');
    return data;
  },

  async create(payload: CreateOrganizationDto) {
    const { data } = await api.post('/organizations', payload);
    return data;
  },

  async update(id: string, payload: Partial<CreateOrganizationDto>) {
    const { data } = await api.patch(`/organizations/${id}`, payload);
    return data;
  },

  async getOne(id: string) {
    const { data } = await api.get(`/organizations/${id}`);
    return data;
  },

  async getMembers(id: string) {
    const { data } = await api.get(`/organizations/${id}/members`);
    return data;
  },

  async join(token: string) {
    const { data } = await api.post('/organizations/join', { token });
    return data;
  },

  async regenerateToken(orgId: string, expelMemberIds?: string[]) {
    const { data } = await api.post(`/organizations/${orgId}/regenerate-token`, { expelMemberIds });
    return data;
  },

  async updateMemberRole(orgId: string, memberId: string, payload: { role: string }) {
    const { data } = await api.patch(`/organizations/${orgId}/members/${memberId}`, payload);
    return data;
  },

  async removeMember(orgId: string, memberId: string) {
    await api.delete(`/organizations/${orgId}/members/${memberId}`);
  },

  async disconnectTelegram(orgId: string) {
    const { data } = await api.post(`/organizations/${orgId}/disconnect-telegram`);
    return data;
  },
};

export const telegramService = {
  async getWebhookInfo() {
    const { data } = await api.get('/telegram/webhook-info');
    return data as { url: string };
  },

  async setWebhook(url: string) {
    const { data } = await api.post('/telegram/set-webhook', { url });
    return data as { ok: boolean; url: string };
  },
};
