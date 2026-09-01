import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { analyticsService } from '@/services/analytics.service';
import CategoryIcon from '@/components/common/CategoryIcon';
import { formatCurrency, formatPercent, formatShare } from '@/lib/formatters';
import { categoryColor } from '@/lib/chartTheme';
import { useEcoChartTheme } from '@/hooks/useEcoChartTheme';
import s from './TopExpensesCard.module.css';

interface Props {
  /** 'YYYY-MM-DD'; si falta, el backend usa el mes actual */
  from?: string;
  to?: string;
  /** Gasto por moneda del propio overview: evita una peticion extra para elegir moneda */
  expenseByCurrency: Record<string, number>;
}

/**
 * "En que se te fue el dinero" en cinco filas, con enlace al analisis completo.
 *
 * Muestra UNA moneda a la vez: apilar 4 monedas x 5 filas seria ilegible.
 * La moneda por defecto es la de mayor gasto del rango, calculada desde datos
 * que el Dashboard ya tiene en memoria.
 */
export function TopExpensesCard({ from, to, expenseByCurrency }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { tokens } = useEcoChartTheme();

  const currencies = useMemo(
    () =>
      Object.entries(expenseByCurrency)
        .filter(([, amount]) => amount > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([cur]) => cur),
    [expenseByCurrency],
  );

  const [override, setOverride] = useState<string | null>(null);
  const currency = override && currencies.includes(override) ? override : currencies[0];

  const { data, isLoading } = useQuery({
    queryKey: ['analytics', 'top-categories', currency, from, to],
    queryFn: () => analyticsService.getTopCategories({ currency: currency!, from, to, limit: 5 }),
    enabled: !!currency,
  });

  const max = data?.items.length ? Math.max(...data.items.map((i) => i.amount), 1) : 1;

  return (
    <article className={s.card}>
      <div className={s.label}>
        <span className={s.dot} />
        {t('dashboard.topExpenses')}
        <span className={s.spacer} />
        {currencies.length > 1 && (
          <span className={s.curSwitch}>
            {currencies.slice(0, 4).map((cur) => (
              <button
                key={cur}
                type="button"
                className={cur === currency ? s.curBtnOn : s.curBtn}
                onClick={() => setOverride(cur)}
                aria-pressed={cur === currency}
              >
                {cur}
              </button>
            ))}
          </span>
        )}
      </div>

      {!currency ? (
        <div className={s.empty}>{t('dashboard.noExpensesInRange')}</div>
      ) : isLoading ? (
        <div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={s.skel} />
          ))}
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className={s.empty}>{t('dashboard.noExpensesInRange')}</div>
      ) : (
        <div className={s.list}>
          {data.items.map((item, i) => {
            const uncategorized = item.categoryId === null;
            const color = uncategorized ? tokens.fg4 : categoryColor(item.color, i, tokens);
            return (
              <div key={item.categoryId ?? '__none__'} className={s.row}>
                <span
                  className={s.icon}
                  style={{
                    background: uncategorized
                      ? 'var(--eco-surface3)'
                      : `color-mix(in oklab, ${color} 18%, var(--eco-surface))`,
                    color,
                  }}
                >
                  <CategoryIcon name={item.icon ?? 'ellipsis'} />
                </span>
                <div className={s.body}>
                  <div className={s.name}>
                    {uncategorized ? t('analytics.uncategorized') : item.name}
                  </div>
                  <div className={s.track}>
                    <div
                      className={s.fill}
                      style={{ width: `${(item.amount / max) * 100}%`, background: color }}
                    />
                  </div>
                </div>
                <div className={s.right}>
                  <span className={s.amount}>{formatCurrency(item.amount, currency)}</span>
                  <span
                    className={
                      item.deltaPct === null || Math.abs(item.deltaPct) < 0.5
                        ? s.delta
                        : item.deltaPct > 0
                          ? s.deltaUp
                          : s.deltaDown
                    }
                  >
                    {formatShare(item.share)}
                    {item.deltaPct !== null && ` · ${formatPercent(item.deltaPct)}`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className={s.foot}>
        {data && data.uncategorizedShare > 0.15 ? (
          <span className={s.warn}>
            {formatShare(data.uncategorizedShare)} {t('dashboard.uncategorizedWarn')}
          </span>
        ) : (
          <span />
        )}
        <button type="button" className={s.link} onClick={() => navigate('/analysis')}>
          {t('dashboard.seeAnalysis')} →
        </button>
      </div>
    </article>
  );
}
