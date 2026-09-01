import { formatCurrency, formatPercent, formatRangeLabel } from '@/lib/formatters';
import s from './Analytics.module.css';

interface Props {
  label: string;
  amount: number;
  currency: string;
  previousAmount: number;
  deltaPct: number | null;
  /** Para gastos, subir es malo; para ingresos y neto, subir es bueno. */
  higherIsBetter: boolean;
  previousRange: { from: string; to: string };
  tone?: 'pos' | 'neg' | 'neutral';
  vsLabel: string;
}

export function StatDeltaCard({
  label,
  amount,
  currency,
  previousAmount,
  deltaPct,
  higherIsBetter,
  previousRange,
  tone = 'neutral',
  vsLabel,
}: Props) {
  const dotClass = tone === 'pos' ? s.cardDotPos : tone === 'neg' ? s.cardDotNeg : s.cardDot;

  let deltaClass = s.delta;
  if (deltaPct !== null && Math.abs(deltaPct) >= 0.5) {
    const up = deltaPct > 0;
    const good = higherIsBetter ? up : !up;
    deltaClass = good ? s.deltaGoodUp : s.deltaUp;
  }

  return (
    <article className={s.card}>
      <div className={s.cardLabel}>
        <span className={dotClass} />
        {label}
      </div>

      <div className={s.statNum}>
        {formatCurrency(amount, currency)}
        <span className={s.statCur}>{currency}</span>
      </div>

      <div className={s.statFoot}>
        <span className={deltaClass}>
          {deltaPct === null ? '—' : formatPercent(deltaPct)}
        </span>
        <span className={s.statPrev}>
          {vsLabel} {formatRangeLabel(previousRange.from, previousRange.to)} ·{' '}
          {formatCurrency(previousAmount, currency)}
        </span>
      </div>
    </article>
  );
}
