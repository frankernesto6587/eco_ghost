import dayjs from 'dayjs';

export type AnalyticsPreset = 'thisMonth' | 'lastMonth' | 'last3Months' | 'thisYear' | 'custom';

export interface ResolvedAnalyticsRange {
  /** 'YYYY-MM-DD' inclusivo */
  from: string;
  to: string;
}

export const PRESET_ORDER: Exclude<AnalyticsPreset, 'custom'>[] = [
  'thisMonth',
  'lastMonth',
  'last3Months',
  'thisYear',
];

const DAY = 'YYYY-MM-DD';

/**
 * Resuelve un preset a fechas de calendario.
 *
 * Es una funcion pura y se llama en cada render a proposito: lo que se persiste
 * es el PRESET, no las fechas. Si se guardaran las fechas, "este mes" seguiria
 * mostrando agosto al abrir la app en septiembre.
 */
export function resolveAnalyticsRange(
  preset: AnalyticsPreset,
  dateFrom?: string | null,
  dateTo?: string | null,
): ResolvedAnalyticsRange {
  const now = dayjs();
  switch (preset) {
    case 'lastMonth': {
      const m = now.subtract(1, 'month');
      return { from: m.startOf('month').format(DAY), to: m.endOf('month').format(DAY) };
    }
    case 'last3Months':
      return {
        from: now.subtract(2, 'month').startOf('month').format(DAY),
        to: now.endOf('month').format(DAY),
      };
    case 'thisYear':
      return { from: now.startOf('year').format(DAY), to: now.endOf('year').format(DAY) };
    case 'custom':
      if (dateFrom && dateTo) return { from: dateFrom, to: dateTo };
      // Sin fechas guardadas, "custom" no significa nada: cae a este mes.
      return { from: now.startOf('month').format(DAY), to: now.endOf('month').format(DAY) };
    case 'thisMonth':
    default:
      return { from: now.startOf('month').format(DAY), to: now.endOf('month').format(DAY) };
  }
}

/** Mes 'YYYY-MM' que contiene el final del rango — el que usan los presupuestos. */
export function monthOfRange(range: ResolvedAnalyticsRange): string {
  return dayjs(range.to).format('YYYY-MM');
}
