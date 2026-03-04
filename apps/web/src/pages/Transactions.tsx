import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  App,
  Button,
  Card,
  Col,
  Collapse,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  TreeSelect,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  DollarOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  SwapOutlined,
  LoadingOutlined,
  FilterOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';

import {
  transactionsService,
  type Transaction,
  type TransactionListResponse,
  type CreateTransactionDto,
  type TransactionFilters,
} from '@/services/transactions.service';
import { accountsService, type Account } from '@/services/accounts.service';
import { categoriesService, type Category } from '@/services/categories.service';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { usePermissions } from '@/hooks/usePermissions';
import { useIsMobile } from '@/hooks/useIsMobile';
import CategoryIcon from '@/components/common/CategoryIcon';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { TextArea } = Input;

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Filters {
  dateRange: [Dayjs, Dayjs] | null;
  type: string | undefined;
  accountId: string | undefined;
  categoryId: string | undefined;
}

interface TransactionFormValues {
  date: Dayjs;
  description: string;
  amount: number;
  type: string;
  accountId: string;
  toAccountId?: string;
  categoryId?: string;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildParams(filters: Filters, cursor?: string): TransactionFilters {
  const params: TransactionFilters = { limit: PAGE_SIZE };
  if (filters.type) params.type = filters.type;
  if (filters.accountId) params.accountId = filters.accountId;
  if (filters.categoryId) params.categoryId = filters.categoryId;
  if (filters.dateRange) {
    params.from = filters.dateRange[0].startOf('day').toISOString();
    params.to = filters.dateRange[1].endOf('day').toISOString();
  }
  if (cursor) params.cursor = cursor;
  return params;
}

function flattenCategories(
  categories: Category[],
): { id: string; title: React.ReactNode; value: string; children?: ReturnType<typeof flattenCategories> }[] {
  return categories.map((cat) => ({
    id: cat.id,
    title: (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <CategoryIcon name={cat.icon} style={{ color: cat.color ?? '#8c8c8c' }} />
        {cat.name}
      </span>
    ),
    value: cat.id,
    children: cat.children?.length ? flattenCategories(cat.children) : undefined,
  }));
}

function getTypeColor(type: string): string {
  switch (type) {
    case 'INCOME':
      return 'green';
    case 'EXPENSE':
      return 'red';
    case 'TRANSFER':
      return 'blue';
    default:
      return 'default';
  }
}

function getTypeLabel(type: string): string {
  switch (type) {
    case 'INCOME':
      return 'Ingreso';
    case 'EXPENSE':
      return 'Gasto';
    case 'TRANSFER':
      return 'Transferencia';
    default:
      return type;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function TransactionCard({
  transaction,
  canEdit,
  onEdit,
  onDelete,
}: {
  transaction: Transaction;
  canEdit: boolean;
  onEdit: (t: Transaction) => void;
  onDelete: (t: Transaction) => void;
}) {
  const currency = transaction.account?.currency ?? 'USD';
  const color = transaction.type === 'INCOME' ? '#52c41a' : transaction.type === 'EXPENSE' ? '#ff4d4f' : '#1677ff';
  const prefix = transaction.type === 'INCOME' ? '+' : transaction.type === 'EXPENSE' ? '-' : '';

  return (
    <Card
      size="small"
      style={{ marginBottom: 8 }}
      onClick={() => canEdit && onEdit(transaction)}
      hoverable={canEdit}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text strong ellipsis style={{ display: 'block', marginBottom: 4 }}>
            {transaction.description}
          </Text>
          <Space size={4} wrap>
            <Tag color={getTypeColor(transaction.type)}>{getTypeLabel(transaction.type)}</Tag>
            {transaction.category && <Tag>{transaction.category.name}</Tag>}
          </Space>
          <div style={{ marginTop: 4 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {formatDate(transaction.date)}
              {transaction.account && ` · ${transaction.account.name}`}
            </Text>
          </div>
        </div>
        <div style={{ textAlign: 'right', marginLeft: 8, flexShrink: 0 }}>
          <Text strong style={{ color, fontSize: 15 }}>
            {prefix}{formatCurrency(Math.abs(transaction.amount), currency)}
          </Text>
          {canEdit && (
            <div style={{ marginTop: 4 }}>
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(transaction);
                }}
              />
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function TransactionsPage() {
  const { t } = useTranslation();
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const { canWrite, canManageOrg } = usePermissions();
  const isMobile = useIsMobile();
  const [form] = Form.useForm<TransactionFormValues>();
  const watchedType = Form.useWatch('type', form);

  // ---- State ----
  const [filters, setFilters] = useState<Filters>({
    dateRange: null,
    type: undefined,
    accountId: undefined,
    categoryId: undefined,
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // ---- Data fetching ----
  const transactionsQuery = useQuery<TransactionListResponse>({
    queryKey: ['transactions', filters],
    queryFn: async () => {
      const params = buildParams(filters);
      return transactionsService.getAll(params);
    },
  });

  // Sync local pagination state from query result (works for both refetch and cache hits)
  useEffect(() => {
    if (transactionsQuery.data) {
      setAllTransactions(transactionsQuery.data.data);
      setCursor(transactionsQuery.data.meta.cursor);
      setHasMore(transactionsQuery.data.meta.hasMore);
    }
  }, [transactionsQuery.data]);

  const loadMoreMutation = useMutation({
    mutationFn: async () => {
      if (!cursor) return null;
      const params = buildParams(filters, cursor);
      return transactionsService.getAll(params);
    },
    onSuccess: (result) => {
      if (result) {
        setAllTransactions((prev) => [...prev, ...result.data]);
        setCursor(result.meta.cursor);
        setHasMore(result.meta.hasMore);
      }
    },
    onError: () => {
      message.error('Error al cargar mas transacciones');
    },
  });

  const summaryParams = useMemo(() => {
    if (!filters.dateRange) return undefined;
    return {
      from: filters.dateRange[0].startOf('day').toISOString(),
      to: filters.dateRange[1].endOf('day').toISOString(),
    };
  }, [filters.dateRange]);

  const summaryQuery = useQuery({
    queryKey: ['transactions-summary', summaryParams],
    queryFn: () => transactionsService.getSummary(summaryParams ?? undefined),
  });

  const accountsQuery = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: () => accountsService.getAll(),
  });

  const categoriesQuery = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: () => categoriesService.getAll(),
  });

  const categoryTree = useMemo(
    () => (categoriesQuery.data ? flattenCategories(categoriesQuery.data) : []),
    [categoriesQuery.data],
  );

  // ---- Mutations ----
  const createMutation = useMutation({
    mutationFn: (dto: CreateTransactionDto) => transactionsService.create(dto),
    onSuccess: () => {
      message.success('Transaccion creada exitosamente');
      invalidateAll();
      closeModal();
    },
    onError: () => {
      message.error('Error al crear la transaccion');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: Partial<CreateTransactionDto> }) =>
      transactionsService.update(id, dto),
    onSuccess: () => {
      message.success('Transaccion actualizada exitosamente');
      invalidateAll();
      closeModal();
    },
    onError: () => {
      message.error('Error al actualizar la transaccion');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => transactionsService.remove(id),
    onSuccess: () => {
      message.success('Transaccion eliminada exitosamente');
      invalidateAll();
    },
    onError: () => {
      message.error('Error al eliminar la transaccion');
    },
  });

  // ---- Helpers ----
  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    queryClient.invalidateQueries({ queryKey: ['transactions-summary'] });
  }, [queryClient]);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditingTransaction(null);
    form.resetFields();
  }, [form]);

  const openCreateModal = useCallback(() => {
    setEditingTransaction(null);
    form.resetFields();
    form.setFieldsValue({
      date: dayjs(),
      type: 'EXPENSE',
    });
    setModalOpen(true);
  }, [form]);

  const openEditModal = useCallback(
    (transaction: Transaction) => {
      setEditingTransaction(transaction);
      form.setFieldsValue({
        date: dayjs(transaction.date),
        description: transaction.description,
        amount: transaction.amount / 100,
        type: transaction.type,
        accountId: transaction.accountId,
        categoryId: transaction.categoryId ?? undefined,
        notes: transaction.notes ?? undefined,
      });
      setModalOpen(true);
    },
    [form],
  );

  const handleDelete = useCallback(
    (transaction: Transaction) => {
      modal.confirm({
        title: 'Eliminar transaccion',
        content: `Estas seguro de que deseas eliminar "${transaction.description}"? Esta accion no se puede deshacer.`,
        okText: t('common.delete'),
        okType: 'danger',
        cancelText: t('common.cancel'),
        onOk: () => deleteMutation.mutateAsync(transaction.id),
      });
    },
    [deleteMutation, t, modal],
  );

  const handleFormSubmit = useCallback(async () => {
    try {
      const values = await form.validateFields();
      const dto: CreateTransactionDto = {
        date: values.date.toISOString(),
        description: values.description.trim(),
        amount: Math.round(values.amount * 100),
        type: values.type,
        accountId: values.accountId,
        categoryId: values.categoryId,
        notes: values.notes?.trim() || undefined,
        ...(values.type === 'TRANSFER' && values.toAccountId ? { toAccountId: values.toAccountId } : {}),
      };

      if (editingTransaction) {
        updateMutation.mutate({ id: editingTransaction.id, dto });
      } else {
        createMutation.mutate(dto);
      }
    } catch {
      // form validation failed - antd shows inline errors
    }
  }, [form, editingTransaction, createMutation, updateMutation]);

  // ---- Filter handlers ----
  const handleDateRangeChange = useCallback(
    (dates: [Dayjs | null, Dayjs | null] | null) => {
      setFilters((prev) => ({
        ...prev,
        dateRange: dates && dates[0] && dates[1] ? [dates[0], dates[1]] : null,
      }));
    },
    [],
  );

  const handleTypeChange = useCallback((value: string | undefined) => {
    setFilters((prev) => ({ ...prev, type: value }));
  }, []);

  const handleAccountChange = useCallback((value: string | undefined) => {
    setFilters((prev) => ({ ...prev, accountId: value }));
  }, []);

  const handleCategoryChange = useCallback((value: string | undefined) => {
    setFilters((prev) => ({ ...prev, categoryId: value }));
  }, []);

  // ---- Table columns ----
  const columns = useMemo<ColumnsType<Transaction>>(
    () => [
      {
        title: 'Fecha',
        dataIndex: 'date',
        key: 'date',
        width: 120,
        render: (date: string) => formatDate(date),
      },
      {
        title: 'Descripcion',
        dataIndex: 'description',
        key: 'description',
        ellipsis: true,
      },
      {
        title: 'Monto',
        dataIndex: 'amount',
        key: 'amount',
        width: 150,
        align: 'right',
        render: (amount: number, record: Transaction) => {
          const currency = record.account?.currency ?? 'USD';
          const color = record.type === 'INCOME' ? '#52c41a' : record.type === 'EXPENSE' ? '#ff4d4f' : '#1677ff';
          return (
            <Text strong style={{ color }}>
              {record.type === 'INCOME' ? '+' : record.type === 'EXPENSE' ? '-' : ''}
              {formatCurrency(Math.abs(amount), currency)}
            </Text>
          );
        },
      },
      {
        title: 'Tipo',
        dataIndex: 'type',
        key: 'type',
        width: 130,
        render: (type: string) => (
          <Tag color={getTypeColor(type)} icon={
            type === 'INCOME' ? <ArrowUpOutlined /> : type === 'EXPENSE' ? <ArrowDownOutlined /> : <SwapOutlined />
          }>
            {getTypeLabel(type)}
          </Tag>
        ),
      },
      {
        title: 'Categoria',
        key: 'category',
        width: 150,
        render: (_: unknown, record: Transaction) =>
          record.category ? (
            <Tag>{record.category.name}</Tag>
          ) : (
            <Text type="secondary">--</Text>
          ),
      },
      {
        title: 'Cuenta',
        key: 'account',
        width: 150,
        render: (_: unknown, record: Transaction) =>
          record.account ? record.account.name : <Text type="secondary">--</Text>,
      },
      ...(canManageOrg
        ? [
            {
              title: 'Acciones',
              key: 'actions',
              width: 100,
              align: 'center' as const,
              render: (_: unknown, record: Transaction) => (
                <Space size="small">
                  <Button
                    type="text"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditModal(record);
                    }}
                  />
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    loading={deleteMutation.isPending}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(record);
                    }}
                  />
                </Space>
              ),
            },
          ]
        : []),
    ],
    [canManageOrg, openEditModal, handleDelete, deleteMutation.isPending],
  );

  // ---- Render ----
  const isLoading = transactionsQuery.isLoading;
  const isError = transactionsQuery.isError;
  const summary = summaryQuery.data;
  const accounts = accountsQuery.data ?? [];
  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 8 }}>
        <Title level={isMobile ? 3 : 2} style={{ margin: 0 }}>
          {t('nav.transactions')}
        </Title>
        {canWrite && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
            {isMobile ? 'Nueva' : 'Nueva transaccion'}
          </Button>
        )}
      </div>

      {/* Summary Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card loading={summaryQuery.isLoading}>
            <Statistic
              title="Ingresos"
              prefix={<ArrowUpOutlined />}
              valueStyle={{ color: '#52c41a' }}
              value=" "
            />
            {summary?.income &&
              Object.entries(summary.income).map(([currency, amount]) => (
                <div key={currency} style={{ marginTop: 4 }}>
                  <Text strong style={{ color: '#52c41a', fontSize: 16 }}>
                    {formatCurrency(amount, currency)}
                  </Text>
                  <Text type="secondary" style={{ marginLeft: 6, fontSize: 13 }}>
                    {currency}
                  </Text>
                </div>
              ))}
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card loading={summaryQuery.isLoading}>
            <Statistic
              title="Gastos"
              prefix={<ArrowDownOutlined />}
              valueStyle={{ color: '#ff4d4f' }}
              value=" "
            />
            {summary?.expense &&
              Object.entries(summary.expense).map(([currency, amount]) => (
                <div key={currency} style={{ marginTop: 4 }}>
                  <Text strong style={{ color: '#ff4d4f', fontSize: 16 }}>
                    {formatCurrency(amount, currency)}
                  </Text>
                  <Text type="secondary" style={{ marginLeft: 6, fontSize: 13 }}>
                    {currency}
                  </Text>
                </div>
              ))}
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card loading={summaryQuery.isLoading}>
            <Statistic
              title="Balance"
              prefix={<DollarOutlined />}
              value=" "
            />
            {summary?.balance &&
              Object.entries(summary.balance).map(([currency, amount]) => (
                <div key={currency} style={{ marginTop: 4 }}>
                  <Text strong style={{ color: amount >= 0 ? '#52c41a' : '#ff4d4f', fontSize: 16 }}>
                    {formatCurrency(amount, currency)}
                  </Text>
                  <Text type="secondary" style={{ marginLeft: 6, fontSize: 13 }}>
                    {currency}
                  </Text>
                </div>
              ))}
          </Card>
        </Col>
      </Row>

      {/* Filter Bar */}
      {isMobile ? (
        <Collapse
          ghost
          style={{ marginBottom: 16 }}
          items={[{
            key: 'filters',
            label: <Space><FilterOutlined />Filtros</Space>,
            children: (
              <Row gutter={[12, 12]}>
                <Col span={24}>
                  <RangePicker
                    style={{ width: '100%' }}
                    placeholder={['Fecha inicio', 'Fecha fin']}
                    value={filters.dateRange}
                    onChange={handleDateRangeChange}
                    allowClear
                  />
                </Col>
                <Col span={24}>
                  <Select style={{ width: '100%' }} placeholder="Tipo" value={filters.type} onChange={handleTypeChange} allowClear
                    options={[{ label: 'Ingreso', value: 'INCOME' }, { label: 'Gasto', value: 'EXPENSE' }, { label: 'Transferencia', value: 'TRANSFER' }]}
                  />
                </Col>
                <Col span={24}>
                  <Select style={{ width: '100%' }} placeholder="Cuenta" value={filters.accountId} onChange={handleAccountChange} allowClear loading={accountsQuery.isLoading}
                    options={accounts.map((acc) => ({ label: acc.name, value: acc.id }))}
                  />
                </Col>
                <Col span={24}>
                  <TreeSelect style={{ width: '100%' }} placeholder="Categoria" value={filters.categoryId} onChange={handleCategoryChange} allowClear treeData={categoryTree} loading={categoriesQuery.isLoading} treeDefaultExpandAll />
                </Col>
                <Col span={24}>
                  <Button block onClick={() => setFilters({ dateRange: null, type: undefined, accountId: undefined, categoryId: undefined })}>
                    Limpiar
                  </Button>
                </Col>
              </Row>
            ),
          }]}
        />
      ) : (
        <Card style={{ marginBottom: 24 }}>
          <Row gutter={[12, 12]} align="middle">
            <Col xs={24} sm={12} md={6}>
              <RangePicker
                style={{ width: '100%' }}
                placeholder={['Fecha inicio', 'Fecha fin']}
                value={filters.dateRange}
                onChange={handleDateRangeChange}
                allowClear
              />
            </Col>
            <Col xs={24} sm={12} md={5}>
              <Select
                style={{ width: '100%' }}
                placeholder="Tipo"
                value={filters.type}
                onChange={handleTypeChange}
                allowClear
                options={[
                  { label: 'Ingreso', value: 'INCOME' },
                  { label: 'Gasto', value: 'EXPENSE' },
                  { label: 'Transferencia', value: 'TRANSFER' },
                ]}
              />
            </Col>
            <Col xs={24} sm={12} md={5}>
              <Select
                style={{ width: '100%' }}
                placeholder="Cuenta"
                value={filters.accountId}
                onChange={handleAccountChange}
                allowClear
                loading={accountsQuery.isLoading}
                options={accounts.map((acc) => ({
                  label: acc.name,
                  value: acc.id,
                }))}
              />
            </Col>
            <Col xs={24} sm={12} md={5}>
              <TreeSelect
                style={{ width: '100%' }}
                placeholder="Categoria"
                value={filters.categoryId}
                onChange={handleCategoryChange}
                allowClear
                treeData={categoryTree}
                loading={categoriesQuery.isLoading}
                treeDefaultExpandAll
              />
            </Col>
            <Col xs={24} md={3}>
              <Button
                block
                onClick={() =>
                  setFilters({
                    dateRange: null,
                    type: undefined,
                    accountId: undefined,
                    categoryId: undefined,
                  })
                }
              >
                Limpiar
              </Button>
            </Col>
          </Row>
        </Card>
      )}

      {/* Transactions Table / Cards */}
      <Card bodyStyle={isMobile ? { padding: 12 } : undefined}>
        {isError && (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <Text type="danger">Error al cargar las transacciones. Intente de nuevo.</Text>
            <br />
            <Button
              style={{ marginTop: 8 }}
              onClick={() => transactionsQuery.refetch()}
            >
              Reintentar
            </Button>
          </div>
        )}

        {isMobile ? (
          isLoading ? (
            <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
          ) : allTransactions.length === 0 ? (
            <Text type="secondary">No hay transacciones</Text>
          ) : (
            allTransactions.map((tx) => (
              <TransactionCard
                key={tx.id}
                transaction={tx}
                canEdit={canManageOrg}
                onEdit={openEditModal}
                onDelete={handleDelete}
              />
            ))
          )
        ) : (
          <Table<Transaction>
            dataSource={allTransactions}
            columns={columns}
            rowKey="id"
            loading={isLoading}
            pagination={false}
            scroll={{ x: 800 }}
            locale={{
              emptyText: isLoading ? 'Cargando...' : 'No hay transacciones',
            }}
            onRow={(record) => ({
              style: { cursor: canManageOrg ? 'pointer' : 'default' },
              onClick: () => {
                if (canManageOrg) {
                  openEditModal(record);
                }
              },
            })}
          />
        )}

        {/* Load More */}
        {hasMore && (
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <Button
              onClick={() => loadMoreMutation.mutate()}
              loading={loadMoreMutation.isPending}
              icon={loadMoreMutation.isPending ? <LoadingOutlined /> : undefined}
            >
              Cargar mas
            </Button>
          </div>
        )}
      </Card>

      {/* Create / Edit Modal */}
      <Modal
        title={editingTransaction ? 'Editar transaccion' : 'Nueva transaccion'}
        open={modalOpen}
        onCancel={closeModal}
        onOk={handleFormSubmit}
        okText={editingTransaction ? t('common.save') : t('common.create')}
        cancelText={t('common.cancel')}
        confirmLoading={isSaving}
        destroyOnClose
        width={isMobile ? '100%' : 560}
      >
        <Spin spinning={isSaving}>
          <Form
            form={form}
            layout="vertical"
            requiredMark="optional"
            initialValues={{
              date: dayjs(),
              type: 'EXPENSE',
            }}
          >
            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <Form.Item
                  name="date"
                  label="Fecha"
                  rules={[{ required: true, message: 'La fecha es requerida' }]}
                >
                  <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item
                  name="type"
                  label="Tipo"
                  rules={[{ required: true, message: 'El tipo es requerido' }]}
                >
                  <Select
                    options={[
                      { label: 'Ingreso', value: 'INCOME' },
                      { label: 'Gasto', value: 'EXPENSE' },
                      { label: 'Transferencia', value: 'TRANSFER' },
                    ]}
                  />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item
              name="description"
              label="Descripcion"
              rules={[
                { required: true, message: 'La descripcion es requerida' },
                { max: 255, message: 'Maximo 255 caracteres' },
              ]}
            >
              <Input placeholder="Ej: Compra de supermercado" />
            </Form.Item>

            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <Form.Item
                  name="amount"
                  label="Monto ($)"
                  rules={[
                    { required: true, message: 'El monto es requerido' },
                    {
                      type: 'number',
                      min: 0.01,
                      message: 'El monto debe ser mayor a 0',
                    },
                  ]}
                >
                  <InputNumber
                    style={{ width: '100%' }}
                    placeholder="0.00"
                    min={0.01}
                    step={0.01}
                    precision={2}
                    prefix="$"
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item
                  name="accountId"
                  label="Cuenta"
                  rules={[{ required: true, message: 'La cuenta es requerida' }]}
                >
                  <Select
                    placeholder="Seleccionar cuenta"
                    loading={accountsQuery.isLoading}
                    options={accounts.map((acc) => ({
                      label: acc.name,
                      value: acc.id,
                    }))}
                  />
                </Form.Item>
              </Col>
            </Row>

            {watchedType === 'TRANSFER' && (
              <Form.Item
                name="toAccountId"
                label="Cuenta destino"
                rules={[{ required: true, message: 'La cuenta destino es requerida' }]}
              >
                <Select
                  placeholder="Seleccionar cuenta destino"
                  loading={accountsQuery.isLoading}
                  options={accounts
                    .filter((acc) => acc.id !== form.getFieldValue('accountId'))
                    .map((acc) => ({
                      label: acc.name,
                      value: acc.id,
                    }))}
                />
              </Form.Item>
            )}

            <Form.Item name="categoryId" label="Categoria">
              <TreeSelect
                placeholder="Seleccionar categoria"
                allowClear
                treeData={categoryTree}
                loading={categoriesQuery.isLoading}
                treeDefaultExpandAll
              />
            </Form.Item>

            <Form.Item name="notes" label="Notas">
              <TextArea
                rows={3}
                placeholder="Notas adicionales (opcional)"
                maxLength={500}
                showCount
              />
            </Form.Item>
          </Form>
        </Spin>
      </Modal>
    </div>
  );
}
