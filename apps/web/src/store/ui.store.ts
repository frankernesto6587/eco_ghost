import { create } from 'zustand';
import type { AnalyticsPreset } from '@/lib/dateRanges';

type ThemeMode = 'light' | 'dark' | 'system';

function getSystemDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function loadThemeMode(): ThemeMode {
  try {
    const stored = localStorage.getItem('ecoghost_theme');
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // ignore
  }
  return 'light';
}

function resolveIsDark(mode: ThemeMode): boolean {
  if (mode === 'system') return getSystemDark();
  return mode === 'dark';
}

function loadPageSize(): number {
  try {
    const stored = localStorage.getItem('ecoghost_page_size');
    if (stored) {
      const n = parseInt(stored, 10);
      if ([15, 20, 25].includes(n)) return n;
    }
  } catch {}
  return 15;
}

export interface StoredFilters {
  types: string[];
  accountIds: string[];
  categoryIds: string[];
  /** Solo transacciones sin categoria. Excluyente con categoryIds. */
  uncategorized: boolean;
  currency: string | undefined;
  dateFrom: string | null;
  dateTo: string | null;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

const FILTERS_KEY = 'ecoghost_tx_filters';

const defaultFilters: StoredFilters = {
  types: [],
  accountIds: [],
  categoryIds: [],
  uncategorized: false,
  currency: undefined,
  dateFrom: null,
  dateTo: null,
  sortBy: 'createdAt',
  sortOrder: 'desc',
};

function loadFilters(): StoredFilters {
  try {
    const stored = localStorage.getItem(FILTERS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...defaultFilters, ...parsed };
    }
  } catch {}
  return { ...defaultFilters };
}

function saveFilters(filters: StoredFilters) {
  localStorage.setItem(FILTERS_KEY, JSON.stringify(filters));
}

/**
 * Filtros de la pagina Analisis.
 *
 * Se persiste el PRESET, no las fechas resueltas: guardar
 * "2026-08-01/2026-08-31" haria que "este mes" siguiera mostrando agosto al
 * volver en septiembre. Solo `custom` guarda fechas.
 */
export interface AnalyticsFilters {
  preset: AnalyticsPreset;
  dateFrom: string | null;
  dateTo: string | null;
  /** null = aun sin resolver; la pagina la fija a la baseCurrency de la org */
  currency: string | null;
  accountIds: string[];
  trendMonths: 6 | 12 | 24;
}

const ANALYTICS_KEY = 'ecoghost_analytics_filters';

const defaultAnalyticsFilters: AnalyticsFilters = {
  preset: 'thisMonth',
  dateFrom: null,
  dateTo: null,
  currency: null,
  accountIds: [],
  trendMonths: 12,
};

function loadAnalyticsFilters(): AnalyticsFilters {
  try {
    const stored = localStorage.getItem(ANALYTICS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...defaultAnalyticsFilters, ...parsed };
    }
  } catch {
    // ignore
  }
  return { ...defaultAnalyticsFilters };
}

function saveAnalyticsFilters(filters: AnalyticsFilters) {
  try {
    localStorage.setItem(ANALYTICS_KEY, JSON.stringify(filters));
  } catch {
    // ignore
  }
}

interface UIState {
  sidebarCollapsed: boolean;
  themeMode: ThemeMode;
  isDark: boolean;
  isMobile: boolean;
  pageSize: number;
  txFilters: StoredFilters;
  analyticsFilters: AnalyticsFilters;
  toggleSidebar: () => void;
  setThemeMode: (mode: ThemeMode) => void;
  setIsMobile: (value: boolean) => void;
  setPageSize: (size: number) => void;
  setTxFilters: (filters: Partial<StoredFilters>) => void;
  clearTxFilters: () => void;
  setAnalyticsFilters: (filters: Partial<AnalyticsFilters>) => void;
}

const initialMode = loadThemeMode();

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  themeMode: initialMode,
  isDark: resolveIsDark(initialMode),
  isMobile: false,
  pageSize: loadPageSize(),
  txFilters: loadFilters(),
  analyticsFilters: loadAnalyticsFilters(),

  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  setThemeMode: (mode) => {
    localStorage.setItem('ecoghost_theme', mode);
    set({ themeMode: mode, isDark: resolveIsDark(mode) });
  },

  setIsMobile: (value) => set({ isMobile: value }),

  setPageSize: (size) => {
    localStorage.setItem('ecoghost_page_size', String(size));
    set({ pageSize: size });
  },

  setTxFilters: (partial) => {
    set((state) => {
      const updated = { ...state.txFilters, ...partial };
      saveFilters(updated);
      return { txFilters: updated };
    });
  },

  clearTxFilters: () => {
    const cleared = { ...defaultFilters };
    saveFilters(cleared);
    set({ txFilters: cleared });
  },

  setAnalyticsFilters: (partial) => {
    set((state) => {
      const updated = { ...state.analyticsFilters, ...partial };
      saveAnalyticsFilters(updated);
      return { analyticsFilters: updated };
    });
  },
}));

// Listen for system theme changes when mode is 'system'
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  const { themeMode } = useUIStore.getState();
  if (themeMode === 'system') {
    useUIStore.setState({ isDark: getSystemDark() });
  }
});
