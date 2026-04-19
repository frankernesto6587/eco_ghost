import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Button, Spin } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { TransactionType } from '@ecoghost/shared';
import type { DashboardOverview } from '@ecoghost/shared';
import { dashboardService } from '@/services/dashboard.service';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
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

  const { data: overview, isLoading } = useQuery<DashboardOverview>({
    queryKey: ['dashboard', 'overview'],
    queryFn: dashboardService.getOverview,
  });

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

  // Sparkline from monthlyTrend
  const sparklinePath = useMemo(() => {
    const trend = (overview as DashboardOverview & { monthlyTrend?: { month: string; income: number; expense: number }[] })?.monthlyTrend;
    if (!trend || trend.length < 2) return null;
    const balances = trend.map((e) => e.income - e.expense);
    const max = Math.max(...balances);
    const min = Math.min(...balances);
    const range = max - min || 1;
    const w = 600;
    const h = 100;
    const pad = 5;
    const points = balances.map((v, i) => {
      const x = (i / (balances.length - 1)) * w;
      const y = pad + ((max - v) / range) * (h - 2 * pad);
      return `${x},${y}`;
    });
    const linePath = `M${points.join(' L')}`;
    const areaPath = `${linePath} L${w},${h} L0,${h} Z`;
    const lastX = (balances.length - 1) / (balances.length - 1) * w;
    const lastY = pad + ((max - balances[balances.length - 1]) / range) * (h - 2 * pad);
    return { linePath, areaPath, lastX, lastY };
  }, [overview]);

  // Stat helpers
  const totalBalance = overview?.totalBalance ?? {};
  const monthIncome = overview?.monthIncome ?? {};
  const monthExpense = overview?.monthExpense ?? {};
  const pendingDebtsReceivable = overview?.pendingDebtsReceivable ?? {};
  const pendingDebtsPayable = overview?.pendingDebtsPayable ?? {};

  // Calculate total for bar width %
  const totalInc = Object.values(monthIncome).reduce((a, b) => a + b, 0);
  const totalExp = Object.values(monthExpense).reduce((a, b) => a + b, 0);
  const maxStat = Math.max(totalInc, totalExp) || 1;

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
              ? Object.entries(totalBalance).map(([cur, amt], i) => (
                  <span key={cur}>
                    {i > 0 && <span style={{ color: 'var(--db-fg4)', fontSize: 18, margin: '0 8px' }}>·</span>}
                    <span className={s.heroCur}>{cur}</span>
                    {' '}{formatCurrency(amt, cur)}
                  </span>
                ))
              : <span style={{ color: 'var(--db-fg3)' }}>$0.00</span>
            }
          </div>
          {sparklinePath && (
            <div className={s.heroChart}>
              <svg viewBox="0 0 600 100" preserveAspectRatio="none">
                {/* Grid lines */}
                <g stroke="var(--db-line-soft)" strokeDasharray="2 4" strokeWidth="0.5" opacity="0.5">
                  <line x1="0" x2="600" y1="25" y2="25" />
                  <line x1="0" x2="600" y1="50" y2="50" />
                  <line x1="0" x2="600" y1="75" y2="75" />
                </g>
                {/* Area fill */}
                <path d={sparklinePath.areaPath} fill="url(#hero-grad)" />
                {/* Line */}
                <path d={sparklinePath.linePath} fill="none" stroke="var(--db-accent)" strokeWidth="1.75" />
                {/* End dot */}
                <circle cx={sparklinePath.lastX} cy={sparklinePath.lastY} r="3" fill="var(--db-accent)" />
                <circle cx={sparklinePath.lastX} cy={sparklinePath.lastY} r="7" fill="var(--db-accent)" opacity="0.22" />
                <defs>
                  <linearGradient id="hero-grad" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0" stopColor="var(--db-accent)" stopOpacity="0.28" />
                    <stop offset="1" stopColor="var(--db-accent)" stopOpacity="0" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
          )}
        </article>

        {/* Stat: Income */}
        <article className={s.statCard}>
          <div className={s.cardLabel}>
            <span className={s.cardDotPos} />
            ingresos · 30d
          </div>
          <div className={s.statNum}>
            {Object.keys(monthIncome).length > 0
              ? Object.entries(monthIncome).map(([cur, amt]) => (
                  <div key={cur}>
                    <span className={s.statCur}>{cur}</span>
                    {' '}{formatCurrency(amt, cur)}
                  </div>
                ))
              : <span style={{ color: 'var(--db-fg3)' }}>—</span>
            }
          </div>
          <div className={s.statNote}>{typeCounts.INCOME} transacciones</div>
          <div className={`${s.statBar} ${s.statBarPos}`}>
            <div className={s.statBarFill} style={{ width: `${Math.round((totalInc / maxStat) * 100)}%` }} />
          </div>
          <div className={s.multiCur}>
            {Object.entries(monthIncome).map(([cur, amt]) => (
              <span key={cur}>{formatCurrency(amt, cur)} {cur.toLowerCase()}</span>
            ))}
          </div>
        </article>

        {/* Stat: Expenses */}
        <article className={s.statCard}>
          <div className={s.cardLabel}>
            <span className={s.cardDotNeg} />
            gastos · 30d
          </div>
          <div className={s.statNum}>
            {Object.keys(monthExpense).length > 0
              ? Object.entries(monthExpense).map(([cur, amt]) => (
                  <div key={cur}>
                    <span className={s.statCur}>{cur}</span>
                    {' '}{formatCurrency(amt, cur)}
                  </div>
                ))
              : <span style={{ color: 'var(--db-fg3)' }}>—</span>
            }
          </div>
          <div className={s.statNote}>{typeCounts.EXPENSE} transacciones</div>
          <div className={`${s.statBar} ${s.statBarNeg}`}>
            <div className={s.statBarFill} style={{ width: `${Math.round((totalExp / maxStat) * 100)}%` }} />
          </div>
          <div className={s.multiCur}>
            {Object.entries(monthExpense).map(([cur, amt]) => (
              <span key={cur}>{formatCurrency(amt, cur)} {cur.toLowerCase()}</span>
            ))}
          </div>
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
              : <span style={{ color: 'var(--db-fg3)' }}>—</span>
            }
          </div>
          <div className={s.statNote}>
            {Object.entries(pendingDebtsReceivable).map(([cur, amt]) => (
              <span key={`r-${cur}`} style={{ color: 'var(--db-pos)' }}>cobro {formatCurrency(amt, cur)}</span>
            ))}
            {Object.entries(pendingDebtsPayable).map(([cur, amt]) => (
              <span key={`p-${cur}`} style={{ color: 'var(--db-neg)' }}>pago {formatCurrency(amt, cur)}</span>
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
                            <span className={s.catSq} style={{ background: tx.category.color ?? 'var(--db-fg4)' }} />
                            {tx.category.name}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--db-fg4)' }}>—</span>
                        )}
                      </div>
                      <div className={s.cAcc}>
                        {tx.account ? (
                          <span className={s.catChip}>
                            <span className={s.catSq} style={{ background: 'var(--db-accent)' }} />
                            {tx.account.name}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--db-fg4)' }}>—</span>
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
