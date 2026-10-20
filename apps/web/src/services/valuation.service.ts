import { api } from './api';

export interface ValuationStatus {
  enabled: boolean;
  reportCurrency: string;
  closedThrough: string | null;
  valuedAt: string | null;
  /** Dias y monedas sin tasa que la valoracion necesita (el admin tiene que ponerlas) */
  missingRates: { day: string; currency: string }[];
  openDeficits: Record<string, { qty: number; estMicros: string | null }>;
  mismatch: Record<string, number>;
  counts: { estimates: number; missingRate: number };
}

export interface PatrimonyRow {
  currency: string;
  qty: number;
  atCost: number | null;
  atToday: number | null;
  todayRate: number | null;
  estimated: boolean;
}

export interface Patrimony {
  reportCurrency: string;
  currencies: PatrimonyRow[];
  totals: { atCost: number | null; atToday: number | null; unrealized: number | null };
}

export interface RateDay {
  day: string;
  eltoque: Record<string, number>;
  manual: Record<string, number>;
}

export interface Breakdown {
  id: string;
  reportAmount: number | null;
  status: 'EXACT' | 'ESTIMATE' | 'MISSING_RATE' | null;
  fxResult: number | null;
  parts: {
    kind: 'LOT' | 'DEFICIT' | 'DEFICIT_SETTLED';
    currency: string;
    qty: number;
    cost: number | null;
    lot: { origin: string; day: string; description: string | null; rate: number | null } | null;
  }[];
}

export const valuationService = {
  async status(): Promise<ValuationStatus> {
    const { data } = await api.get('/valuation/status');
    return data;
  },
  async patrimony(): Promise<Patrimony> {
    const { data } = await api.get('/valuation/patrimony');
    return data;
  },
  async breakdown(id: string): Promise<Breakdown> {
    const { data } = await api.get(`/valuation/transactions/${id}`);
    return data;
  },
  async settings(payload: { enabled?: boolean; reportCurrency?: string }) {
    const { data } = await api.patch('/valuation/settings', payload);
    return data as { valuationEnabled: boolean; reportCurrency: string };
  },
  async closeMonth(month: string): Promise<{ closedThrough: string | null }> {
    const { data } = await api.post(`/valuation/months/${month}/close`);
    return data;
  },
  async reopenMonth(month: string): Promise<{ closedThrough: string | null }> {
    const { data } = await api.post(`/valuation/months/${month}/reopen`);
    return data;
  },
  async rates(from: string, to: string): Promise<RateDay[]> {
    const { data } = await api.get('/rates', { params: { from, to } });
    return data;
  },
  async setRates(day: string, rates: Record<string, number>): Promise<RateDay[]> {
    const { data } = await api.put(`/rates/${day}`, { rates });
    return data;
  },
  async deleteRate(day: string, currency: string): Promise<RateDay[]> {
    const { data } = await api.delete(`/rates/${day}/${currency}`);
    return data;
  },
};
