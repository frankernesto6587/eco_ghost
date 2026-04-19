import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Button, DatePicker, Dropdown, Spin } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { TransactionType } from '@ecoghost/shared';
import type { DashboardOverview } from '@ecoghost/shared';
import { dashboardService } from '@/services/dashboard.service';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';

const { RangePicker } = DatePicker;
import s from './Dashboard.module.css';

/** Shape of a transaction coming from the API overview endpoint. */
interface RecentTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: TransactionType;
  categoryId: string | null;
  accountId: string;
  notes: string | null;
  category: { id: string; name: string; icon: string | null; color: string | null } | null;
  account: { id: string; name: string; type: string; currency: string; icon: string | null };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTypeDotClass(type: string): string {
  switch (type) {
    case 'INCOME': return s.typeDotInc;
    case 'EXPENSE': return s.typeDotExp;
    case 'TRANSFER': return s.typeDotTr;
    case 'EXCHANGE': return s.typeDotFx;
    default: return '';
  }
}

function getAmtClass(type: string, hasLinked: boolean): string {
  if (type === 'INCOME') return s.amtPos;
  if (type === 'EXPENSE' || (['TRANSFER', 'EXCHANGE'].includes(type) && hasLinked)) return s.amtNeg;
  if (type === 'TRANSFER' || type === 'EXCHANGE') return s.amtNeu;
  return '';
}

function getAmtPrefix(type: string, hasLinked: boolean): string {
  if (type === 'INCOME') return '+';
  if (type === 'EXPENSE' || (['TRANSFER', 'EXCHANGE'].includes(type) && hasLinked)) return '−';
  if (type === 'TRANSFER' || type === 'EXCHANGE') return '↔ ';
  return '';
}

/** Compute net total per currency for a day's transactions. */
function computeDayTotal(txs: RecentTransaction[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const tx of txs) {
    const cur = tx.account?.currency ?? 'USD';
    if (!totals[cur]) totals[cur] = 0;
    if (tx.type === 'INCOME') totals[cur] += tx.amount;
    else if (tx.type === 'EXPENSE') totals[cur] -= tx.amount;
    // TRANSFER / EXCHANGE: neutral (0)
  }
  return totals;
}

const CURRENCY_COLORS: Record<string, string> = {
  USD: '#3b82f6',
  EUR: '#a855f7',
  MN: '#f59e0b',
  MLC: '#06b6d4',
  USDT: '#22c55e',
};

function getCurrencyColor(currency: string): string {
  return CURRENCY_COLORS[currency] ?? 'var(--eco-accent)';
}

/** Build a smooth cubic bezier path from points */
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return '';
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const cpx = (prev.x + cur.x) / 2;
    d += ` C${cpx},${prev.y} ${cpx},${cur.y} ${cur.x},${cur.y}`;
  }
  return d;
}

const CURRENCY_ICONS: Record<string, string> = {
  USD: '/icons/currencies/usd.png',
  EUR: '/icons/currencies/eur.png',
  MN: '/icons/currencies/mn.png',
  MLC: '/icons/currencies/mlc.png',
  USDT: '/icons/currencies/usdt.png',
};

function getCurrencyIcon(currency: string): string | null {
  return CURRENCY_ICONS[currency] ?? null;
}

/** SVG donut arc path */
function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = {
    x: cx + r * Math.cos((startAngle - 90) * Math.PI / 180),
    y: cy + r * Math.sin((startAngle - 90) * Math.PI / 180),
  };
  const end = {
    x: cx + r * Math.cos((endAngle - 90) * Math.PI / 180),
    y: cy + r * Math.sin((endAngle - 90) * Math.PI / 180),
  };
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos dias';
  if (h < 18) return 'Buenas tardes';
  return 'Buenas noches';
}

