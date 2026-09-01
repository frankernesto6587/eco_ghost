import { api } from './api';
import type {
  AnalyticsRecurring,
  AnalyticsSummary,
  AnalyticsTrend,
  TopCategoriesWidget,
} from '@ecoghost/shared';

export interface AnalyticsRangeParams {
  /** 'YYYY-MM-DD' inclusivo, interpretado en la zona de la app */
  from?: string;
  to?: string;
  currency: string;
  /** CSV en el request; el DTO del backend lo parte */
  accountId?: string;
}

/**
 * El ValidationPipe del backend corre con `forbidNonWhitelisted: true`:
 * cualquier query param no declarado devuelve 400. Se limpian las claves
 * vacias porque axios omite `undefined` pero no `null` ni ''.
 */
function clean(params: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) {
      if (v.length === 0) continue;
      out[k] = v.join(',');
      continue;
    }
    out[k] = v;
  }
  return out;
}

export const analyticsService = {
  async getSummary(params: AnalyticsRangeParams & { topLimit?: number }) {
    const { data } = await api.get<AnalyticsSummary>('/analytics/summary', {
      params: clean(params),
    });
    return data;
  },

  async getTopCategories(params: AnalyticsRangeParams & { limit?: number }) {
    const { data } = await api.get<TopCategoriesWidget>('/analytics/top-categories', {
      params: clean(params),
    });
    return data;
  },

  async getTrend(params: { currency: string; months?: number; accountId?: string }) {
    const { data } = await api.get<AnalyticsTrend>('/analytics/trend', {
      params: clean(params),
    });
    return data;
  },

  async getRecurring(params: AnalyticsRangeParams & { minCount?: number }) {
    const { data } = await api.get<AnalyticsRecurring>('/analytics/recurring', {
      params: clean(params),
    });
    return data;
  },
};
