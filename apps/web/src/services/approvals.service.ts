import type { ApprovalCounts, ApprovalItem } from '@ecoghost/shared';
import { api } from './api';

/** Correcciones: mismo formato que editar un movimiento. Importes en centavos. */
export interface ApprovalEdits {
  date?: string;
  description?: string;
  amount?: number;
  accountId?: string;
  categoryId?: string | null;
  notes?: string;
  toAccountId?: string;
  toAmount?: number;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
  metadata: { transactionId?: string } | null;
}

export const approvalsService = {
  async list(scope: 'review' | 'mine', status?: string[]): Promise<{ data: ApprovalItem[]; counts: ApprovalCounts }> {
    const { data } = await api.get('/approvals', { params: { scope, ...(status?.length && { status: status.join(',') }) } });
    return data;
  },

  async counts(): Promise<ApprovalCounts> {
    const { data } = await api.get('/approvals/counts');
    return data;
  },

  async approve(id: string, edits?: ApprovalEdits): Promise<ApprovalItem> {
    const { data } = await api.post(`/approvals/${id}/approve`, edits ? { edits } : {});
    return data;
  },

  async reject(id: string, reason: string): Promise<ApprovalItem> {
    const { data } = await api.post(`/approvals/${id}/reject`, { reason });
    return data;
  },

  /** El autor corrige lo suyo pendiente o rechazado (un rechazado se reenvia). */
  async edit(id: string, edits: ApprovalEdits): Promise<ApprovalItem> {
    const { data } = await api.patch(`/approvals/${id}`, edits);
    return data;
  },

  async resubmit(id: string): Promise<ApprovalItem> {
    const { data } = await api.post(`/approvals/${id}/resubmit`);
    return data;
  },

  async withdraw(id: string): Promise<void> {
    await api.post(`/approvals/${id}/withdraw`);
  },

  async notifications(): Promise<AppNotification[]> {
    const { data } = await api.get('/notifications');
    return data;
  },

  async markRead(ids?: string[]): Promise<void> {
    await api.post('/notifications/read', ids ? { ids } : {});
  },
};
