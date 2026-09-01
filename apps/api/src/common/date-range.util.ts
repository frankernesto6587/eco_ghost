import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import * as timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Zona horaria de referencia para TODOS los cortes de calendario del backend.
 *
 * Antes convivian dos reglas contradictorias: `getOverview` cortaba los dias con
 * `toISOString().slice(0,10)` (UTC) pero calculaba el rango con `new Date(y, m, 1)`
 * (hora local del servidor). Un gasto a las 21:00 del 31 de agosto en Cuba caia
 * en septiembre. Todo corte de dia/mes pasa ahora por este modulo.
 */
export const APP_TZ = process.env.APP_TZ ?? 'America/Havana';

const DAY = 'YYYY-MM-DD';
const MONTH = 'YYYY-MM';

export interface ResolvedRange {
  /** Instante UTC inclusivo de inicio. */
  from: Date;
  /** Instante UTC EXCLUSIVO de fin (inicio del dia siguiente al ultimo dia). */
  to: Date;
  prevFrom: Date;
  prevTo: Date;
  /** Etiquetas 'YYYY-MM-DD' inclusivas, tal como las ve el usuario. */
  fromLabel: string;
  toLabel: string;
  prevFromLabel: string;
  prevToLabel: string;
  /** Numero de dias del rango (inclusivo). */
  days: number;
  /** true si el rango es exactamente un mes calendario completo. */
  isFullMonth: boolean;
}

/**
 * Convierte fechas de calendario ('YYYY-MM-DD', inclusivas, interpretadas en `tz`)
 * en un intervalo semiabierto [from, to) de instantes UTC.
 *
 * Se usa intervalo semiabierto y no `lte` con fin-de-dia: la precision
 * `timestamp(3)` de Postgres y los saltos de horario hacen fragil el
 * `23:59:59.999`. `gte from AND lt to` es exacto siempre.
 *
 * Periodo anterior: si el rango es un mes calendario completo, el anterior es el
 * mes calendario anterior (agosto -> julio, 31 vs 31 dias). En cualquier otro caso
 * se desplaza el mismo numero de dias hacia atras. Para febrero el desplazamiento
 * ingenuo daria "29 ene - 28 feb", incomprensible para el usuario.
 */
export function resolveRange(from?: string, to?: string, tz: string = APP_TZ): ResolvedRange {
  const now = dayjs().tz(tz);

  const startDay = from ? dayjs.tz(from, tz).startOf('day') : now.startOf('month');
  const endDay = to ? dayjs.tz(to, tz).startOf('day') : now.endOf('month').startOf('day');

  const fromLabel = startDay.format(DAY);
  const toLabel = endDay.format(DAY);
  const days = endDay.diff(startDay, 'day') + 1;

  const isFullMonth =
    startDay.date() === 1 &&
    endDay.isSame(startDay.endOf('month').startOf('day'), 'day');

  let prevStart: dayjs.Dayjs;
  let prevEnd: dayjs.Dayjs;
  if (isFullMonth) {
    prevStart = startDay.subtract(1, 'month').startOf('month');
    prevEnd = prevStart.endOf('month').startOf('day');
  } else {
    prevEnd = startDay.subtract(1, 'day');
    prevStart = prevEnd.subtract(days - 1, 'day');
  }

  return {
    from: startDay.toDate(),
    to: endDay.add(1, 'day').toDate(),
    prevFrom: prevStart.toDate(),
    prevTo: prevEnd.add(1, 'day').toDate(),
    fromLabel,
    toLabel,
    prevFromLabel: prevStart.format(DAY),
    prevToLabel: prevEnd.format(DAY),
    days,
    isFullMonth,
  };
}

/** Convierte 'YYYY-MM' en el intervalo semiabierto [from, to) de ese mes en `tz`. */
export function resolveMonth(month: string, tz: string = APP_TZ): ResolvedRange {
  const start = dayjs.tz(`${month}-01`, tz).startOf('month');
  return resolveRange(start.format(DAY), start.endOf('month').format(DAY), tz);
}

/**
 * Normaliza una entrada de fecha a etiqueta de calendario 'YYYY-MM-DD' en `tz`.
 *
 * Acepta tanto 'YYYY-MM-DD' (ya es una etiqueta) como un instante ISO completo.
 * Esto importa: el frontend manda `dayjs.endOf('day').toISOString()`, que para
 * el 31 de agosto en Cuba es '2026-09-01T03:59:59.999Z'. Recortar los 10 primeros
 * caracteres daria '2026-09-01' y alargaria el rango un dia; interpretarlo en
 * APP_TZ devuelve '2026-08-31', que es lo que el usuario eligio.
 */
export function toDayLabel(input?: string | null, tz: string = APP_TZ): string | undefined {
  if (!input) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  const d = dayjs(input);
  return d.isValid() ? d.tz(tz).format(DAY) : undefined;
}

/** Clave de dia 'YYYY-MM-DD' de un instante, en la zona de la app. */
export function dayKey(date: Date, tz: string = APP_TZ): string {
  return dayjs(date).tz(tz).format(DAY);
}

/** Clave de mes 'YYYY-MM' de un instante, en la zona de la app. */
export function monthKey(date: Date, tz: string = APP_TZ): string {
  return dayjs(date).tz(tz).format(MONTH);
}

/** Mes actual 'YYYY-MM' en la zona de la app. */
export function currentMonth(tz: string = APP_TZ): string {
  return dayjs().tz(tz).format(MONTH);
}

/**
 * Rango de los ultimos `months` meses calendario, terminando en el mes actual.
 * Devuelve tambien la lista ordenada de claves 'YYYY-MM' para rellenar huecos.
 */
export function resolveTrailingMonths(
  months: number,
  tz: string = APP_TZ,
): { from: Date; to: Date; monthKeys: string[] } {
  const end = dayjs().tz(tz).startOf('month');
  const start = end.subtract(months - 1, 'month');
  const monthKeys: string[] = [];
  for (let i = 0; i < months; i++) {
    monthKeys.push(start.add(i, 'month').format(MONTH));
  }
  return {
    from: start.toDate(),
    to: end.add(1, 'month').toDate(),
    monthKeys,
  };
}

/** Avance del mes: fraccion transcurrida (0..1). 1 si el mes ya termino. */
export function monthProgress(month: string, tz: string = APP_TZ): number {
  const start = dayjs.tz(`${month}-01`, tz).startOf('month');
  const total = start.daysInMonth();
  const now = dayjs().tz(tz);
  if (now.isBefore(start)) return 0;
  if (now.isAfter(start.endOf('month'))) return 1;
  return Math.min(1, now.date() / total);
}

/**
 * Etiquetas 'YYYY-MM-DD' consecutivas a partir de `from`, `days` dias.
 *
 * Avanzar el cursor con `setUTCDate(+1)` sobre un instante que es medianoche
 * local NO sirve: el dia en que termina el horario de verano (1 nov 2026 en
 * Cuba) el salto de 24h cae en el mismo dia local, asi que la etiqueta se
 * repite y el rango pierde su ultimo dia. Sumar en la zona lo evita.
 */
export function dayLabels(from: Date, days: number, tz: string = APP_TZ): string[] {
  const start = dayjs(from).tz(tz);
  const out: string[] = [];
  for (let i = 0; i < days; i++) out.push(start.add(i, 'day').format(DAY));
  return out;
}
