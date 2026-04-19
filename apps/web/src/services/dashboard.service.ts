import { api } from './api';
import type { DashboardOverview } from '@ecoghost/shared';

export interface DashboardParams {
  from?: string;
  to?: string;
}

export const dashboardService = {
  async getOverview(params?: DashboardParams) {
    const { data } = await api.get<DashboardOverview>('/dashboard/overview', { params });
    return data;
  },
};
