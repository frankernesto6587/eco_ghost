import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  Row,
  Col,
  Card,
  Statistic,
  Table,
  Tag,
  Spin,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  WalletOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Column } from '@ant-design/charts';
import { TransactionType } from '@ecoghost/shared';
import type { DashboardOverview } from '@ecoghost/shared';
import { dashboardService } from '@/services/dashboard.service';
import { formatCurrency, formatDate } from '@/lib/formatters';

const { Title } = Typography;

/** Shape of a transaction coming from the API overview endpoint. */
interface RecentTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: TransactionType;
  categoryId: string | null;
  accountId: string;
  orgId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  category: { id: string; name: string; icon: string | null; color: string | null } | null;
  account: { id: string; name: string; type: string; currency: string; icon: string | null };
}

/** Row for the chart data. */
interface ChartDatum {
  month: string;
  value: number;
  type: string;
}

const TYPE_COLORS: Record<TransactionType, string> = {
  [TransactionType.INCOME]: 'green',
  [TransactionType.EXPENSE]: 'red',
  [TransactionType.TRANSFER]: 'blue',
};

export default function DashboardPage() {
  const { t } = useTranslation();

  const { data: overview, isLoading } = useQuery<DashboardOverview>({
    queryKey: ['dashboard', 'overview'],
    queryFn: dashboardService.getOverview,
  });

  // ---------------------------------------------------------------------------
  // Chart data: use monthlyTrend from API (already aggregated per month)
  // ---------------------------------------------------------------------------
  const chartData = useMemo<ChartDatum[]>(() => {
    const trend = (overview as DashboardOverview & { monthlyTrend?: { month: string; income: number; expense: number }[] })?.monthlyTrend;
    if (!trend || trend.length === 0) return [];

    const result: ChartDatum[] = [];
    for (const entry of trend) {
      result.push({
        month: entry.month,
        value: entry.income / 100,
        type: t('dashboard.income'),
      });
      result.push({
        month: entry.month,
        value: entry.expense / 100,
        type: t('dashboard.expense'),
      });
    }

    return result;
  }, [overview, t]);

  // ---------------------------------------------------------------------------
  // Table columns
  // ---------------------------------------------------------------------------
  const columns = useMemo<ColumnsType<RecentTransaction>>(
    () => [
      {
        title: t('dashboard.date'),
        dataIndex: 'date',
        key: 'date',
        width: 120,
        render: (date: string) => formatDate(date),
      },
      {
        title: t('dashboard.description'),
        dataIndex: 'description',
        key: 'description',
        ellipsis: true,
      },
      {
        title: t('dashboard.amount'),
        dataIndex: 'amount',
        key: 'amount',
        width: 160,
        align: 'right',
        render: (_: number, record: RecentTransaction) => {
          const currency = record.account?.currency ?? 'USD';
          const color = record.type === TransactionType.INCOME ? 'green' : 'red';
          const prefix = record.type === TransactionType.INCOME ? '+' : '-';
          return (
            <span style={{ color, fontWeight: 500 }}>
              {prefix}
              {formatCurrency(record.amount, currency)}
            </span>
          );
        },
      },
      {
        title: t('dashboard.type'),
        dataIndex: 'type',
        key: 'type',
        width: 130,
        render: (type: TransactionType) => {
          const labelKey =
            type === TransactionType.INCOME
              ? 'dashboard.income'
              : type === TransactionType.EXPENSE
                ? 'dashboard.expense'
                : 'dashboard.transfer';
          return <Tag color={TYPE_COLORS[type]}>{t(labelKey)}</Tag>;
        },
      },
      {
        title: t('dashboard.account'),
        key: 'account',
        width: 150,
        render: (_: unknown, record: RecentTransaction) =>
          record.account?.name ?? '-',
      },
    ],
    [t],
  );

  // ---------------------------------------------------------------------------
  // Chart config
  // ---------------------------------------------------------------------------
  const chartConfig = useMemo(
    () => ({
      data: chartData,
      xField: 'month' as const,
      yField: 'value' as const,
      seriesField: 'type' as const,
      isGroup: true,
      color: ['#52c41a', '#ff4d4f'],
      columnStyle: { radius: [4, 4, 0, 0] },
      label: undefined,
      legend: { position: 'top-right' as const },
      xAxis: {
        label: {
          autoRotate: false,
        },
      },
      yAxis: {
        label: {
          formatter: (v: string) => v,
        },
      },
    }),
    [chartData],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 120 }}>
        <Spin size="large" tip={t('common.loading')} />
      </div>
    );
  }

  const transactions = (overview?.recentTransactions ?? []) as unknown as RecentTransaction[];

  return (
    <div>
      <Title level={2} style={{ marginBottom: 24 }}>
        {t('dashboard.overview')}
      </Title>

      {/* ---- Stat Cards ---- */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {/* Total Balance */}
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title={t('dashboard.totalBalance')}
              prefix={<WalletOutlined />}
              value=" "
            />
            {overview?.totalBalance &&
              Object.entries(overview.totalBalance).map(([currency, amount]) => (
                <div key={currency} style={{ marginTop: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 16 }}>
                    {formatCurrency(amount, currency)}
                  </span>
                  <span style={{ marginLeft: 6, color: '#8c8c8c', fontSize: 13 }}>
                    {currency}
                  </span>
                </div>
              ))}
          </Card>
        </Col>

        {/* Month Income */}
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title={t('dashboard.monthIncome')}
              prefix={<ArrowUpOutlined />}
              value=" "
            />
            {overview?.monthIncome &&
              Object.entries(overview.monthIncome).map(([currency, amount]) => (
                <div key={currency} style={{ marginTop: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 16, color: '#3f8600' }}>
                    {formatCurrency(amount, currency)}
                  </span>
                  <span style={{ marginLeft: 6, color: '#8c8c8c', fontSize: 13 }}>
                    {currency}
                  </span>
                </div>
              ))}
          </Card>
        </Col>

        {/* Month Expense */}
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title={t('dashboard.monthExpense')}
              prefix={<ArrowDownOutlined />}
              value=" "
            />
            {overview?.monthExpense &&
              Object.entries(overview.monthExpense).map(([currency, amount]) => (
                <div key={currency} style={{ marginTop: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 16, color: '#cf1322' }}>
                    {formatCurrency(amount, currency)}
                  </span>
                  <span style={{ marginLeft: 6, color: '#8c8c8c', fontSize: 13 }}>
                    {currency}
                  </span>
                </div>
              ))}
          </Card>
        </Col>

        {/* Pending Debts */}
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title={t('dashboard.pendingDebts')}
              prefix={<WarningOutlined />}
              value=" "
            />
            <div style={{ marginTop: 4 }}>
              <span style={{ color: '#3f8600', fontWeight: 500 }}>
                {t('dashboard.receivable')}:
              </span>
              {overview?.pendingDebtsReceivable &&
                Object.entries(overview.pendingDebtsReceivable).map(([currency, amount]) => (
                  <div key={currency} style={{ marginLeft: 8 }}>
                    {formatCurrency(amount, currency)}{' '}
                    <span style={{ color: '#8c8c8c', fontSize: 12 }}>{currency}</span>
                  </div>
                ))}
            </div>
            <div style={{ marginTop: 4 }}>
              <span style={{ color: '#cf1322', fontWeight: 500 }}>
                {t('dashboard.payable')}:
              </span>
              {overview?.pendingDebtsPayable &&
                Object.entries(overview.pendingDebtsPayable).map(([currency, amount]) => (
                  <div key={currency} style={{ marginLeft: 8 }}>
                    {formatCurrency(amount, currency)}{' '}
                    <span style={{ color: '#8c8c8c', fontSize: 12 }}>{currency}</span>
                  </div>
                ))}
            </div>
          </Card>
        </Col>
      </Row>

      {/* ---- Income vs Expense Chart ---- */}
      <Card
        title={t('dashboard.incomeVsExpense')}
        style={{ marginBottom: 24 }}
      >
        {chartData.length > 0 ? (
          <Column {...chartConfig} height={300} />
        ) : (
          <div style={{ textAlign: 'center', padding: 40, color: '#8c8c8c' }}>
            {t('dashboard.noData')}
          </div>
        )}
      </Card>

      {/* ---- Recent Transactions Table ---- */}
      <Card title={t('dashboard.recentTransactions')}>
        <Table<RecentTransaction>
          columns={columns}
          dataSource={transactions.slice(0, 10)}
          rowKey="id"
          pagination={false}
          size="middle"
          scroll={{ x: 700 }}
          locale={{ emptyText: t('dashboard.noData') }}
        />
      </Card>
    </div>
  );
}
