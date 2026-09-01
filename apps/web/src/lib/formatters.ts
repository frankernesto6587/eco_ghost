import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/es';

dayjs.extend(relativeTime);
dayjs.locale('es');

/**
 * Format integer cents to display string.
 * Example: formatCurrency(150000, 'USD') -> "$1,500.00"
 */
export function formatCurrency(amount: number, currency: string): string {
  const value = amount / 100;

  const symbolMap: Record<string, string> = {
    USD: '$',
    EUR: '\u20AC',
    MN: '$',
    MLC: '$',
    USDT: '\u20AE',
  };

  const symbol = symbolMap[currency] ?? '$';

  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(value));

  const sign = value < 0 ? '-' : '';

  return `${sign}${symbol}${formatted}`;
}

/**
 * Format ISO date to locale display string.
 */
export function formatDate(date: string): string {
  return dayjs(date).format('DD/MM/YYYY');
}

/**
 * Format ISO date to relative string (e.g., "hace 2 dias").
 */
export function formatRelativeDate(date: string): string {
  return dayjs(date).fromNow();
}

/**
 * Formato compacto para ejes y espacios estrechos: 1.2k, 3.4M.
 * Recibe centavos, igual que formatCurrency.
 */
export function formatCompact(amount: number, currency?: string): string {
  const value = Math.abs(amount) / 100;
  const sign = amount < 0 ? '-' : '';
  let body: string;
  if (value >= 1_000_000) body = `${trimZero(value / 1_000_000)}M`;
  else if (value >= 1_000) body = `${trimZero(value / 1_000)}k`;
  else body = String(Math.round(value));
  return currency ? `${sign}${body} ${currency}` : `${sign}${body}`;
}

function trimZero(n: number): string {
  const s = n.toFixed(1);
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

/**
 * Importe con signo explicito, para deltas.
 * Example: formatSignedCurrency(1500, 'MN') -> "+$15 MN"
 */
export function formatSignedCurrency(amount: number, currency: string): string {
  const sign = amount > 0 ? '+' : '';
  return `${sign}${formatCurrency(amount, currency)}`;
}

/**
 * Porcentaje con un decimal y signo. `null` (base cero) se muestra como guion.
 */
export function formatPercent(value: number | null, withSign = true): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const sign = withSign && value > 0 ? '+' : '';
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 0 : 1;
  return `${sign}${value.toFixed(digits)}%`;
}

/** Cuota 0..1 como porcentaje entero: 0.384 -> "38%" */
export function formatShare(share: number): string {
  return `${Math.round(share * 100)}%`;
}

/** 'YYYY-MM' -> 'ago 26' (etiqueta corta de eje) */
export function formatMonthLabel(month: string): string {
  return dayjs(`${month}-01`).format('MMM YY');
}

/** 'YYYY-MM' -> 'agosto 2026' */
export function formatMonthLong(month: string): string {
  return dayjs(`${month}-01`).format('MMMM YYYY');
}

/**
 * Rango legible a partir de dos etiquetas 'YYYY-MM-DD'.
 * Omite el mes repetido: "1 - 31 ago" en vez de "1 ago - 31 ago".
 */
export function formatRangeLabel(from: string, to: string): string {
  const a = dayjs(from);
  const b = dayjs(to);
  if (a.isSame(b, 'day')) return a.format('D MMM');
  if (a.isSame(b, 'month')) return `${a.format('D')} - ${b.format('D MMM')}`;
  if (a.isSame(b, 'year')) return `${a.format('D MMM')} - ${b.format('D MMM')}`;
  return `${a.format('D MMM YY')} - ${b.format('D MMM YY')}`;
}
