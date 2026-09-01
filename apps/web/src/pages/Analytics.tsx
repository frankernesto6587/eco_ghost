import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { App, Button, Spin } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { BudgetProgressItem, CategoryRollupNode } from '@ecoghost/shared';

import { analyticsService } from '@/services/analytics.service';
import { budgetsService } from '@/services/budgets.service';
import { accountsService } from '@/services/accounts.service';
import { categoriesService, type Category } from '@/services/categories.service';
import { useUIStore } from '@/store/ui.store';
import { useAuthStore } from '@/store/auth.store';
import { usePermissions } from '@/hooks/usePermissions';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useEcoChartTheme } from '@/hooks/useEcoChartTheme';
import { resolveAnalyticsRange, monthOfRange, type AnalyticsPreset } from '@/lib/dateRanges';
import { formatCurrency, formatRangeLabel } from '@/lib/formatters';
import { QueryError } from '@/components/feedback';
import {
  BudgetDrawer,
  BudgetProgressList,
  CategoryDonut,
  CategoryRankingList,
  CurrencyChips,
  DataQualityBanner,
  MonthlyTrendChart,
  RangePresetChips,
  RecurringList,
  StatDeltaCard,
  TopTransactionsList,
  type BudgetFormValues,
} from '@/components/analytics';
import type { Budget } from '@ecoghost/shared';
import c from '@/components/analytics/Analytics.module.css';
import s from './Analytics.module.css';

const TREND_OPTIONS: (6 | 12 | 24)[] = [6, 12, 24];

/** Skeleton con la altura final de la tarjeta, para que no salte el layout. */
function CardSkeleton({ height, label }: { height: number; label: string }) {
  return (
    <article className={c.card}>
      <div className={c.cardLabel}>
        <span className={c.cardDot} />
        {label}
      </div>
      <div className={c.skel} style={{ height }} />
    </article>
  );
}

