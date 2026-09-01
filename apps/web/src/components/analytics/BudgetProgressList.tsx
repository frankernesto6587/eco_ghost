import { useTranslation } from 'react-i18next';
import { Button, Popconfirm, Tooltip } from 'antd';
import { EditOutlined, DeleteOutlined } from '@ant-design/icons';
import type { BudgetProgress, BudgetProgressItem } from '@ecoghost/shared';
import CategoryIcon from '@/components/common/CategoryIcon';
import { formatCurrency, formatShare } from '@/lib/formatters';
import s from './Analytics.module.css';

interface Props {
  progress: BudgetProgress;
  currency: string;
  canEdit: boolean;
  onEdit: (item: BudgetProgressItem) => void;
  onDelete: (budgetId: string) => void;
}

function fillColor(status: BudgetProgressItem['status']): string {
  if (status === 'OVER') return 'var(--eco-neg)';
  if (status === 'WARN') return 'var(--eco-accent)';
  return 'var(--eco-pos)';
}

export function BudgetProgressList({ progress, currency, canEdit, onEdit, onDelete }: Props) {
  const { t } = useTranslation();

  return (
    <div>
      {progress.items.map((item) => {
        // La barra llega como mucho al 100%: el exceso se dibuja aparte, rayado.
        const filled = Math.min(1, item.ratio);
        const over = item.ratio > 1;
        // Proyeccion relativa al tope, recortada para que no se salga de la pista.
        const projection =
          item.projectedSpend !== null && item.limit > 0
            ? Math.min(1, item.projectedSpend / item.limit)
            : null;

        return (
          <div key={item.budgetId} className={s.budgetRow}>
            <div className={s.budgetHead}>
              <span
                className={s.rankIcon}
                style={{
                  background: item.color
                    ? `color-mix(in oklab, ${item.color} 18%, var(--eco-surface))`
                    : 'var(--eco-surface3)',
                  color: item.color ?? 'var(--eco-fg3)',
                }}
              >
                <CategoryIcon name={item.icon ?? 'ellipsis'} />
              </span>

              <div className={s.budgetName}>{item.categoryName}</div>

              <div className={s.budgetFigures}>
                <span>{formatCurrency(item.spent, currency)}</span>
                <span className={s.budgetLimit}>/ {formatCurrency(item.limit, currency)}</span>
                {canEdit && (
                  <span className={s.budgetActions}>
                    <Button
                      type="text"
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => onEdit(item)}
                      aria-label={t('budgets.edit')}
                    />
                    <Popconfirm
                      title={t('budgets.deleteConfirm')}
                      onConfirm={() => onDelete(item.budgetId)}
                      okText={t('common.delete')}
                      cancelText={t('common.cancel')}
                    >
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label={t('common.delete')} />
                    </Popconfirm>
                  </span>
                )}
              </div>
            </div>

            <div className={s.budgetTrack}>
              <div
                className={s.budgetFill}
                style={{ width: `${filled * 100}%`, background: fillColor(item.status) }}
              />
              {over && (
                <div
                  className={s.budgetOverflow}
                  style={{ left: `${Math.max(0, (1 / item.ratio) * 100)}%`, right: 0 }}
                />
              )}
              {projection !== null && projection > filled && (
                <Tooltip
                  title={t('budgets.projected', {
                    amount: `${formatCurrency(item.projectedSpend ?? 0, currency)} ${currency}`,
                  })}
                >
                  <div className={s.budgetProjection} style={{ left: `${projection * 100}%` }} />
                </Tooltip>
              )}
            </div>

            <div className={s.budgetFoot}>
              <span
                className={
                  item.status === 'OVER'
                    ? s.budgetNoteOver
                    : item.status === 'WARN'
                      ? s.budgetNoteWarn
                      : s.budgetNote
                }
              >
                {item.status === 'OVER'
                  ? t('budgets.overBy', {
                      amount: `${formatCurrency(Math.abs(item.remaining), currency)} ${currency}`,
                    })
                  : t('budgets.remaining', {
                      amount: `${formatCurrency(item.remaining, currency)} ${currency}`,
                    })}
              </span>
              <span className={s.budgetNote}>{formatShare(item.ratio)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
