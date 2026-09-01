import { useTranslation } from 'react-i18next';
import { Button } from 'antd';
import { WarningOutlined } from '@ant-design/icons';
import { formatCurrency, formatShare } from '@/lib/formatters';
import s from './Analytics.module.css';

interface Props {
  share: number;
  amount: number;
  count: number;
  currency: string;
  onFix: () => void;
}

/** Umbral a partir del cual el analisis deja de ser fiable. */
export const UNCATEGORIZED_THRESHOLD = 0.15;

/**
 * Si una parte grande del gasto no tiene categoria, el ranking miente por
 * omision. Este banner lo dice y, sobre todo, lleva a arreglarlo: sin el CTA
 * seria solo un regano.
 */
export function DataQualityBanner({ share, amount, count, currency, onFix }: Props) {
  const { t } = useTranslation();
  if (share < UNCATEGORIZED_THRESHOLD) return null;

  return (
    <div className={s.qualityBanner} role="status">
      <WarningOutlined className={s.qualityIcon} />
      <div className={s.qualityBody}>
        <div className={s.qualityTitle}>{t('analytics.dataQualityTitle')}</div>
        <div className={s.qualityText}>
          {t('analytics.dataQualityBody', {
            share: formatShare(share),
            count,
            amount: `${formatCurrency(amount, currency)} ${currency}`,
          })}
        </div>
      </div>
      <Button type="primary" onClick={onFix}>
        {t('analytics.dataQualityCta')}
      </Button>
    </div>
  );
}