function RankSkeleton() {
  return (
    <div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className={c.skelRow}>
          <div className={c.skelIcon} />
          <div className={c.skelBody}>
            <div className={c.skelLine} style={{ width: `${70 - i * 8}%` }} />
            <div className={c.skelLine} style={{ width: '100%', height: 5 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { canWrite } = usePermissions();
  const { tokens } = useEcoChartTheme();

  const currentOrg = useAuthStore((st) => st.currentOrg);
  const filters = useUIStore((st) => st.analyticsFilters);
  const setFilters = useUIStore((st) => st.setAnalyticsFilters);

  const [budgetOpen, setBudgetOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);

  // El rango se RESUELVE en cada render desde el preset. Lo que se persiste es
  // el preset: guardar las fechas haria que "este mes" siguiera mostrando
  // agosto al volver en septiembre.
  const range = useMemo(
    () => resolveAnalyticsRange(filters.preset, filters.dateFrom, filters.dateTo),
    [filters.preset, filters.dateFrom, filters.dateTo],
  );
  const month = monthOfRange(range);

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: accountsService.getAll,
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: categoriesService.getAll,
  });

  // Monedas reales de la org, no la constante CURRENCIES: una org con solo MN
  // y USD no debe ver chips de EUR y MLC.
  const currencies = useMemo(() => {
    const set = new Map<string, number>();
    for (const a of accounts) set.set(a.currency, (set.get(a.currency) ?? 0) + 1);
    return [...set.entries()].sort((a, b) => b[1] - a[1]).map(([cur]) => cur);
  }, [accounts]);

  const currency = useMemo(() => {
    if (filters.currency && currencies.includes(filters.currency)) return filters.currency;
    const base = currentOrg?.baseCurrency;
    if (base && currencies.includes(base)) return base;
    return currencies[0] ?? base ?? 'USD';
  }, [filters.currency, currencies, currentOrg?.baseCurrency]);

  // Fijar la moneda resuelta la primera vez, para que los chips reflejen el estado real.
  useEffect(() => {
    if (!filters.currency && currency) setFilters({ currency });
  }, [filters.currency, currency, setFilters]);

  const hasAccountsInCurrency = currencies.includes(currency);

  const summaryQuery = useQuery({
    queryKey: ['analytics', 'summary', currency, range.from, range.to],
    queryFn: () =>
      analyticsService.getSummary({ currency, from: range.from, to: range.to, topLimit: 8 }),
    enabled: !!currency && hasAccountsInCurrency,
  });

  const trendQuery = useQuery({
    queryKey: ['analytics', 'trend', currency, filters.trendMonths],
    queryFn: () => analyticsService.getTrend({ currency, months: filters.trendMonths }),
    enabled: !!currency && hasAccountsInCurrency,
  });

  const budgetQuery = useQuery({
    queryKey: ['budgets', 'progress', currency, month],
    queryFn: () => budgetsService.getProgress({ currency, month }),
    enabled: !!currency,
  });

  // Recurrentes es la consulta mas cara y la de peor calidad de dato: no se pide
  // hasta que el bloque entra en pantalla.
  const recurringRef = useRef<HTMLDivElement | null>(null);
  const [recurringVisible, setRecurringVisible] = useState(false);
  useEffect(() => {
    const node = recurringRef.current;
    if (!node || recurringVisible) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setRecurringVisible(true);
      },
      { rootMargin: '200px' },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [recurringVisible]);

  const recurringQuery = useQuery({
    queryKey: ['analytics', 'recurring', currency, range.from, range.to],
    queryFn: () =>
      analyticsService.getRecurring({ currency, from: range.from, to: range.to, minCount: 3 }),
    enabled: recurringVisible && !!currency && hasAccountsInCurrency,
  });

  const invalidateBudgets = () => {
    queryClient.invalidateQueries({ queryKey: ['budgets'] });
  };

  const createBudget = useMutation({
    mutationFn: (values: BudgetFormValues) =>
      budgetsService.create({ ...values, currency }),
    onSuccess: () => {
      message.success(t('budgets.createSuccess'));
      setBudgetOpen(false);
      invalidateBudgets();
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.message ?? t('budgets.overlapError'));
    },
  });

  const updateBudget = useMutation({
    mutationFn: ({ id, values }: { id: string; values: BudgetFormValues }) =>
      budgetsService.update(id, {
        amount: values.amount,
        endMonth: values.endMonth,
        notes: values.notes,
      }),
    onSuccess: () => {
      message.success(t('budgets.updateSuccess'));
      setBudgetOpen(false);
      setEditingBudget(null);
      invalidateBudgets();
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.message ?? t('common.errorLoading'));
    },
  });

  const deleteBudget = useMutation({
    mutationFn: (id: string) => budgetsService.remove(id),
    onSuccess: () => {
      message.success(t('budgets.deleteSuccess'));
      invalidateBudgets();
    },
  });

  const goToTransactions = (params: Record<string, string>) => {
    navigate(`/transactions?${new URLSearchParams(params).toString()}`);
  };

  const drillCategory = (node: CategoryRollupNode) => {
    goToTransactions({
      ...(node.categoryId ? { categoryId: node.categoryId } : { uncategorized: 'true' }),
      from: range.from,
      to: range.to,
      currency,
      type: 'EXPENSE',
    });
  };

  const openEditBudget = async (item: BudgetProgressItem) => {
    const all = await budgetsService.getAll({ currency, includeInactive: true });
    const found = all.find((b) => b.id === item.budgetId) ?? null;
    setEditingBudget(found);
    setBudgetOpen(true);
  };

  const summary = summaryQuery.data;
  const budgets = budgetQuery.data;

  return (
    <div className={s.page}>
      <header className={s.pageHead}>
        <div>
          <h1 className={s.pageTitle}>{t('analytics.title')}</h1>
          <div className={s.pageSubtitle}>
            {t('analytics.subtitle')} · {formatRangeLabel(range.from, range.to)}
          </div>
        </div>
        <div className={s.controls}>
          <CurrencyChips
            currencies={currencies}
            value={currency}
            onChange={(cur) => setFilters({ currency: cur })}
          />
          <RangePresetChips
            preset={filters.preset}
            from={range.from}
            to={range.to}
            onPreset={(preset: AnalyticsPreset) =>
              setFilters({ preset, dateFrom: null, dateTo: null })
            }
            onCustom={(from, to) =>
              setFilters({ preset: 'custom', dateFrom: from, dateTo: to })
            }
          />
        </div>
      </header>

      {!hasAccountsInCurrency ? (
        <article className={c.card}>
          <div className={c.empty}>
            <div className={c.emptyTitle}>
              {t('analytics.noAccountsInCurrency', { currency })}
            </div>
            <div className={c.emptyActions}>
              <Button onClick={() => navigate('/accounts')}>{t('nav.accounts')}</Button>
            </div>
          </div>
        </article>
      ) : summaryQuery.isError ? (
        <article className={c.card}>
          <QueryError onRetry={() => summaryQuery.refetch()} />
        </article>
      ) : (
        <>
          {summary && (
            <DataQualityBanner
              share={summary.dataQuality.uncategorizedExpenseShare}
              amount={summary.dataQuality.uncategorizedExpense}
              count={summary.dataQuality.uncategorizedExpenseCount}
              currency={currency}
              onFix={() =>
                goToTransactions({
                  uncategorized: 'true',
                  from: range.from,
                  to: range.to,
                  currency,
                  type: 'EXPENSE',
                })
              }
            />
          )}

          {/* ═══════ Metricas del periodo ═══════ */}
          <section className={s.statGrid}>
            {summaryQuery.isLoading || !summary ? (
              <>
                <CardSkeleton height={62} label={t('analytics.expenses')} />
                <CardSkeleton height={62} label={t('analytics.income')} />
                <CardSkeleton height={62} label={t('analytics.net')} />
              </>
            ) : (
              <>
                <StatDeltaCard
                  label={t('analytics.expenses')}
                  amount={summary.totals.expense}
                  currency={currency}
                  previousAmount={summary.totals.previousExpense}
                  deltaPct={summary.totals.expenseDeltaPct}
                  higherIsBetter={false}
                  previousRange={summary.previousRange}
                  tone="neg"
                  vsLabel={t('analytics.vsPrevious')}
                />
                <StatDeltaCard
                  label={t('analytics.income')}
                  amount={summary.totals.income}
                  currency={currency}
                  previousAmount={summary.totals.previousIncome}
                  deltaPct={summary.totals.incomeDeltaPct}
                  higherIsBetter
                  previousRange={summary.previousRange}
                  tone="pos"
                  vsLabel={t('analytics.vsPrevious')}
                />
                <StatDeltaCard
                  label={t('analytics.net')}
                  amount={summary.totals.net}
                  currency={currency}
                  previousAmount={summary.totals.previousNet}
                  deltaPct={
                    summary.totals.previousNet === 0
                      ? null
                      : ((summary.totals.net - summary.totals.previousNet) /
                          Math.abs(summary.totals.previousNet)) *
                        100
                  }
                  higherIsBetter
                  previousRange={summary.previousRange}
                  vsLabel={t('analytics.vsPrevious')}
                />
              </>
            )}
          </section>

          {/* ═══════ En que gastas ═══════ */}
          <section className={s.splitGrid}>
            <article className={c.card}>
              <div className={c.cardLabel}>
                <span className={c.cardDotNeg} />
                {t('analytics.byCategory')}
                <span className={c.cardLabelSpacer} />
                {summary && (
                  <span className={c.cardHint}>
                    {formatCurrency(summary.totals.expense, currency)} {currency}
                  </span>
                )}
              </div>

              {summaryQuery.isLoading || !summary ? (
                <RankSkeleton />
              ) : summary.expenseByCategory.length === 0 ? (
                <div className={c.empty}>
                  <div className={c.emptyTitle}>
                    {t('analytics.noMovements', {
                      currency,
                      range: formatRangeLabel(range.from, range.to),
                    })}
                  </div>
                  <div className={c.emptyActions}>
                    <Button size="small" onClick={() => setFilters({ preset: 'last3Months' })}>
                      {t('analytics.widenRange')}
                    </Button>
                    <Button size="small" type="primary" onClick={() => navigate('/transactions')}>
                      {t('analytics.registerExpense')}
                    </Button>
                  </div>
                </div>
              ) : (
                <CategoryRankingList
                  nodes={summary.expenseByCategory}
                  currency={currency}
                  tokens={tokens}
                  higherIsBetter={false}
                  onDrill={drillCategory}
                />
              )}
            </article>

            <article className={`${c.card} ${s.hideOnMobile}`}>
              <div className={c.cardLabel}>
                <span className={c.cardDot} />
                {t('analytics.composition')}
              </div>
              {summary && summary.totals.expense > 0 ? (
                <CategoryDonut
                  nodes={summary.expenseByCategory}
                  currency={currency}
                  total={summary.totals.expense}
                />
              ) : (
                <div className={c.skel} style={{ height: 200, borderRadius: '50%' }} />
              )}
            </article>
          </section>

          {/* ═══════ Presupuestos ═══════ */}
          <section className={s.fullRow}>
            <article className={c.card}>
              <div className={c.cardLabel}>
                <span className={c.cardDot} />
                {t('budgets.title')}
                {budgets && budgets.totals.overCount > 0 && (
                  <span className={s.overBadge}>
                    {t('budgets.overCount', { count: budgets.totals.overCount })}
                  </span>
                )}
                <span className={c.cardLabelSpacer} />
                {canWrite && (
                  <Button
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={() => {
                      setEditingBudget(null);
                      setBudgetOpen(true);
                    }}
                  >
                    {t('budgets.new')}
                  </Button>
                )}
              </div>

              {budgetQuery.isLoading ? (
                <RankSkeleton />
              ) : !budgets || budgets.items.length === 0 ? (
                <div className={c.empty}>
                  <div className={c.emptyTitle}>{t('budgets.noBudgets')}</div>
                  <div className={c.emptyHint}>{t('budgets.createFirst')}</div>
                </div>
              ) : (
                <BudgetProgressList
                  progress={budgets}
                  currency={currency}
                  canEdit={canWrite}
                  onEdit={openEditBudget}
                  onDelete={(id) => deleteBudget.mutate(id)}
                />
              )}
            </article>
          </section>

          {/* ═══════ Evolucion mensual ═══════ */}
          <section className={s.fullRow}>
            <article className={c.card}>
              <div className={c.cardLabel}>
                <span className={c.cardDot} />
                {t('analytics.monthlyTrend')}
                <span className={c.cardLabelSpacer} />
                <span className={c.chipRow}>
                  {TREND_OPTIONS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={filters.trendMonths === m ? c.chipOn : c.chip}
                      onClick={() => setFilters({ trendMonths: m })}
                    >
                      {t(`analytics.months${m}`)}
                    </button>
                  ))}
                </span>
              </div>
              {trendQuery.isLoading ? (
                <div className={c.skel} style={{ height: 260 }} />
              ) : trendQuery.data ? (
                <MonthlyTrendChart trend={trendQuery.data} currency={currency} />
              ) : (
                <QueryError onRetry={() => trendQuery.refetch()} />
              )}
            </article>
          </section>

          {/* ═══════ Recurrentes + top movimientos ═══════ */}
          <section className={s.twoCol} ref={recurringRef}>
            <article className={c.card}>
              <div className={c.cardLabel}>
                <span className={c.cardDot} />
                {t('analytics.recurring')}
                <span className={c.cardLabelSpacer} />
                <span className={c.cardHint}>{t('analytics.recurringHint')}</span>
              </div>
              {!recurringVisible || recurringQuery.isLoading ? (
                <RankSkeleton />
              ) : recurringQuery.data ? (
                <RecurringList data={recurringQuery.data} currency={currency} />
              ) : (
                <QueryError onRetry={() => recurringQuery.refetch()} />
              )}
            </article>

            <article className={c.card}>
              <div className={c.cardLabel}>
                <span className={c.cardDotNeg} />
                {t('analytics.topMovements')}
              </div>
              {summaryQuery.isLoading || !summary ? (
                <RankSkeleton />
              ) : (
                <TopTransactionsList items={summary.topTransactions} currency={currency} />
              )}
            </article>
          </section>
        </>
      )}

      <BudgetDrawer
        open={budgetOpen}
        onClose={() => {
          setBudgetOpen(false);
          setEditingBudget(null);
        }}
        onSubmit={(values) =>
          editingBudget
            ? updateBudget.mutate({ id: editingBudget.id, values })
            : createBudget.mutate(values)
        }
        submitting={createBudget.isPending || updateBudget.isPending}
        categories={categories}
        currency={currency}
        editing={editingBudget}
        defaultMonth={month}
        isMobile={isMobile}
      />

      {(summaryQuery.isFetching || budgetQuery.isFetching) && (
        <Spin size="small" style={{ position: 'fixed', bottom: 16, right: 16 }} />
      )}
    </div>
  );
}
