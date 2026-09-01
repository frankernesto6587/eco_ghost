import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DualAxes } from '@ant-design/charts';
import type { AnalyticsTrend } from '@ecoghost/shared';
import { formatCompact, formatCurrency, formatMonthLabel } from '@/lib/formatters';
import { useEcoChartTheme } from '@/hooks/useEcoChartTheme';

interface Props {
  trend: AnalyticsTrend;
  currency: string;
}

/**
 * Barras agrupadas ingreso/gasto + linea de neto.
 *
 * Aqui la libreria si aporta: escalas, dos ejes, tooltip compartido por mes e
 * interaccion temporal son mucho trabajo a mano.
 */
export function MonthlyTrendChart({ trend, currency }: Props) {
  const { t } = useTranslation();
  const { tokens, base } = useEcoChartTheme();

  const { bars, line } = useMemo(() => {
    const bars = trend.points.flatMap((p) => [
      { month: p.month, value: p.income, kind: t('analytics.income') },
      { month: p.month, value: p.expense, kind: t('analytics.expenses') },
    ]);
    const line = trend.points.map((p) => ({ month: p.month, net: p.net }));
    return { bars, line };
  }, [trend, t]);

  const money = (v: number) => `${formatCurrency(v, currency)} ${currency}`;

  return (
    <DualAxes
      {...base}
      height={260}
      xField="month"
      legend={{ color: { itemLabelFill: tokens.fg3, itemLabelFontSize: 11 } }}
      scale={{ x: { labelFormatter: formatMonthLabel } }}
      axis={{
        x: {
          ...(base.axis as Record<string, any>).x,
          labelFormatter: formatMonthLabel,
        },
        y: {
          ...(base.axis as Record<string, any>).y,
          labelFormatter: (v: number) => formatCompact(v),
        },
      }}
      children={[
        {
          type: 'interval',
          data: bars,
          yField: 'value',
          colorField: 'kind',
          group: true,
          scale: { color: { range: [tokens.pos, tokens.neg] } },
          tooltip: { items: [{ channel: 'y', valueFormatter: money }] },
        },
        {
          type: 'line',
          data: line,
          yField: 'net',
          style: { lineWidth: 2, stroke: tokens.accent },
          axis: { y: { position: 'right', labelFormatter: (v: number) => formatCompact(v) } },
          tooltip: { items: [{ channel: 'y', name: t('analytics.net'), valueFormatter: money }] },
        },
      ]}
    />
  );
}
