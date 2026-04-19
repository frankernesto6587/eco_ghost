import { create } from 'zustand';

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

interface UIState {
  sidebarCollapsed: boolean;
  themeMode: ThemeMode;
  isDark: boolean;
  isMobile: boolean;
  pageSize: number;
  toggleSidebar: () => void;
  setThemeMode: (mode: ThemeMode) => void;
  setIsMobile: (value: boolean) => void;
  setPageSize: (size: number) => void;
}

const initialMode = loadThemeMode();

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  themeMode: initialMode,
  isDark: resolveIsDark(initialMode),
  isMobile: false,
  pageSize: loadPageSize(),

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
}));

// Listen for system theme changes when mode is 'system'
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  const { themeMode } = useUIStore.getState();
  if (themeMode === 'system') {
    useUIStore.setState({ isDark: getSystemDark() });
  }
});
