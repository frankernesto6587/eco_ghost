/**
 * El historial de un movimiento tal como se lee: quien lo hizo y que cambio,
 * con nombres de cuentas y categorias en vez de ids. Sale del registro de
 * auditoria (las fotos de antes y despues que guarda cada edicion).
 */

/** Lo que se muestra de un cambio. Los importes van en centavos y las fechas en ISO. */
export const HISTORY_FIELDS = ['date', 'description', 'amount', 'type', 'account', 'category', 'notes', 'toAccount', 'toAmount'] as const;
export type HistoryField = (typeof HISTORY_FIELDS)[number];

/** De que campo de la foto (`snapshot()`) sale cada uno. */
const SOURCE: Record<HistoryField, string> = {
  date: 'date',
  description: 'description',
  amount: 'amount',
  type: 'type',
  account: 'accountId',
  category: 'categoryId',
  notes: 'notes',
  toAccount: 'toAccountId',
  toAmount: 'toAmount',
};

export interface HistoryChange {
  field: HistoryField;
  before: string | number | null;
  after: string | number | null;
  /** En los importes: la moneda de la cuenta con que quedo. */
  currency?: string;
}

export interface HistoryEntry {
  /** CREATE, UPDATE, APPROVE, REJECT, RESUBMIT, EDIT_PENDING, WITHDRAW, DELETE, RESTORE, BULK_UPDATE... */
  action: string;
  at: Date;
  user: { id: string; name: string } | null;
  /** Solo en CREATE: por donde entro (p. ej. "telegram"). */
  source?: string | null;
  /** Motivo de un rechazo o de un borrado. */
  reason?: string | null;
  changes: HistoryChange[];
}

export interface HistoryNames {
  accounts: Map<string, { name: string; currency: string }>;
  categories: Map<string, string>;
}

type Snap = Record<string, unknown>;

const norm = (v: unknown): string | number | null => {
  if (v === undefined || v === null) return null;
  if (v instanceof Date) return v.toISOString();
  return typeof v === 'number' ? v : String(v);
};

/**
 * Lo que cambio entre dos fotos. Sin foto de antes (cambio en lote, que solo
 * guarda lo nuevo) sale cada campo que trae la de despues.
 */
export function describeChanges(before: Snap | undefined, after: Snap | undefined, names: HistoryNames): HistoryChange[] {
  if (!after) return [];
  const name = (field: HistoryField, v: string | number | null) => {
    if (v === null) return null;
    if (field === 'account' || field === 'toAccount') return names.accounts.get(String(v))?.name ?? null;
    if (field === 'category') return names.categories.get(String(v)) ?? null;
    return v;
  };
  const changes: HistoryChange[] = [];
  for (const field of HISTORY_FIELDS) {
    const key = SOURCE[field];
    if (!(key in after)) continue;
    const b = before ? norm(before[key]) : null;
    const a = norm(after[key]);
    if (before && b === a) continue;
    const currencyOf = field === 'amount' ? after.accountId : field === 'toAmount' ? after.toAccountId : undefined;
    const currency = currencyOf ? names.accounts.get(String(currencyOf))?.currency : undefined;
    changes.push({ field, before: name(field, b), after: name(field, a), ...(currency && { currency }) });
  }
  return changes;
}

/** Ids de cuentas y categorias que salen en unas fotos, para traer sus nombres de una vez. */
export function referencedIds(snaps: (Snap | undefined)[]) {
  const accounts = new Set<string>();
  const categories = new Set<string>();
  for (const s of snaps) {
    if (!s) continue;
    for (const k of ['accountId', 'toAccountId']) if (typeof s[k] === 'string') accounts.add(s[k] as string);
    if (typeof s.categoryId === 'string') categories.add(s.categoryId);
  }
  return { accounts: [...accounts], categories: [...categories] };
}

/** Las fotos que guarda un registro: {before, after} al editar, o solo lo nuevo en un cambio en lote. */
export function snapsOf(action: string, changes: unknown): { before?: Snap; after?: Snap } {
  if (!changes || typeof changes !== 'object') return {};
  const c = changes as Snap;
  if ('after' in c) return { before: c.before as Snap | undefined, after: c.after as Snap };
  return action === 'BULK_UPDATE' ? { after: c } : {};
}