/** Group transactions by day label */
function groupByDay(transactions: RecentTransaction[]): { label: string; txs: RecentTransaction[] }[] {
  const groups: Map<string, RecentTransaction[]> = new Map();
  const today = dayjs().format('YYYY-MM-DD');
  const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');

  for (const tx of transactions) {
    const key = dayjs(tx.date).format('YYYY-MM-DD');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(tx);
  }

  return Array.from(groups.entries()).map(([key, txs]) => {
    let label: string;
    if (key === today) {
      label = `hoy · ${dayjs(key).format('ddd DD MMM').toLowerCase()}`;
    } else if (key === yesterday) {
      label = `ayer · ${dayjs(key).format('ddd DD MMM').toLowerCase()}`;
    } else {
      label = dayjs(key).format('ddd DD MMM').toLowerCase();
    }
    return { label, txs };
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null);

  const dashParams = useMemo(() => {
    if (!dateRange) return undefined;
    return {
      from: dateRange[0].startOf('day').toISOString(),
      to: dateRange[1].endOf('day').toISOString(),
    };
  }, [dateRange]);

  const { data: overview, isLoading } = useQuery<DashboardOverview>({
    queryKey: ['dashboard', 'overview', dashParams],
    queryFn: () => dashboardService.getOverview(dashParams),
  });

  const handleDateRangeChange = useCallback(
    (dates: [Dayjs | null, Dayjs | null] | null) => {
      setDateRange(dates && dates[0] && dates[1] ? [dates[0], dates[1]] : null);
    },
    [],
  );

  const [expandedCurrencies, setExpandedCurrencies] = useState<Set<string>>(new Set());

  const transactions = useMemo(
    () => (overview?.recentTransactions ?? []) as unknown as RecentTransaction[],
    [overview],
  );

  const filteredTransactions = useMemo(() => {
    if (typeFilter === 'ALL') return transactions;
    return transactions.filter((tx) => tx.type === typeFilter);
  }, [transactions, typeFilter]);

  const dayGroups = useMemo(() => groupByDay(filteredTransactions), [filteredTransactions]);

  const typeCounts = useMemo(() => {
    const c = { ALL: transactions.length, INCOME: 0, EXPENSE: 0, TRANSFER: 0 };
    for (const tx of transactions) {
      if (tx.type === 'INCOME') c.INCOME++;
      else if (tx.type === 'EXPENSE') c.EXPENSE++;
      else c.TRANSFER++;
    }
    return c;
  }, [transactions]);

  // Daily balance chart data per currency
  const chartRef = useRef<HTMLDivElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const dailyChartData = useMemo(() => {
    const daily = (overview as any)?.dailyBalance as { date: string; balances: Record<string, number> }[] | undefined;
    if (!daily || daily.length < 2) return null;

    const currencies = [...new Set(daily.flatMap((d) => Object.keys(d.balances)))].sort();

    let globalMin = Infinity;
    let globalMax = -Infinity;
    for (const d of daily) {
      for (const val of Object.values(d.balances)) {
        if (val < globalMin) globalMin = val;
        if (val > globalMax) globalMax = val;
      }
    }
    // Add 10% padding to Y range
    const yPad = (globalMax - globalMin) * 0.1 || 100;
    globalMin -= yPad;
    globalMax += yPad;
    const yRange = globalMax - globalMin || 1;

    const marginLeft = 60;
    const marginRight = 16;
    const marginTop = 12;
    const marginBottom = 24;
    const w = 600;
    const h = 180;
    const plotW = w - marginLeft - marginRight;
    const plotH = h - marginTop - marginBottom;

    // Per-currency line data with points
    const lines = currencies.map((cur) => {
      const values = daily.map((d) => d.balances[cur] ?? 0);
      const points = values.map((v, i) => ({
        x: marginLeft + (i / (daily.length - 1)) * plotW,
        y: marginTop + ((globalMax - v) / yRange) * plotH,
      }));
      return { currency: cur, path: smoothPath(points), color: getCurrencyColor(cur), points, values };
    });

    // Y-axis ticks (4-5 nice values)
    const yTicks: { value: number; y: number; label: string }[] = [];
    const step = (globalMax - globalMin) / 4;
    for (let i = 0; i <= 4; i++) {
      const val = globalMin + step * i;
      const y = marginTop + ((globalMax - val) / yRange) * plotH;
      const abs = Math.abs(val / 100);
      const label = abs >= 1000 ? `${(abs / 1000).toFixed(0)}k` : abs.toFixed(0);
      yTicks.push({ value: val, y, label: val < 0 ? `-${label}` : label });
    }

    // X-axis date labels (show ~5-7 evenly spaced)
    const xLabels: { x: number; label: string }[] = [];
    const labelCount = Math.min(daily.length, 7);
    const labelStep = Math.max(1, Math.floor((daily.length - 1) / (labelCount - 1)));
    for (let i = 0; i < daily.length; i += labelStep) {
      xLabels.push({
        x: marginLeft + (i / (daily.length - 1)) * plotW,
        label: dayjs(daily[i].date).format('DD/MM'),
      });
    }
    // Always include last date
    const lastIdx = daily.length - 1;
    if (xLabels[xLabels.length - 1]?.label !== dayjs(daily[lastIdx].date).format('DD/MM')) {
      xLabels.push({
        x: marginLeft + plotW,
        label: dayjs(daily[lastIdx].date).format('DD/MM'),
      });
    }

    return { lines, w, h, daily, currencies, marginLeft, marginRight, marginTop, marginBottom, plotW, plotH, yTicks, xLabels };
  }, [overview]);

  const handleChartMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!dailyChartData || !chartRef.current) return;
    const rect = chartRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const ratio = mouseX / rect.width;
    const svgX = ratio * dailyChartData.w;
    // Find nearest index
    const idx = Math.round(((svgX - dailyChartData.marginLeft) / dailyChartData.plotW) * (dailyChartData.daily.length - 1));
    setHoverIndex(Math.max(0, Math.min(idx, dailyChartData.daily.length - 1)));
  }, [dailyChartData]);

  const handleChartMouseLeave = useCallback(() => setHoverIndex(null), []);

  // Account balances from overview (grouped by currency)
  const accountBalances = (overview as any)?.accountBalances ?? [];
  const balance30dAgo: Record<string, number> = (overview as any)?.balance30dAgo ?? {};

  const balanceByCurrency = useMemo(() => {
    const grouped = new Map<string, { name: string; balance: number }[]>();
    for (const acc of accountBalances) {
      const list = grouped.get(acc.currency) ?? [];
      list.push({ name: acc.name, balance: acc.balance });
      grouped.set(acc.currency, list);
    }
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [accountBalances]);

  const currencyTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const acc of accountBalances) {
      totals[acc.currency] = (totals[acc.currency] ?? 0) + acc.balance;
    }
    return totals;
  }, [accountBalances]);

  const toggleCurrency = useCallback((cur: string) => {
    setExpandedCurrencies((prev) => {
      const next = new Set(prev);
      if (next.has(cur)) next.delete(cur);
      else next.add(cur);
      return next;
    });
  }, []);

  // Stat helpers
  const totalBalance = overview?.totalBalance ?? {};
  const monthIncome = overview?.monthIncome ?? {};
  const monthExpense = overview?.monthExpense ?? {};
  const pendingDebtsReceivable = overview?.pendingDebtsReceivable ?? {};
  const pendingDebtsPayable = overview?.pendingDebtsPayable ?? {};

  // Per-currency flow data for donut charts
  const flowByCurrency = useMemo(() => {
    const allCurs = new Set([...Object.keys(monthIncome), ...Object.keys(monthExpense)]);
    return [...allCurs].sort().map((cur) => {
      const inc = monthIncome[cur] ?? 0;
      const exp = monthExpense[cur] ?? 0;
      return { currency: cur, income: inc, expense: exp, total: inc + exp };
    });
  }, [monthIncome, monthExpense]);

  if (isLoading) {
    return <div className={s.loading}><Spin size="large" /></div>;
  }

  const todayStr = dayjs().format('dddd · DD MMM YYYY').toLowerCase();

  return (
    <div className={s.page}>
      {/* ═══════ PAGE HEADER ═══════ */}
      <header className={s.pageHead}>
        <div>
          <h1 className={s.pageTitle}>{getGreeting()}</h1>
          <div className={s.pageSub}>{todayStr}</div>
        </div>
        <div className={s.pageActions}>
          <Dropdown
            trigger={['click']}
            dropdownRender={() => (
              <div style={{ padding: 12, background: 'var(--eco-surface)', border: '1px solid var(--eco-line)', borderRadius: 10 }}>
                <RangePicker
                  value={dateRange}
                  onChange={handleDateRangeChange}
                  allowClear
                  style={{ width: 280 }}
                />
              </div>
            )}
          >
            <span className={dateRange ? s.filterChipActive : s.filterChip}>
              <span className={s.filterKey}>rango:</span>
              <span className={s.filterVal}>{dateRange ? `${dateRange[0].format('DD/MM')} – ${dateRange[1].format('DD/MM')}` : 'este mes'}</span>
              <span className={s.filterCaret}>▾</span>
            </span>
          </Dropdown>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/transactions')}>
            {isMobile ? 'Nueva' : 'Nueva transaccion'}
          </Button>
        </div>
      </header>

      {/* ═══════ HERO + STAT CARDS ═══════ */}
      <section className={s.heroGrid}>
        {/* Hero: Total Balance */}
        <article className={s.heroCard}>
          <div className={s.cardLabel}>
            <span className={s.cardDot} />
            balance total
          </div>
          <div className={s.heroNum}>
            {Object.keys(totalBalance).length > 0
              ? Object.entries(totalBalance).map(([cur, amt]) => (
                  <div key={cur}>
                    <span className={s.heroCur}>{cur}</span>
                    {' '}{formatCurrency(amt, cur)}
                  </div>
                ))
              : <span style={{ color: 'var(--eco-fg3)' }}>$0</span>
            }
          </div>
          {dailyChartData && (
            <div
              className={s.heroChart}
              ref={chartRef}
              onMouseMove={handleChartMouseMove}
              onMouseLeave={handleChartMouseLeave}
            >
              <svg viewBox={`0 0 ${dailyChartData.w} ${dailyChartData.h}`}>
                <defs>
                  {dailyChartData.lines.map((line) => (
                    <linearGradient key={`grad-${line.currency}`} id={`grad-${line.currency}`} x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0" stopColor={line.color} stopOpacity="0.15" />
                      <stop offset="1" stopColor={line.color} stopOpacity="0" />
                    </linearGradient>
                  ))}
                </defs>

                {/* Y-axis grid lines + labels */}
                {dailyChartData.yTicks.map((tick, i) => (
                  <g key={i}>
                    <line
                      x1={dailyChartData.marginLeft} x2={dailyChartData.w - dailyChartData.marginRight}
                      y1={tick.y} y2={tick.y}
                      stroke="var(--eco-line-soft)" strokeDasharray="3 3" strokeWidth="0.5" opacity="0.5"
                    />
                    <text
                      x={dailyChartData.marginLeft - 8} y={tick.y + 3.5}
                      textAnchor="end" fontSize="9" fontFamily="Geist Mono, monospace"
                      fill="var(--eco-fg4)"
                    >{tick.label}</text>
                  </g>
                ))}

                {/* X-axis date labels */}
                {dailyChartData.xLabels.map((label, i) => (
                  <text
                    key={i} x={label.x} y={dailyChartData.h - 4}
                    textAnchor="middle" fontSize="9" fontFamily="Geist Mono, monospace"
                    fill="var(--eco-fg4)"
                  >{label.label}</text>
                ))}

                {/* Area fills + lines */}
                {dailyChartData.lines.map((line) => {
                  const lastPt = line.points[line.points.length - 1];
                  const firstPt = line.points[0];
                  const bottomY = dailyChartData.marginTop + dailyChartData.plotH;
                  return (
                    <g key={line.currency}>
                      <path
                        d={`${line.path} L${lastPt.x},${bottomY} L${firstPt.x},${bottomY} Z`}
                        fill={`url(#grad-${line.currency})`}
                      />
                      <path d={line.path} fill="none" stroke={line.color} strokeWidth="1.5" />
                    </g>
                  );
                })}

                {/* Hover crosshair */}
                {hoverIndex !== null && dailyChartData.lines[0] && (() => {
                  const x = dailyChartData.lines[0].points[hoverIndex].x;
                  return (
                    <g>
                      <line
                        x1={x} x2={x}
                        y1={dailyChartData.marginTop} y2={dailyChartData.marginTop + dailyChartData.plotH}
                        stroke="var(--eco-fg4)" strokeWidth="0.75" strokeDasharray="3 2"
                      />
                      {dailyChartData.lines.map((line) => (
                        <g key={line.currency}>
                          <circle cx={x} cy={line.points[hoverIndex].y} r="4" fill={line.color} />
                          <circle cx={x} cy={line.points[hoverIndex].y} r="7" fill={line.color} opacity="0.2" />
                        </g>
                      ))}
                    </g>
                  );
                })()}
              </svg>

              {/* Tooltip */}
              {hoverIndex !== null && dailyChartData.daily[hoverIndex] && (
                <div
                  className={s.chartTooltip}
                  style={{
                    left: `${(dailyChartData.lines[0].points[hoverIndex].x / dailyChartData.w) * 100}%`,
                  }}
                >
                  <div className={s.tooltipDate}>
                    {dayjs(dailyChartData.daily[hoverIndex].date).format('ddd DD MMM')}
                  </div>
                  {dailyChartData.lines.map((line) => (
                    <div key={line.currency} className={s.tooltipRow}>
                      <span className={s.tooltipDot} style={{ background: line.color }} />
                      <span className={s.tooltipCur}>{line.currency}</span>
                      <span className={s.tooltipVal}>{formatCurrency(line.values[hoverIndex], line.currency)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Legend */}
              <div className={s.heroChartLegend}>
                {dailyChartData.lines.map((line) => (
                  <span key={line.currency} className={s.heroLegendItem}>
                    <span className={s.heroLegendDot} style={{ background: line.color }} />
                    {line.currency}
                  </span>
                ))}
              </div>
            </div>
          )}
        </article>

        {/* Stat: Flow per currency */}
        <article className={s.flowCard}>
          <div className={s.cardLabel}>
            <span className={s.cardDot} />
            flujo{dateRange ? '' : ' · 30d'}
          </div>

          {flowByCurrency.length > 0 ? flowByCurrency.map((flow, idx) => {
            const incPct = flow.total > 0 ? (flow.income / flow.total) * 100 : 50;
            const expPct = 100 - incPct;
            const incAngle = flow.total > 0 ? (flow.income / flow.total) * 359.99 : 180;
            const icon = getCurrencyIcon(flow.currency);

            return (
              <div key={flow.currency}>
                {idx > 0 && <div className={s.flowDivider} />}
                <div className={s.flowCurRow}>
                  {/* Donut */}
                  <div className={s.flowDonut}>
                    <svg viewBox="0 0 64 64">
                      {/* Background ring */}
                      <circle cx="32" cy="32" r="24" fill="none" stroke="var(--eco-surface3)" strokeWidth="7" />
                      {/* Income arc */}
                      <path d={describeArc(32, 32, 24, 0, incAngle)} fill="none" stroke="var(--eco-pos)" strokeWidth="7" strokeLinecap="round" />
                      {/* Expense arc */}
                      <path d={describeArc(32, 32, 24, incAngle, 359.99)} fill="none" stroke="var(--eco-neg)" strokeWidth="7" strokeLinecap="round" />
                    </svg>
                    <div className={s.flowDonutCenter}>
                      {icon
                        ? <img src={icon} alt={flow.currency} className={s.flowDonutIcon} />
                        : <span className={s.flowDonutCode}>{flow.currency}</span>
                      }
                    </div>
                  </div>

                  {/* Values */}
                  <div className={s.flowCurData}>
                    <div className={s.flowCurTitle}>{flow.currency}</div>
                    <div className={s.flowCurLine}>
                      <span className={s.flowCurDot} style={{ background: 'var(--eco-pos)' }} />
                      <span className={s.flowCurLabel}>Ingresos</span>
                      <span className={s.flowCurVal}>{formatCurrency(flow.income, flow.currency)}</span>
                      <span className={s.flowCurPct}>{incPct.toFixed(0)}%</span>
                    </div>
                    <div className={s.flowCurLine}>
                      <span className={s.flowCurDot} style={{ background: 'var(--eco-neg)' }} />
                      <span className={s.flowCurLabel}>Gastos</span>
                      <span className={s.flowCurVal}>{formatCurrency(flow.expense, flow.currency)}</span>
                      <span className={s.flowCurPct}>{expPct.toFixed(0)}%</span>
                    </div>
                    <div className={s.flowCurLine}>
                      <span className={s.flowCurDot} style={{ background: 'var(--eco-accent)' }} />
                      <span className={s.flowCurLabel}>Neto</span>
                      <span className={`${s.flowCurVal} ${flow.income - flow.expense >= 0 ? s.flowNetPos : s.flowNetNeg}`}>
                        {flow.income - flow.expense >= 0 ? '+' : ''}{formatCurrency(flow.income - flow.expense, flow.currency)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          }) : <span style={{ color: 'var(--eco-fg3)', fontSize: 13 }}>Sin movimientos</span>}
        </article>

        {/* Stat: Debts */}
        <article className={s.statCard}>
          <div className={s.cardLabel}>
            <span className={s.cardDot} />
            deudas abiertas
          </div>
          <div className={s.statNum}>
            {Object.keys(pendingDebtsReceivable).length > 0 || Object.keys(pendingDebtsPayable).length > 0
              ? <span style={{ fontSize: 20 }}>neto</span>
              : <span style={{ color: 'var(--eco-fg3)' }}>—</span>
            }
          </div>
          <div className={s.statNote}>
            {Object.entries(pendingDebtsReceivable).map(([cur, amt]) => (
              <span key={`r-${cur}`} style={{ color: 'var(--eco-pos)' }}>cobro {formatCurrency(amt, cur)}</span>
            ))}
            {Object.entries(pendingDebtsPayable).map(([cur, amt]) => (
              <span key={`p-${cur}`} style={{ color: 'var(--eco-neg)' }}>pago {formatCurrency(amt, cur)}</span>
            ))}
          </div>
          <div className={s.statBar}>
            <div className={s.statBarFill} style={{ width: '62%' }} />
          </div>
          <div className={s.multiCur}>
            {Object.entries(pendingDebtsReceivable).map(([cur, amt]) => (
              <span key={cur}>{formatCurrency(amt, cur)} {cur.toLowerCase()}</span>
            ))}
          </div>
        </article>
      </section>

      {/* ═══════ ACCOUNT BALANCES ═══════ */}
      {balanceByCurrency.length > 0 && (
        <article className={s.balanceCard}>
          <div className={s.balanceCardLabel}>saldo total de cuentas</div>
          <div className={s.balanceList}>
            {balanceByCurrency.map(([currency, accs]) => {
              const total = currencyTotals[currency] ?? 0;
              const prev = balance30dAgo[currency] ?? 0;
              const pct = prev !== 0 ? ((total - prev) / Math.abs(prev)) * 100 : null;
              const icon = getCurrencyIcon(currency);
              const expanded = expandedCurrencies.has(currency);

              return (
                <div key={currency} className={s.balanceCurGroup}>
                  <div className={s.balanceCurRow} onClick={() => toggleCurrency(currency)}>
                    <div className={s.balanceCurLeft}>
                      {icon
                        ? <img src={icon} alt={currency} className={s.balanceCurIcon} />
                        : <span className={s.balanceCurFallback}>{currency[0]}</span>
                      }
                      <span className={s.balanceCurCode}>{currency}</span>
                    </div>
                    <div className={s.balanceCurRight}>
                      <span className={s.balanceCurAmt}>{formatCurrency(total, currency)}</span>
                      {pct !== null && (
                        <span className={pct >= 0 ? s.balancePctPos : s.balancePctNeg}>
                          {pct >= 0 ? '↑' : '↓'} {Math.abs(pct).toFixed(1)}%
                        </span>
                      )}
                      <span className={s.balanceChevron}>{expanded ? '‹' : '›'}</span>
                    </div>
                  </div>
                  {expanded && (
                    <div className={s.balanceAccList}>
                      {accs.map((acc, i) => (
                        <div key={i} className={s.balanceAccRow}>
                          <span className={s.balanceAccName}>{acc.name}</span>
                          <span className={s.balanceAccAmt}>{formatCurrency(acc.balance, currency)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </article>
      )}

      {/* ═══════ LEDGER ═══════ */}
      <section className={s.ledgerCard}>
        <header className={s.ledgerHead}>
          <h3 className={s.ledgerTitle}>Libro de movimientos</h3>
          <span className={s.ledgerCount}>{transactions.length} recientes</span>
          <div className={s.seg}>
            {[
              { key: 'ALL', label: 'Todos', count: typeCounts.ALL },
              { key: 'INCOME', label: 'Ingresos', count: typeCounts.INCOME },
              { key: 'EXPENSE', label: 'Gastos', count: typeCounts.EXPENSE },
              { key: 'TRANSFER', label: 'Transfer.', count: typeCounts.TRANSFER },
            ].map((item) => (
              <button
                key={item.key}
                className={typeFilter === item.key ? s.segBtnOn : s.segBtn}
                onClick={() => setTypeFilter(item.key)}
              >
                {item.label}
                <span className={s.segMini}>{item.count}</span>
              </button>
            ))}
          </div>
        </header>

        {filteredTransactions.length === 0 ? (
          <div className={s.emptyState}>{t('dashboard.noData')}</div>
        ) : isMobile ? (
          /* ---- MOBILE ---- */
          filteredTransactions.slice(0, 10).map((tx) => {
            const currency = tx.account?.currency ?? 'USD';
            const isOutgoing = ['TRANSFER', 'EXCHANGE'].includes(tx.type) && !!(tx as any).linkedTransactionId;
            const prefix = getAmtPrefix(tx.type, isOutgoing);
            const colorClass = getAmtClass(tx.type, isOutgoing);

            return (
              <div key={tx.id} className={s.mobileCard}>
                <span className={`${s.typeDot} ${getTypeDotClass(tx.type)}`} />
                <div className={s.mobileCardLeft}>
                  <div className={s.mobileCardDesc}>{tx.description}</div>
                  <div className={s.mobileCardSub}>
                    {formatDate(tx.date)}
                    {tx.account && ` · ${tx.account.name}`}
                  </div>
                </div>
                <div className={`${s.mobileCardAmt} ${colorClass}`}>
                  {prefix}{formatCurrency(Math.abs(tx.amount), currency)}
                </div>
              </div>
            );
          })
        ) : (
          /* ---- DESKTOP GRID ---- */
          <div className={s.ledgerGrid}>
            {/* Headers */}
            <div className={s.hdr}>Fecha</div>
            <div className={s.hdrCenter}>T</div>
            <div className={s.hdr}>Descripcion</div>
            <div className={s.hdr}>Categoria</div>
            <div className={s.hdr}>Cuenta</div>
            <div className={s.hdrRight}>Monto</div>

            {/* Day groups with rows */}
            {dayGroups.map((group) => (
              <div key={group.label} style={{ display: 'contents' }}>
                {/* Day header */}
                <div className={s.dayHeader}>
                  <span>{group.label}</span>
                  <span className={s.dayTotal}>
                    día: {Object.entries(computeDayTotal(group.txs)).map(([cur, net], i) => (
                      <span key={cur} className={net >= 0 ? s.dayTotalPos : s.dayTotalNeg}>
                        {i > 0 && ' · '}
                        {net >= 0 ? '+' : ''}{formatCurrency(net, cur)} {cur.toLowerCase()}
                      </span>
                    ))}
                  </span>
                </div>

                {/* Rows */}
                {group.txs.map((tx) => {
                  const currency = tx.account?.currency ?? 'USD';
                  const isOutgoing = ['TRANSFER', 'EXCHANGE'].includes(tx.type) && !!(tx as any).linkedTransactionId;
                  const prefix = getAmtPrefix(tx.type, isOutgoing);
                  const amtClass = getAmtClass(tx.type, isOutgoing);
                  const time = dayjs(tx.date).format('HH:mm');

                  return (
                    <div key={tx.id} className={s.row}>
                      <div className={s.cDate}>{time}</div>
                      <div className={s.cType}>
                        <span className={`${s.typeDot} ${getTypeDotClass(tx.type)}`} />
                      </div>
                      <div className={s.cDesc}>
                        <div className={s.descTitle}>{tx.description}</div>
                        {tx.notes && <div className={s.descSub}>{tx.notes}</div>}
                      </div>
                      <div className={s.cCat}>
                        {tx.category ? (
                          <span className={s.catChip}>
                            <span className={s.catSq} style={{ background: tx.category.color ?? 'var(--eco-fg4)' }} />
                            {tx.category.name}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--eco-fg4)' }}>—</span>
                        )}
                      </div>
                      <div className={s.cAcc}>
                        {tx.account ? (
                          <span className={s.catChip}>
                            <span className={s.catSq} style={{ background: 'var(--eco-accent)' }} />
                            {tx.account.name}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--eco-fg4)' }}>—</span>
                        )}
                      </div>
                      <div className={`${s.cAmt} ${amtClass}`}>
                        <span className={s.amtCur}>{prefix}</span>
                        {formatCurrency(Math.abs(tx.amount), currency)}
                        <span className={s.amtCurSuffix}>{currency.toLowerCase()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        <footer className={s.ledgerFoot}>
          <span className={s.ledgerFootCount}>
            mostrando {Math.min(filteredTransactions.length, 10)} de {filteredTransactions.length}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={() => navigate('/transactions')}>
              Ver todo →
            </Button>
          </div>
        </footer>
      </section>
    </div>
  );
}
