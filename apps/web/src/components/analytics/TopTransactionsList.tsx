import { useTranslation } from 'react-i18next';
import type { TopTransaction } from '@ecoghost/shared';
import CategoryIcon from '@/components/common/CategoryIcon';
import { formatCurrency, formatDate } from '@/lib/formatters';
import s from './Analytics.module.css';

interface Props {
  items: TopTransaction[];
  currency: string;
}

export function TopTransactionsList({ items, currency }: Props) {
  const { t } = useTranslation();

  if (items.length === 0) {
    return <div className={s.emptyHint} style={{ padding: '12px 6px' }}>{t('analytics.noData')}</div>;
  }

  return (
    <div>
      {items.map((tx) => (
        <div key={tx.id} className={s.itemRow}>
          <span
            className={s.rankIcon}
            style={{
              background: tx.category?.color
                ? `color-mix(in oklab, ${tx.category.color} 18%, var(--eco-surface))`
                : 'var(--eco-surface3)',
              color: tx.category?.color ?? 'var(--eco-fg4)',
            }}
          >
            <CategoryIcon name="ellipsis" />
          </span>
          <div className={s.itemMain}>
            <div className={s.itemName}>{tx.description}</div>
            <div className={s.itemSub}>
              {formatDate(tx.date)} · {tx.category?.name ?? t('analytics.uncategorized')} ·{' '}
              {tx.account.name}
            </div>
          </div>
          <div className={s.itemAmount}>{formatCurrency(tx.amount, currency)}</div>
        </div>
      ))}
    </div>
  );
}
