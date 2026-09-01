import { useMemo } from 'react';
import { useSyncExternalStore } from 'react';
import {
  EcoChartTokens,
  MONO_FONT,
  getEcoChartTokens,
  subscribeEcoChartTokens,
} from '@/lib/chartTheme';

export interface EcoChartTheme {
  tokens: EcoChartTokens;
  /** Props comunes que se esparcen sobre cualquier grafico de @ant-design/charts */
  base: Record<string, unknown>;
}

/**
 * Tema Ember para los graficos, reactivo al cambio de light/dark.
 *
 * Usa useSyncExternalStore en lugar de useEffect a proposito: ver la nota de
 * orden de efectos en lib/chartTheme.ts.
 */
export function useEcoChartTheme(): EcoChartTheme {
  const tokens = useSyncExternalStore(
    subscribeEcoChartTokens,
    getEcoChartTokens,
    getEcoChartTokens,
  );

  return useMemo(
    () => ({
      tokens,
      base: {
        theme: tokens.isDark ? 'classicDark' : 'classic',
        autoFit: true,
        // El card ya pinta el fondo; el grafico debe ser transparente encima.
        viewStyle: { viewFill: 'transparent', plotFill: 'transparent' },
        axis: {
          x: {
            line: false,
            tick: false,
            labelFill: tokens.fg4,
            labelFontSize: 10,
            labelFontFamily: MONO_FONT,
            grid: false,
          },
          y: {
            line: false,
            tick: false,
            labelFill: tokens.fg4,
            labelFontSize: 10,
            labelFontFamily: MONO_FONT,
            grid: true,
            gridStroke: tokens.lineSoft,
            gridLineDash: [3, 3],
            gridStrokeOpacity: 0.6,
          },
        },
        legend: {
          color: {
            itemLabelFill: tokens.fg3,
            itemLabelFontSize: 11,
            itemLabelFontFamily: MONO_FONT,
            itemMarkerSize: 8,
          },
        },
        tooltip: {
          css: {
            '.g2-tooltip': {
              background: tokens.surface,
              border: `1px solid ${tokens.line}`,
              'border-radius': '10px',
              color: tokens.fg,
              'box-shadow': '0 8px 20px rgba(0,0,0,0.28)',
              'font-family': MONO_FONT,
              'font-size': '12px',
            },
            '.g2-tooltip-title': { color: tokens.fg3, 'font-size': '10px', 'letter-spacing': '0.08em' },
            '.g2-tooltip-list-item-value': { color: tokens.fg, 'font-variant-numeric': 'tabular-nums' },
          },
        },
      },
    }),
    [tokens],
  );
}
