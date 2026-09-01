import { useTranslation } from 'react-i18next';
import type { AnalyticsRecurring } from '@ecoghost/shared';
import { ReloadOutlined } from '@ant-design/icons';
import { formatCurrency, formatDate } from '@/lib/formatters';
import s from './Analytics.module.css';

interface Props {
  data: AnalyticsRecurring;
  currency: string;
}

/**
 * Gastos que se repiten.
 *
 * Se agrupa por descripcion normalizada porque el modelo no tiene campo de
 * comercio. La agrupacion es difusa por construccion ("compra en el agro" y
 * "agro" no colapsan), asi que la seccion lo dice en su subtitulo y ocupa un
 * lugar secundario: la senal fiable para decidir que recortar es el delta por
 * categoria de arriba.
 */
export function RecurringList({ data, currency }: Props) {
  const { t } = useTranslation();

  if (data.items.length === 0) {
    return (
      <div className={s.emptyHint} style={{ padding: '12px 6px' }}>
        {t('analytics.noRecurring')}
      </div>
    );
  }

  return (
    <div>
      {data.items.map((item) => (
        <div key={item.key} className={s.itemRow}>
          <span className={s.rankIcon} style={{ background: 'var(--eco-surface3)', color: 'var(--eco-fg3)' }}>
            <ReloadOutlined />
          </span>
          <div className={s.itemMain}>
            <div className={s.itemName}>{item.sample}</div>
            <div className={s.itemSub}>
              {item.categoryName ?? t('analytics.uncategorized')} ·{' '}
              {t('analytics.lastSeen')} {formatDate(item.lastDate)}
            </div>
          </div>
          <div>
            <div className={s.itemAmount}>{formatCurrency(item.total, currency)}</div>
            <div className={s.itemCount}>
              {t('analytics.occurrences', { count: item.occurrences })} ·{' '}
              {t('analytics.average')} {formatCurrency(item.average, currency)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
