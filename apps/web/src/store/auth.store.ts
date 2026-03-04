import { create } from 'zustand';
import type { UserProfile, AuthTokens, OrganizationSummary } from '@ecoghost/shared';

interface AuthState {
  user: UserProfile | null;
  tokens: AuthTokens | null;
  currentOrg: OrganizationSummary | null;
  organizations: OrganizationSummary[];

  setAuth: (
    user: UserProfile,
    tokens: AuthTokens,
    organizations: OrganizationSummary[],
  ) => void;
  setTokens: (tokens: AuthTokens) => void;
  setCurrentOrg: (org: OrganizationSummary) => void;
  logout: () => void;
}

function loadPersistedState(): Pick<AuthState, 'tokens' | 'currentOrg'> {
  try {
    const tokens = localStorage.getItem('ecoghost_tokens');
    const currentOrg = localStorage.getItem('ecoghost_current_org');
    return {
      tokens: tokens ? JSON.parse(tokens) : null,
      currentOrg: currentOrg ? JSON.parse(currentOrg) : null,
    };
  } catch {
    return { tokens: null, currentOrg: null };
  }
}

function persistTokens(tokens: AuthTokens | null): void {
  if (tokens) {
    localStorage.setItem('ecoghost_tokens', JSON.stringify(tokens));
  } else {
    localStorage.removeItem('ecoghost_tokens');
  }
}

function persistCurrentOrg(org: OrganizationSummary | null): void {
  if (org) {
    localStorage.setItem('ecoghost_current_org', JSON.stringify(org));
  } else {
    localStorage.removeItem('ecoghost_current_org');
  }
}

const persisted = loadPersistedState();

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  tokens: persisted.tokens,
  currentOrg: persisted.currentOrg,
  organizations: [],

  setAuth: (user, tokens, organizations) => {
    persistTokens(tokens);
    // Preserve previously selected org if it still exists in the list
    const persisted = loadPersistedState().currentOrg;
    const match = persisted
      ? organizations.find((o) => o.id === persisted.id) ?? null
      : null;
    const currentOrg = match ?? organizations[0] ?? null;
    persistCurrentOrg(currentOrg);
    set({ user, tokens, organizations, currentOrg });
  },

  setTokens: (tokens) => {
    persistTokens(tokens);
    set({ tokens });
  },

  setCurrentOrg: (org) => {
    persistCurrentOrg(org);
    set({ currentOrg: org });
  },

  logout: () => {
    persistTokens(null);
    // Keep currentOrg in localStorage so it's restored on next login
    set({
      user: null,
      tokens: null,
      currentOrg: null,
      organizations: [],
    });
  },
}));
