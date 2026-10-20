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
  totals: {
    atCost: number | null;
    atToday: number | null;
    unrealized: number | null;
    unrealizedExchange: number | null;
    unrealizedHolding: number | null;
  };
}

export interface RateDay {
  day: string;
  eltoque: Record<string, number>;
  manual: Record<string, number>;
}

/** La tasa que rige un dia por moneda: la de ese dia o, si falta, la ultima anterior. */
export interface RateSuggestion {
  day: string;
  rates: Record<string, { value: number; day: string; source: 'MANUAL' | 'ELTOQUE' }>;
}

/** De donde sale el valor de un movimiento (centavos de la moneda de estadisticas). */
export interface Breakdown {
  id: string;
  /** Coste FIFO */
  reportAmount: number | null;
  /** A la tasa de mercado de su dia */
  marketAmount: number | null;
  status: 'EXACT' | 'ESTIMATE' | 'MISSING_RATE' | null;
  /** Diferencia de cambio (a favor > 0) = fxExchange + fxHolding */
  fxResult: number | null;
  fxExchange: number | null;
  fxHolding: number | null;
  parts: {
    kind: 'LOT' | 'DEFICIT' | 'DEFICIT_SETTLED';
    currency: string;
    qty: number;
    cost: number | null;
    market: number | null;
    lot: { origin: string; day: string; description: string | null; rate: number | null; marketRate: number | null } | null;
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
  async suggest(day: string): Promise<RateSuggestion> {
    const { data } = await api.get('/rates/suggest', { params: { day } });
    return data;
  },
  /** Volver a pedir a elTOQUE un dia; `unavailable` si no respondio. */
  async fetchRate(day: string): Promise<{ found: number; unavailable: boolean; rows: RateDay[] }> {
    const { data } = await api.post(`/rates/${day}/fetch`);
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
