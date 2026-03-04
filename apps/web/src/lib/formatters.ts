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
  };

  const symbol = symbolMap[currency] ?? '$';

  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
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
