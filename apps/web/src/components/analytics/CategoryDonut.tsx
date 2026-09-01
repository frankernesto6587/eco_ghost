import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pie } from '@ant-design/charts';
import type { CategoryRollupNode } from '@ecoghost/shared';
import { formatCurrency, formatShare } from '@/lib/formatters';
import { categoryColor } from '@/lib/chartTheme';
import { useEcoChartTheme } from '@/hooks/useEcoChartTheme';

interface Props {
  nodes: CategoryRollupNode[];
  currency: string;
  total: number;
}

const VISIBLE = 6;

/** Composicion del gasto. El detalle esta en el ranking; esto da la proporcion. */
export function CategoryDonut({ nodes, currency, total }: Props) {
  const { t } = useTranslation();
  const { tokens, base } = useEcoChartTheme();

  const { data, palette } = useMemo(() => {
    const top = nodes.slice(0, VISIBLE);
    const rest = nodes.slice(VISIBLE);
    const items = top.map((n, i) => ({
      name: n.categoryId === null ? t('analytics.uncategorized') : n.name,
      amount: n.amount,
      color: n.categoryId === null ? tokens.fg4 : categoryColor(n.color, i, tokens),
    }));

    if (rest.length > 0) {
      items.push({
        name: t('analytics.others'),
        amount: rest.reduce((sum, n) => sum + n.amount, 0),
        // cat-8 es el neutro reservado para este bucket
        color: tokens.categorical[7],
      });
    }

    return { data: items, palette: items.map((i) => i.color) };
  }, [nodes, tokens, t]);

  if (data.length === 0 || total === 0) return null;

  return (
    <Pie
      {...base}
      data={data}
      angleField="amount"
      colorField="name"
      innerRadius={0.62}
      height={220}
      // La leyenda la hace el ranking de al lado; aqui solo estorbaria.
      legend={false}
      label={false}
      scale={{ color: { range: palette } }}
      tooltip={{
        title: null,
        items: [
          {
            channel: 'y',
            valueFormatter: (v: number) =>
              `${formatCurrency(v, currency)} ${currency} · ${formatShare(v / total)}`,
          },
        ],
      }}
    />
  );
}
