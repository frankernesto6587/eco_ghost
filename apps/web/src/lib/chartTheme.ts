/**
 * Puente entre los tokens del tema (CSS) y G2/@ant-design/charts.
 *
 * Dos problemas que resuelve este modulo:
 *
 * 1. G2 dibuja sobre canvas y parsea los colores con @antv/g, que NO entiende
 *    `oklch()`. Pasarle `var(--eco-accent)` o la cadena oklch cruda pinta negro
 *    o nada. Canvas2D es el unico conversor oklch->sRGB sin dependencias que
 *    hay en el navegador: asignar a `fillStyle` normaliza cualquier color de
 *    CSS Color 4 a '#rrggbb' o 'rgba(...)'.
 *
 * 2. El tema se cambia poniendo `data-theme` en <html> desde un efecto del
 *    componente RAIZ (App.tsx). En React los efectos de los hijos corren ANTES
 *    que los del padre, asi que un `useEffect([isDark])` dentro de un grafico
 *    leeria las variables del tema ANTERIOR. Por eso se observa el atributo con
 *    MutationObserver: es independiente del orden de los efectos.
 *
 * La suscripcion es unica a nivel de modulo para que N graficos en pantalla no
 * instalen N observers.
 */

export interface EcoChartTokens {
  isDark: boolean;
  bg: string;
  surface: string;
  surface2: string;
  surface3: string;
  line: string;
  lineSoft: string;
  fg: string;
  fg2: string;
  fg3: string;
  fg4: string;
  accent: string;
  pos: string;
  neg: string;
  fx: string;
  /** Rampa categorica --eco-cat-1..8 ya resuelta a hex */
  categorical: string[];
}

export const MONO_FONT = "'Geist Mono', ui-monospace, monospace";

/**
 * Resuelve una variable CSS a un color que G2 sepa pintar.
 * Devuelve `fallback` si la variable no existe o el navegador la rechaza.
 */
export function resolveCssColor(varName: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  if (!raw) return fallback;

  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return fallback;

  // Sembrar con negro: si el navegador rechaza `raw`, fillStyle no cambia y
  // detectamos el fallo comparando.
  ctx.fillStyle = '#000000';
  ctx.fillStyle = raw;
  const out = ctx.fillStyle as string;
  return out === '#000000' && raw !== '#000000' ? fallback : out;
}

// Fallbacks: equivalentes sRGB de los tokens oklch del tema oscuro. Solo se usan
// si getComputedStyle falla (SSR, captura de miniatura, canvas bloqueado).
const FALLBACK = {
  bg: '#21222c',
  surface: '#282a36',
  surface2: '#343746',
  surface3: '#424450',
  line: '#44475a',
  lineSoft: '#353747',
  fg: '#f8f8f2',
  fg2: '#cfcfde',
  fg3: '#9aa3cc',
  fg4: '#6272a4',
  accent: '#bd93f9',
  pos: '#50fa7b',
  neg: '#ff5555',
  fx: '#8be9fd',
  cat: ['#bd93f9', '#8be9fd', '#ffb86c', '#ff79c6', '#50fa7b', '#f1fa8c', '#ff5555', '#6272a4'],
};

function readTokens(): EcoChartTokens {
  const root = typeof document !== 'undefined' ? document.documentElement : null;
  const attr = root?.getAttribute('data-theme');
  const isDark =
    attr === 'dark' ||
    (attr !== 'light' &&
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: dark)').matches) ||
    false;

  return {
    isDark,
    bg: resolveCssColor('--eco-bg', FALLBACK.bg),
    surface: resolveCssColor('--eco-surface', FALLBACK.surface),
    surface2: resolveCssColor('--eco-surface2', FALLBACK.surface2),
    surface3: resolveCssColor('--eco-surface3', FALLBACK.surface3),
    line: resolveCssColor('--eco-line', FALLBACK.line),
    lineSoft: resolveCssColor('--eco-line-soft', FALLBACK.lineSoft),
    fg: resolveCssColor('--eco-fg', FALLBACK.fg),
    fg2: resolveCssColor('--eco-fg2', FALLBACK.fg2),
    fg3: resolveCssColor('--eco-fg3', FALLBACK.fg3),
    fg4: resolveCssColor('--eco-fg4', FALLBACK.fg4),
    accent: resolveCssColor('--eco-accent', FALLBACK.accent),
    pos: resolveCssColor('--eco-pos', FALLBACK.pos),
    neg: resolveCssColor('--eco-neg', FALLBACK.neg),
    fx: resolveCssColor('--eco-fx', FALLBACK.fx),
    categorical: FALLBACK.cat.map((fb, i) => resolveCssColor(`--eco-cat-${i + 1}`, fb)),
  };
}

let cached: EcoChartTokens | null = null;
const listeners = new Set<() => void>();
let observing = false;

function invalidate() {
  cached = null;
  listeners.forEach((l) => l());
}

function ensureObserver() {
  if (observing || typeof document === 'undefined') return;
  observing = true;

  new MutationObserver(invalidate).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });

  // El modo "sistema" no toca data-theme: hay que escuchar el cambio del SO.
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', invalidate);
}

export function getEcoChartTokens(): EcoChartTokens {
  ensureObserver();
  if (!cached) cached = readTokens();
  return cached;
}

export function subscribeEcoChartTokens(fn: () => void): () => void {
  ensureObserver();
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Color de una categoria: el suyo propio si lo tiene (el usuario lo edita en
 * Categorias y la coherencia con esa pantalla importa), si no la rampa del tema.
 */
export function categoryColor(
  own: string | null | undefined,
  index: number,
  tokens: EcoChartTokens,
): string {
  if (own) return own;
  return tokens.categorical[index % tokens.categorical.length];
}
