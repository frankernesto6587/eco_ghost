import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RightOutlined } from '@ant-design/icons';
import type { CategoryRollupNode } from '@ecoghost/shared';
import CategoryIcon from '@/components/common/CategoryIcon';
import { formatCurrency, formatPercent, formatShare } from '@/lib/formatters';
import { categoryColor, type EcoChartTokens } from '@/lib/chartTheme';
import s from './Analytics.module.css';

interface Props {
  nodes: CategoryRollupNode[];
  currency: string;
  tokens: EcoChartTokens;
  /** Subir el gasto es malo; subir el ingreso es bueno. */
  higherIsBetter: boolean;
  onDrill: (node: CategoryRollupNode) => void;
}

/**
 * El ranking es el heroe de la pagina: responde "en que gasto" de un vistazo.
 *
 * Deliberadamente NO usa @ant-design/charts. G2 no hace filas expandibles
 * padre/hijo, ni iconos por categoria, ni click-to-drill; y para comparar
 * magnitudes ordenadas una lista de barras gana a un grafico de barras.
 */
export function CategoryRankingList({
  nodes,
  currency,
  tokens,
  higherIsBetter,
  onDrill,
}: Props) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (nodes.length === 0) return null;

  // Escala relativa al MAXIMO, no al total: con `share` la 5a categoria seria
  // una raya de 2px invisible. Es el estandar para barras rankeadas.
  const max = Math.max(...nodes.map((n) => n.amount), 1);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const deltaClass = (deltaPct: number | null) => {
    if (deltaPct === null || Math.abs(deltaPct) < 0.5) return s.delta;
    const up = deltaPct > 0;
    return (higherIsBetter ? up : !up) ? s.deltaGoodUp : s.deltaUp;
  };

  const renderRow = (node: CategoryRollupNode, index: number, isChild: boolean, scale: number) => {
    const key = node.categoryId ?? '__none__';
    const color = categoryColor(node.color, index, tokens);
    const isOpen = expanded.has(key);
    const hasChildren = node.children.length > 0;
    const uncategorized = node.categoryId === null;

    return (
      <div key={key}>
        <div className={isChild ? s.rankChild : s.rankRow}>
          {hasChildren ? (
            <button
              type="button"
              className={isOpen ? s.rankChevronOpen : s.rankChevron}
              onClick={(e) => {
                e.stopPropagation();
                toggle(key);
              }}
              aria-expanded={isOpen}
              aria-label={t('analytics.expandChildren')}
            >
              <RightOutlined />
            </button>
          ) : (
            <span className={s.rankChevronSpacer} />
          )}

          <button
            type="button"
            className={s.rankIcon}
            style={{
              background: uncategorized
                ? 'var(--eco-surface3)'
                : `color-mix(in oklab, ${color} 18%, var(--eco-surface))`,
              color: uncategorized ? 'var(--eco-fg4)' : color,
              border: 'none',
              cursor: 'pointer',
            }}
            onClick={() => onDrill(node)}
            tabIndex={-1}
            aria-hidden
          >
            <CategoryIcon name={node.icon ?? 'ellipsis'} />
          </button>

          <button type="button" className={s.rankBody} onClick={() => onDrill(node)}
            style={{ background: 'transparent', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit' }}>
            <div className={uncategorized ? s.rankNameMuted : s.rankName}>
              {uncategorized ? t('analytics.uncategorized') : node.name}
            </div>
            <div className={s.rankBarTrack}>
              <div
                className={s.rankBarFill}
                style={{
                  width: `${Math.max(1, (node.amount / scale) * 100)}%`,
                  background: uncategorized ? 'var(--eco-fg4)' : color,
                }}
              />
            </div>
          </button>

          <div className={s.rankRight}>
            <span className={s.rankAmount}>{formatCurrency(node.amount, currency)}</span>
            <span className={s.rankMeta}>
              <span className={s.rankShare}>{formatShare(node.share)}</span>
              <span className={deltaClass(node.deltaPct)}>
                {node.deltaPct === null ? '—' : formatPercent(node.deltaPct)}
              </span>
            </span>
          </div>
        </div>

        {isOpen &&
          node.children.map((child, i) =>
            renderRow(child, i, true, Math.max(...node.children.map((c) => c.amount), 1)),
          )}
      </div>
    );
  };

  return (
    <div className={s.rankList}>
      {nodes.map((node, i) => renderRow(node, i, false, max))}
    </div>
  );
}
