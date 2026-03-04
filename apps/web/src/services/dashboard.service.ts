import { api } from './api';
import type { DashboardOverview } from '@ecoghost/shared';

export const dashboardService = {
  async getOverview() {
    const { data } = await api.get<DashboardOverview>('/dashboard/overview');
    return data;
  },
};
