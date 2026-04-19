import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  App,
  Button,
  DatePicker,
  Drawer,
  Dropdown,
  Form,
  Input,
  InputNumber,
  Select,
  Spin,
  TreeSelect,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  UndoOutlined,
  SearchOutlined,
  DownloadOutlined,
  CheckOutlined,
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
import { useUIStore } from '@/store';
import { useIsMobile } from '@/hooks/useIsMobile';
import CategoryIcon from '@/components/common/CategoryIcon';
import TransactionDrawer, { type DrawerTransaction } from '@/components/transactions/TransactionDrawer';
import s from './Transactions.module.css';

const { RangePicker } = DatePicker;
const { TextArea } = Input;

const PAGE_SIZE_OPTIONS = [15, 20, 25];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Filters {
  dateRange: [Dayjs, Dayjs] | null;
  types: string[];
  accountIds: string[];
  categoryIds: string[];
  currency: string | undefined;
}

interface TransactionFormValues {
  date: Dayjs;
  description: string;
  amount: number;
  type: string;
  accountId: string;
  toAccountId?: string;
  toAmount?: number;
  categoryId?: string;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildParams(filters: Filters, page: number, pageSize: number, sortBy: string, sortOrder: 'asc' | 'desc', deleted?: boolean): TransactionFilters {
  const params: TransactionFilters = { page, limit: pageSize, sortBy, sortOrder };
  if (filters.types.length > 0) params.type = filters.types.join(',');
  if (filters.accountIds.length > 0) params.accountId = filters.accountIds.join(',');
  if (filters.categoryIds.length > 0) params.categoryId = filters.categoryIds.join(',');
  if (filters.currency) params.currency = filters.currency;
  if (filters.dateRange) {
    params.from = filters.dateRange[0].startOf('day').toISOString();
    params.to = filters.dateRange[1].endOf('day').toISOString();
  }
  if (deleted) params.deleted = true;
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
    name: cat.name,
    children: cat.children?.length ? flattenCategories(cat.children) : undefined,
  }));
}

function getTypeDotClass(type: string): string {
  switch (type) {
    case 'INCOME': return s.typeDotInc;
    case 'EXPENSE': return s.typeDotExp;
    case 'TRANSFER': return s.typeDotTr;
    case 'EXCHANGE': return s.typeDotFx;
    default: return '';
  }
}

function getTypeLabel(type: string): string {
  switch (type) {
    case 'INCOME': return 'Ingreso';
    case 'EXPENSE': return 'Gasto';
    case 'TRANSFER': return 'Transferencia';
    case 'EXCHANGE': return 'Cambio';
    default: return type;
  }
}

function getAmtClass(type: string, hasLinked: boolean): string {
  if (type === 'INCOME') return s.amtPos;
  if (type === 'EXPENSE' || ((['TRANSFER', 'EXCHANGE'].includes(type)) && hasLinked)) return s.amtNeg;
  if (type === 'TRANSFER' || type === 'EXCHANGE') return s.amtNeu;
  return '';
}

function getAmtPrefix(type: string, hasLinked: boolean): string {
  if (type === 'INCOME') return '+';
  if (type === 'EXPENSE' || ((['TRANSFER', 'EXCHANGE'].includes(type)) && hasLinked)) return '−';
  if (type === 'TRANSFER' || type === 'EXCHANGE') return '↔ ';
  return '';
}

function formatShortDate(date: string): { day: string; time: string } {
  const d = dayjs(date);
  return {
    day: d.format('DD MMM').toLowerCase(),
    time: d.format('HH:mm'),
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TransactionsPage() {
  const { t } = useTranslation();
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const { canWrite, canManageOrg } = usePermissions();
  const isMobile = useIsMobile();
  const [form] = Form.useForm<TransactionFormValues>();
  const watchedType = Form.useWatch('type', form);
  const watchedAccountId = Form.useWatch('accountId', form);

  // ---- State ----
  const [filters, setFilters] = useState<Filters>(() => ({
    dateRange: null,
    types: [],
    accountIds: [],
    categoryIds: [],
    currency: localStorage.getItem('txFilterCurrency') || undefined,
  }));
  const { pageSize, setPageSize } = useUIStore();
  const [viewDeleted, setViewDeleted] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [page, setPage] = useState(1);
  const [searchText, setSearchText] = useState('');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [drawerTx, setDrawerTx] = useState<Transaction | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saveAnother, setSaveAnother] = useState(false);
  const [sortBy, setSortBy] = useState<string>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const searchRef = useRef<HTMLInputElement>(null);

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        if (e.key === 'Escape') {
          (e.target as HTMLElement).blur();
          e.preventDefault();
        }
        return;
      }
      if (e.key === 'n' && !e.metaKey && !e.ctrlKey && canWrite && !viewDeleted) {
        e.preventDefault();
        openCreateModal();
      } else if (e.key === '/' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'Escape') {
        if (drawerOpen) {
          setDrawerOpen(false);
          setDrawerTx(null);
        } else if (modalOpen) {
          closeFormModal();
        } else if (selectedIds.size > 0) {
          setSelectedIds(new Set());
        }
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [canWrite, viewDeleted, drawerOpen, modalOpen, selectedIds.size]);

  // ---- Data fetching ----
  const transactionsQuery = useQuery<TransactionListResponse>({
    queryKey: ['transactions', filters, viewDeleted, page, pageSize, sortBy, sortOrder],
    queryFn: async () => {
      const params = buildParams(filters, page, pageSize, sortBy, sortOrder, viewDeleted);
      return transactionsService.getAll(params);
    },
  });

  const allTransactions = transactionsQuery.data?.data ?? [];
  const totalItems = transactionsQuery.data?.meta.total ?? 0;
  const totalPages = transactionsQuery.data?.meta.totalPages ?? 1;

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
      if (saveAnother) {
        // Keep modal open, reset most fields but keep type and account
        const keepType = form.getFieldValue('type');
        const keepAccount = form.getFieldValue('accountId');
        form.resetFields();
        form.setFieldsValue({ date: dayjs(), type: keepType, accountId: keepAccount });
      } else {
        closeFormModal();
      }
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
      closeFormModal();
    },
    onError: () => {
      message.error('Error al actualizar la transaccion');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      transactionsService.remove(id, reason),
    onSuccess: () => {
      message.success('Transaccion eliminada exitosamente');
      invalidateAll();
    },
    onError: () => {
      message.error('Error al eliminar la transaccion');
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => transactionsService.restore(id),
    onSuccess: () => {
      message.success('Transaccion restaurada exitosamente');
      invalidateAll();
    },
    onError: () => {
      message.error('Error al restaurar la transaccion');
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: ({ ids, reason }: { ids: string[]; reason: string }) =>
      transactionsService.bulkDelete(ids, reason),
    onSuccess: () => {
      message.success('Transacciones eliminadas');
      setSelectedIds(new Set());
      invalidateAll();
    },
    onError: () => message.error('Error al eliminar'),
  });

  // ---- Helpers ----
  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    queryClient.invalidateQueries({ queryKey: ['transactions-summary'] });
    queryClient.invalidateQueries({ queryKey: ['accounts'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  }, [queryClient]);

  const closeFormModal = useCallback(() => {
    setModalOpen(false);
    setEditingTransaction(null);
    form.resetFields();
  }, [form]);

  const openDrawer = useCallback((tx: Transaction) => {
    setDrawerTx(tx);
    setDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    setDrawerTx(null);
  }, []);

  const handleSort = useCallback((field: string) => {
    setPage(1);
    setSortBy((prev) => {
      if (prev === field) {
        setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'));
        return prev;
      }
      setSortOrder('desc');
      return field;
    });
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // toggleSelectAll is defined after displayedTransactions (see below)

  const handleBulkDelete = useCallback(() => {
    let deleteReason = '';
    modal.confirm({
      title: `Eliminar ${selectedIds.size} transacciones`,
      content: (
        <div>
          <p>{`Estas seguro de que deseas eliminar ${selectedIds.size} transacciones?`}</p>
          <TextArea
            placeholder="Motivo de eliminacion (requerido)"
            rows={3}
            maxLength={500}
            showCount
            onChange={(e) => { deleteReason = e.target.value; }}
          />
        </div>
      ),
      okText: 'Eliminar',
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: () => {
        if (!deleteReason.trim()) {
          message.error('El motivo de eliminacion es requerido');
          return Promise.reject();
        }
        return bulkDeleteMutation.mutateAsync({ ids: Array.from(selectedIds), reason: deleteReason.trim() });
      },
    });
  }, [selectedIds, bulkDeleteMutation, modal, message, t]);

  // exportCsv is defined after displayedTransactions (see below)

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
      let deleteReason = '';
      modal.confirm({
        title: 'Eliminar transaccion',
        content: (
          <div>
            <p>{`Estas seguro de que deseas eliminar "${transaction.description}"?`}</p>
            <TextArea
              placeholder="Motivo de eliminacion (requerido)"
              rows={3}
              maxLength={500}
              showCount
              onChange={(e) => { deleteReason = e.target.value; }}
            />
          </div>
        ),
        okText: t('common.delete'),
        okType: 'danger',
        cancelText: t('common.cancel'),
        onOk: () => {
          if (!deleteReason.trim()) {
            message.error('El motivo de eliminacion es requerido');
            return Promise.reject();
          }
          return deleteMutation.mutateAsync({ id: transaction.id, reason: deleteReason.trim() });
        },
      });
    },
    [deleteMutation, t, modal, message],
  );

  const handleRestore = useCallback(
    (transaction: Transaction) => {
      modal.confirm({
        title: 'Restaurar transaccion',
        content: `Estas seguro de que deseas restaurar "${transaction.description}"?`,
        okText: 'Restaurar',
        cancelText: t('common.cancel'),
        onOk: () => restoreMutation.mutateAsync(transaction.id),
      });
    },
    [restoreMutation, t, modal],
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
        ...((['TRANSFER', 'EXCHANGE'].includes(values.type) && values.toAccountId) ? { toAccountId: values.toAccountId } : {}),
        ...(values.type === 'EXCHANGE' && values.toAmount ? { toAmount: Math.round(values.toAmount * 100) } : {}),
      };

      if (editingTransaction) {
        updateMutation.mutate({ id: editingTransaction.id, dto });
      } else {
        createMutation.mutate(dto);
      }
    } catch {
      // form validation failed
    }
  }, [form, editingTransaction, createMutation, updateMutation]);

  // ---- Filter handlers ----
  const handleDateRangeChange = useCallback(
    (dates: [Dayjs | null, Dayjs | null] | null) => {
      setPage(1);
      setFilters((prev) => ({
        ...prev,
        dateRange: dates && dates[0] && dates[1] ? [dates[0], dates[1]] : null,
      }));
    },
    [],
  );

  const handleTypesChange = useCallback((values: string[]) => {
    setPage(1);
    setFilters((prev) => ({ ...prev, types: values }));
  }, []);

  const handleAccountsChange = useCallback((values: string[]) => {
    setPage(1);
    setFilters((prev) => ({ ...prev, accountIds: values }));
  }, []);

  const handleCurrencyChange = useCallback((value: string | undefined) => {
    setPage(1);
    if (value) {
      localStorage.setItem('txFilterCurrency', value);
    } else {
      localStorage.removeItem('txFilterCurrency');
    }
    setFilters((prev) => ({ ...prev, currency: value }));
  }, []);


  const clearAllFilters = useCallback(() => {
    localStorage.removeItem('txFilterCurrency');
    setPage(1);
    setFilters({ dateRange: null, types: [], accountIds: [], categoryIds: [], currency: undefined });
  }, []);

  // ---- Derived ----
  const isLoading = transactionsQuery.isLoading;
  const isError = transactionsQuery.isError;
  const summary = summaryQuery.data;
  const accounts = accountsQuery.data ?? [];
  const currencies = useMemo(() => [...new Set(accounts.map((a) => a.currency))].sort(), [accounts]);
  const isSaving = createMutation.isPending || updateMutation.isPending;

  const activeFilterCount = [filters.dateRange, filters.types.length > 0, filters.accountIds.length > 0, filters.categoryIds.length > 0, filters.currency].filter(Boolean).length;

  // Local search filtering + sorting
  // Local search only (sorting handled by backend)
  const displayedTransactions = useMemo(() => {
    if (!searchText.trim()) return allTransactions;
    const q = searchText.toLowerCase();
    return allTransactions.filter((tx) =>
      tx.description.toLowerCase().includes(q) ||
      tx.notes?.toLowerCase().includes(q) ||
      tx.category?.name.toLowerCase().includes(q) ||
      tx.account?.name.toLowerCase().includes(q)
    );
  }, [allTransactions, searchText]);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === displayedTransactions.length) return new Set();
      return new Set(displayedTransactions.map((tx) => tx.id));
    });
  }, [displayedTransactions]);

  // Selection balance — income/expense/net grouped by currency
  const selectionBalance = useMemo(() => {
    if (selectedIds.size === 0) return null;
    const income: Record<string, number> = {};
    const expense: Record<string, number> = {};
    for (const tx of displayedTransactions) {
      if (!selectedIds.has(tx.id)) continue;
      const cur = tx.account?.currency ?? 'USD';
      const amt = Math.abs(tx.amount);
      const isOutgoing = ['TRANSFER', 'EXCHANGE'].includes(tx.type) && !!tx.linkedTransactionId;
      if (tx.type === 'INCOME' || ((['TRANSFER', 'EXCHANGE'].includes(tx.type)) && !isOutgoing)) {
        income[cur] = (income[cur] ?? 0) + amt;
      } else {
        expense[cur] = (expense[cur] ?? 0) + amt;
      }
    }
    const allCurrencies = [...new Set([...Object.keys(income), ...Object.keys(expense)])].sort();
    return allCurrencies.map((cur) => ({
      currency: cur,
      income: income[cur] ?? 0,
      expense: expense[cur] ?? 0,
      net: (income[cur] ?? 0) - (expense[cur] ?? 0),
    }));
  }, [selectedIds, displayedTransactions]);

  const exportCsv = useCallback(() => {
    if (displayedTransactions.length === 0) return;
    const headers = ['Fecha', 'Tipo', 'Descripcion', 'Monto', 'Moneda', 'Cuenta', 'Categoria', 'Notas'];
    const rows = displayedTransactions.map((tx) => [
      dayjs(tx.date).format('YYYY-MM-DD HH:mm'),
      getTypeLabel(tx.type),
      `"${tx.description.replace(/"/g, '""')}"`,
      (tx.amount / 100).toFixed(2),
      tx.account?.currency ?? '',
      tx.account?.name ?? '',
      tx.category?.name ?? '',
      `"${(tx.notes ?? '').replace(/"/g, '""')}"`,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transacciones-${dayjs().format('YYYY-MM-DD')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    message.success('CSV exportado');
  }, [displayedTransactions, message]);

  // ---- Type tab helper for modal ----
  const typeTabDotClass = (type: string): string => {
    switch (type) {
      case 'INCOME': return s.typeTabDotInc;
      case 'EXPENSE': return s.typeTabDotExp;
      case 'TRANSFER': return s.typeTabDotTr;
      case 'EXCHANGE': return s.typeTabDotFx;
      default: return '';
    }
  };

  // ---- Filter options ----
  const typeOptions = [
    { label: 'Ingreso', value: 'INCOME' },
    { label: 'Gasto', value: 'EXPENSE' },
    { label: 'Transferencia', value: 'TRANSFER' },
    { label: 'Cambio', value: 'EXCHANGE' },
  ];

  const accountOptions = accounts.map((a) => ({ label: `${a.name} (${a.currency})`, value: a.id }));

  const currencyFilterItems = [
    { key: '', label: 'Todas' },
    ...currencies.map((c) => ({ key: c, label: c })),
  ];

  const handleCategoryTreeChange = useCallback((selectedIds: string[]) => {
    setPage(1);
    setFilters((prev) => ({ ...prev, categoryIds: selectedIds }));
  }, []);

  // Find category name by id
  const getCategoryName = useCallback((catId: string): string => {
    function find(cats: Category[]): string | null {
      for (const cat of cats) {
        if (cat.id === catId) return cat.name;
        if (cat.children?.length) {
          const found = find(cat.children);
          if (found) return found;
        }
      }
      return null;
    }
    return find(categoriesQuery.data ?? []) ?? '...';
  }, [categoriesQuery.data]);

  // ---- Render ----
  return (
    <div className={s.page}>
      {/* ═══════ PAGE HEADER ═══════ */}
      <header className={s.pageHead}>
        <div>
          <h1 className={s.pageTitle}>Transacciones</h1>
          <div className={s.pageSub}>
            {totalItems} transacciones{summaryParams ? ' en rango' : ''}
          </div>
        </div>
        <div className={s.pageActions}>
          {!viewDeleted && displayedTransactions.length > 0 && (
            <button className={s.exportBtn} onClick={exportCsv} title="Exportar CSV">
              <DownloadOutlined style={{ fontSize: 13 }} />
              CSV
            </button>
          )}
          {canWrite && !viewDeleted && (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
              {isMobile ? 'Nueva' : 'Nueva'}
            </Button>
          )}
        </div>
      </header>

      {/* ═══════ QUICK STATS ═══════ */}
      {!viewDeleted && (
        <section className={s.quickStats}>
          <div className={s.qStat}>
            <div className={s.qStatLabel}><span className={s.qStatDot} />balance neto</div>
            <div className={s.qStatNum}>
              {summary?.balance
                ? Object.entries(summary.balance).map(([cur, amt]) => (
                    <div key={cur}>
                      <span className={s.qStatCur}>{cur}</span>
                      {formatCurrency(amt, cur)}
                    </div>
                  ))
                : <span style={{ color: 'var(--eco-fg3)' }}>—</span>
              }
            </div>
          </div>
          <div className={s.qStat}>
            <div className={s.qStatLabel}><span className={`${s.qStatDot} ${s.qStatDot}.pos`} style={{ background: 'var(--eco-pos)' }} />ingresos</div>
            <div className={`${s.qStatNum} ${s.qStatNumPos}`}>
              {summary?.income
                ? Object.entries(summary.income).map(([cur, amt]) => (
                    <div key={cur}>
                      <span className={s.qStatCur}>{cur}</span>
                      {formatCurrency(amt, cur)}
                    </div>
                  ))
                : <span style={{ color: 'var(--eco-fg3)' }}>—</span>
              }
            </div>
          </div>
          <div className={s.qStat}>
            <div className={s.qStatLabel}><span className={s.qStatDot} style={{ background: 'var(--eco-neg)' }} />gastos</div>
            <div className={s.qStatNum}>
              {summary?.expense
                ? Object.entries(summary.expense).map(([cur, amt]) => (
                    <div key={cur}>
                      <span className={s.qStatCur}>{cur}</span>
                      {formatCurrency(amt, cur)}
                    </div>
                  ))
                : <span style={{ color: 'var(--eco-fg3)' }}>—</span>
              }
            </div>
          </div>
          <div className={s.qStat}>
            <div className={s.qStatLabel}><span className={s.qStatDot} style={{ background: 'var(--eco-accent)' }} />transacciones</div>
            <div className={s.qStatNum}>{totalItems}</div>
            <div className={s.qStatSub}>este periodo</div>
          </div>
        </section>
      )}

      {/* ═══════ TOOLBAR ═══════ */}
      <div className={s.toolbar}>
        <div className={s.searchInp}>
          <SearchOutlined style={{ fontSize: 14 }} />
          <input
            ref={searchRef}
            placeholder="Buscar por descripcion, monto, ref..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
          <kbd className={s.searchKbd}>/</kbd>
        </div>
        <div className={s.toolbarDivider} />
        {canManageOrg && (
          <div className={s.stateSeg}>
            <button
              className={`${s.stateBtn} ${!viewDeleted ? s.stateBtn + ' ' + 'on' : ''}`}
              style={!viewDeleted ? { background: 'var(--eco-surface)', color: 'var(--eco-fg)', boxShadow: 'var(--eco-shadow1)' } : undefined}
              onClick={() => setViewDeleted(false)}
            >
              Activas
              <span className={s.stateCount} style={!viewDeleted ? { background: 'var(--eco-accent-weak)', color: 'var(--eco-accent)' } : undefined}>
                {totalItems}
              </span>
            </button>
            <button
              className={s.stateBtn}
              style={viewDeleted ? { background: 'var(--eco-surface)', color: 'var(--eco-fg)', boxShadow: 'var(--eco-shadow1)' } : undefined}
              onClick={() => setViewDeleted(true)}
            >
              Eliminadas
            </button>
          </div>
        )}
      </div>

      {/* ═══════ FILTERS ═══════ */}
      {!isMobile ? (
        <div className={s.filters}>
          {/* Date range */}
          <Dropdown
            trigger={['click']}
            dropdownRender={() => (
              <div style={{ padding: 12, background: 'var(--eco-surface)', border: '1px solid var(--eco-line)', borderRadius: 10 }}>
                <RangePicker
                  value={filters.dateRange}
                  onChange={handleDateRangeChange}
                  allowClear
                  style={{ width: 280 }}
                />
              </div>
            )}
          >
            <span className={filters.dateRange ? s.filterChipActive : s.filterChip}>
              <span className={s.filterKey}>rango:</span>
              <span className={s.filterVal}>{filters.dateRange ? `${filters.dateRange[0].format('DD/MM')} – ${filters.dateRange[1].format('DD/MM')}` : 'todo'}</span>
              <span className={s.filterCaret}>▾</span>
            </span>
          </Dropdown>

          {/* Type (multi) */}
          <Dropdown
            trigger={['click']}
            dropdownRender={() => (
              <div style={{ padding: 12, background: 'var(--eco-surface)', border: '1px solid var(--eco-line)', borderRadius: 10, width: 220 }}>
                <Select
                  mode="multiple"
                  style={{ width: '100%' }}
                  placeholder="Todos"
                  value={filters.types}
                  onChange={handleTypesChange}
                  options={typeOptions}
                  allowClear
                  maxTagCount={0}
                  maxTagPlaceholder={(omitted) => `${omitted.length} seleccionados`}
                />
              </div>
            )}
          >
            <span className={filters.types.length > 0 ? s.filterChipActive : s.filterChip}>
              <span className={s.filterKey}>tipo:</span>
              <span className={s.filterVal}>
                {filters.types.length === 0 ? 'todos' : filters.types.length === 1 ? getTypeLabel(filters.types[0]).toLowerCase() : `${filters.types.length} seleccionados`}
              </span>
              <span className={s.filterCaret}>▾</span>
            </span>
          </Dropdown>

          {/* Account (multi) */}
          <Dropdown
            trigger={['click']}
            dropdownRender={() => (
              <div style={{ padding: 12, background: 'var(--eco-surface)', border: '1px solid var(--eco-line)', borderRadius: 10, width: 260 }}>
                <Select
                  mode="multiple"
                  style={{ width: '100%' }}
                  placeholder="Todas"
                  value={filters.accountIds}
                  onChange={handleAccountsChange}
                  options={accountOptions}
                  allowClear
                  maxTagCount={0}
                  maxTagPlaceholder={(omitted) => `${omitted.length} seleccionadas`}
                />
              </div>
            )}
          >
            <span className={filters.accountIds.length > 0 ? s.filterChipActive : s.filterChip}>
              <span className={s.filterKey}>cuenta:</span>
              <span className={s.filterVal}>
                {filters.accountIds.length === 0 ? 'todas' : filters.accountIds.length === 1 ? (accounts.find((a) => a.id === filters.accountIds[0])?.name ?? '...') : `${filters.accountIds.length} seleccionadas`}
              </span>
              <span className={s.filterCaret}>▾</span>
            </span>
          </Dropdown>

          {/* Currency */}
          <Dropdown
            menu={{
              items: currencyFilterItems,
              onClick: ({ key }) => handleCurrencyChange(key || undefined),
              selectedKeys: filters.currency ? [filters.currency] : [],
            }}
            trigger={['click']}
          >
            <span className={filters.currency ? s.filterChipActive : s.filterChip}>
              <span className={s.filterKey}>moneda:</span>
              <span className={s.filterVal}>{filters.currency ?? 'todas'}</span>
              <span className={s.filterCaret}>▾</span>
            </span>
          </Dropdown>

          {/* Category (multi - tree with checkboxes) */}
          <Dropdown
            trigger={['click']}
            dropdownRender={() => (
              <div style={{ padding: 12, background: 'var(--eco-surface)', border: '1px solid var(--eco-line)', borderRadius: 10, width: 280, maxHeight: 320, overflow: 'auto' }}>
                <TreeSelect
                  style={{ width: '100%' }}
                  placeholder="Cualquiera"
                  value={filters.categoryIds}
                  onChange={handleCategoryTreeChange}
                  treeData={categoryTree}
                  treeCheckable
                  treeDefaultExpandAll
                  allowClear
                  showCheckedStrategy={TreeSelect.SHOW_CHILD}
                  maxTagCount={0}
                  maxTagPlaceholder={(omitted) => `${omitted.length} seleccionadas`}
                  loading={categoriesQuery.isLoading}
                />
              </div>
            )}
          >
            <span className={filters.categoryIds.length > 0 ? s.filterChipActive : s.filterChip}>
              <span className={s.filterKey}>categoria:</span>
              <span className={s.filterVal}>
                {filters.categoryIds.length === 0 ? 'cualquiera' : filters.categoryIds.length === 1 ? getCategoryName(filters.categoryIds[0]) : `${filters.categoryIds.length} seleccionadas`}
              </span>
              <span className={s.filterCaret}>▾</span>
            </span>
          </Dropdown>

          {activeFilterCount > 0 && (
            <button className={s.clearFilters} onClick={clearAllFilters}>
              limpiar {activeFilterCount} filtro{activeFilterCount > 1 ? 's' : ''}
            </button>
          )}
        </div>
      ) : (
        <>
          <button
            className={s.mobileFilterToggle}
            onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
          >
            <SearchOutlined style={{ fontSize: 13 }} />
            Filtros{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            <span style={{ marginLeft: 'auto', fontSize: 10 }}>{mobileFiltersOpen ? '▲' : '▼'}</span>
          </button>
          {mobileFiltersOpen && (
            <div className={s.mobileFiltersBody}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <DatePicker
                  style={{ width: '100%' }}
                  placeholder="Desde"
                  value={filters.dateRange?.[0] ?? null}
                  onChange={(date) => {
                    if (date) {
                      handleDateRangeChange([date, filters.dateRange?.[1] ?? date]);
                    } else {
                      handleDateRangeChange(null);
                    }
                  }}
                  format="DD/MM/YY"
                />
                <DatePicker
                  style={{ width: '100%' }}
                  placeholder="Hasta"
                  value={filters.dateRange?.[1] ?? null}
                  onChange={(date) => {
                    if (date) {
                      handleDateRangeChange([filters.dateRange?.[0] ?? date, date]);
                    } else {
                      handleDateRangeChange(null);
                    }
                  }}
                  format="DD/MM/YY"
                />
              </div>
              <Select
                mode="multiple"
                style={{ width: '100%' }}
                placeholder="Tipo"
                value={filters.types}
                onChange={handleTypesChange}
                allowClear
                options={typeOptions}
                maxTagCount="responsive"
              />
              <Select
                mode="multiple"
                style={{ width: '100%' }}
                placeholder="Cuenta"
                value={filters.accountIds}
                onChange={handleAccountsChange}
                allowClear
                loading={accountsQuery.isLoading}
                options={accountOptions}
                maxTagCount="responsive"
              />
              <Select
                style={{ width: '100%' }}
                placeholder="Moneda"
                value={filters.currency}
                onChange={handleCurrencyChange}
                allowClear
                options={currencies.map((c) => ({ label: c, value: c }))}
              />
              <TreeSelect
                style={{ width: '100%' }}
                placeholder="Categoria"
                value={filters.categoryIds}
                onChange={handleCategoryTreeChange}
                treeData={categoryTree}
                treeCheckable
                treeDefaultExpandAll
                allowClear
                showCheckedStrategy={TreeSelect.SHOW_CHILD}
                maxTagCount="responsive"
                loading={categoriesQuery.isLoading}
              />
              <Button block onClick={clearAllFilters}>Limpiar</Button>
            </div>
          )}
        </>
      )}

      {/* ═══════ BULK SELECTION BAR ═══════ */}
      {selectedIds.size > 0 && selectionBalance && (
        <div className={s.bulkBar}>
          <span className={s.bulkCount}>
            {selectedIds.size} seleccionada{selectedIds.size > 1 ? 's' : ''}
          </span>
          <div className={s.bulkBalance}>
            {selectionBalance.map((b) => (
              <div key={b.currency} className={s.bulkBalCur}>
                <span className={s.bulkBalLabel}>{b.currency}</span>
                <span className={s.bulkBalIncome}>+{formatCurrency(b.income, b.currency)}</span>
                <span className={s.bulkBalExpense}>−{formatCurrency(b.expense, b.currency)}</span>
                <span className={b.net >= 0 ? s.bulkBalNetPos : s.bulkBalNetNeg}>
                  = {b.net >= 0 ? '+' : '−'}{formatCurrency(Math.abs(b.net), b.currency)}
                </span>
              </div>
            ))}
          </div>
          <div className={s.bulkActions}>
            <button className={s.bulkBtn} onClick={() => setSelectedIds(new Set())}>
              Deseleccionar
            </button>
            {canManageOrg && (
              <button className={s.bulkBtnDanger} onClick={handleBulkDelete}>
                <DeleteOutlined style={{ fontSize: 12 }} />
                Eliminar
              </button>
            )}
          </div>
        </div>
      )}

      {/* ═══════ TABLE ═══════ */}
      <div className={s.tableWrap}>
        {isError && (
          <div className={s.errorState}>
            <span style={{ color: 'var(--eco-neg)' }}>Error al cargar las transacciones.</span>
            <br />
            <Button style={{ marginTop: 8 }} onClick={() => transactionsQuery.refetch()}>
              Reintentar
            </Button>
          </div>
        )}

        {isLoading ? (
          <div className={s.loading}><Spin /></div>
        ) : displayedTransactions.length === 0 ? (
          <div className={s.emptyState}>
            {viewDeleted ? 'No hay transacciones eliminadas' : 'No hay transacciones'}
          </div>
        ) : isMobile ? (
          /* ---- MOBILE CARDS ---- */
          displayedTransactions.map((tx) => {
            const currency = tx.account?.currency ?? 'USD';
            const isOutgoing = ['TRANSFER', 'EXCHANGE'].includes(tx.type) && !!tx.linkedTransactionId;
            const prefix = getAmtPrefix(tx.type, isOutgoing);
            const colorClass = getAmtClass(tx.type, isOutgoing);
            const { day } = formatShortDate(tx.date);

            return (
              <div
                key={tx.id}
                className={s.mobileCard}
                onClick={() => {
                  if (!viewDeleted) openDrawer(tx);
                }}
                style={viewDeleted ? { opacity: 0.6 } : undefined}
              >
                <span className={`${s.typeDot} ${getTypeDotClass(tx.type)}`} />
                <div className={s.mobileCardLeft}>
                  <div className={s.mobileCardDate}>
                    {day}
                    {tx.account && <> · {tx.account.name}</>}
                  </div>
                  <div className={s.mobileCardDesc}>{tx.description}</div>
                  {tx.notes && <div className={s.mobileCardSub}>{tx.notes}</div>}
                  {viewDeleted && tx.deleteReason && (
                    <div className={s.deleteReason}>Motivo: {tx.deleteReason}</div>
                  )}
                </div>
                <div className={`${s.mobileCardAmt} ${colorClass}`}>
                  {prefix}{formatCurrency(Math.abs(tx.amount), currency)}
                </div>
                {viewDeleted && canManageOrg && (
                  <Button
                    type="text"
                    size="small"
                    icon={<UndoOutlined />}
                    onClick={(e) => { e.stopPropagation(); handleRestore(tx); }}
                  />
                )}
                {!viewDeleted && canManageOrg && (
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={(e) => { e.stopPropagation(); handleDelete(tx); }}
                    style={{ fontSize: 12 }}
                  />
                )}
              </div>
            );
          })
        ) : (
          /* ---- DESKTOP GRID ---- */
          <div className={s.txGrid}>
            {/* Headers */}
            <div className={s.hdrChk}>
              {!viewDeleted && canWrite && (
                <span
                  className={selectedIds.size === displayedTransactions.length && displayedTransactions.length > 0 ? s.chkOn : selectedIds.size > 0 ? s.chkMixed : s.chk}
                  onClick={toggleSelectAll}
                >
                  {selectedIds.size > 0 && <CheckOutlined style={{ fontSize: 9 }} />}
                </span>
              )}
            </div>
            <div className={s.hdrSort} onClick={() => handleSort('date')}>
              Fecha
              {sortBy === 'date' && <span className={s.sortArrow}>{sortOrder === 'asc' ? '▲' : '▼'}</span>}
            </div>
            <div className={s.hdrCenter}>T</div>
            <div className={s.hdrSort} onClick={() => handleSort('description')}>
              Descripcion
              {sortBy === 'description' && <span className={s.sortArrow}>{sortOrder === 'asc' ? '▲' : '▼'}</span>}
            </div>
            <div className={s.hdr}>Categoria</div>
            <div className={s.hdr}>Cuenta</div>
            <div className={s.hdrSortRight} onClick={() => handleSort('amount')}>
              Monto
              {sortBy === 'amount' && <span className={s.sortArrow}>{sortOrder === 'asc' ? '▲' : '▼'}</span>}
            </div>

            {/* Rows */}
            {displayedTransactions.map((tx) => {
              const currency = tx.account?.currency ?? 'USD';
              const isOutgoing = ['TRANSFER', 'EXCHANGE'].includes(tx.type) && !!tx.linkedTransactionId;
              const prefix = getAmtPrefix(tx.type, isOutgoing);
              const amtClass = getAmtClass(tx.type, isOutgoing);
              const { day, time } = formatShortDate(tx.date);

              return (
                <div
                  key={tx.id}
                  className={viewDeleted ? s.txRowDeleted : selectedIds.has(tx.id) ? s.txRowSelected : s.txRow}
                  onClick={() => {
                    if (!viewDeleted) openDrawer(tx);
                  }}
                >
                  {/* Checkbox column */}
                  <div className={s.cChk} onClick={(e) => e.stopPropagation()}>
                    {viewDeleted && canManageOrg ? (
                      <Button
                        type="text"
                        size="small"
                        icon={<UndoOutlined />}
                        onClick={() => handleRestore(tx)}
                        style={{ fontSize: 11 }}
                      />
                    ) : !viewDeleted && canWrite ? (
                      <span
                        className={selectedIds.has(tx.id) ? s.chkOn : s.chk}
                        onClick={() => toggleSelect(tx.id)}
                      >
                        {selectedIds.has(tx.id) && <CheckOutlined style={{ fontSize: 9 }} />}
                      </span>
                    ) : null}
                  </div>

                  {/* Date */}
                  <div className={s.cDate}>
                    <span className={s.cDateDay}>{day}</span>
                    <span className={s.cDateTime}>{time}</span>
                  </div>

                  {/* Type dot */}
                  <div className={s.cType}>
                    <span className={`${s.typeDot} ${getTypeDotClass(tx.type)}`} />
                  </div>

                  {/* Description */}
                  <div className={s.cDesc}>
                    <div className={s.descTitle}>{tx.description}</div>
                    <div className={s.descSub}>
                      {tx.notes && <span>{tx.notes}</span>}
                      {viewDeleted && tx.deleteReason && (
                        <span className={s.descTag} style={{ color: 'var(--eco-neg)', borderColor: 'var(--eco-neg)' }}>
                          {tx.deleteReason}
                        </span>
                      )}
                      {viewDeleted && tx.deletedAt && (
                        <span>Elim: {formatDate(tx.deletedAt)}</span>
                      )}
                    </div>
                  </div>

                  {/* Category */}
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

                  {/* Account */}
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

                  {/* Amount */}
                  <div className={`${s.cAmt} ${amtClass}`}>
                    {prefix}{formatCurrency(Math.abs(tx.amount), currency)}
                    <span className={s.amtCur}>{currency.toLowerCase()}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 0 && (
          <div className={s.pagination}>
            <span className={s.paginationInfo}>
              {totalItems} transacciones · pagina {page} de {totalPages}
            </span>
            <div className={s.paginationControls}>
              <div className={s.pageSizeSelect}>
                <select
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>{n} / pag</option>
                  ))}
                </select>
              </div>
              <button
                className={s.pageBtn}
                disabled={page <= 1}
                onClick={() => setPage(1)}
                title="Primera"
              >
                «
              </button>
              <button
                className={s.pageBtn}
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                title="Anterior"
              >
                ‹
              </button>
              {(() => {
                const pages: number[] = [];
                const start = Math.max(1, page - 2);
                const end = Math.min(totalPages, page + 2);
                for (let i = start; i <= end; i++) pages.push(i);
                return pages.map((p) => (
                  <button
                    key={p}
                    className={`${s.pageBtn} ${p === page ? s.pageBtnActive : ''}`}
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </button>
                ));
              })()}
              <button
                className={s.pageBtn}
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                title="Siguiente"
              >
                ›
              </button>
              <button
                className={s.pageBtn}
                disabled={page >= totalPages}
                onClick={() => setPage(totalPages)}
                title="Ultima"
              >
                »
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ═══════ CREATE / EDIT DRAWER ═══════ */}
      <Drawer
        open={modalOpen}
        onClose={closeFormModal}
        placement={isMobile ? 'bottom' : 'right'}
        width={isMobile ? '100%' : 480}
        height={isMobile ? '95vh' : undefined}
        closable={false}
        destroyOnClose
        styles={{
          body: { padding: 0, background: 'var(--eco-surface)', color: 'var(--eco-fg)', overflowY: 'auto' },
          header: { display: 'none' },
          wrapper: isMobile ? { borderRadius: '14px 14px 0 0', overflow: 'hidden' } : undefined,
        }}
      >
        {/* Drawer header */}
        <div className={s.formDrawerHead}>
          <h2 className={s.formDrawerTitle}>
            {editingTransaction ? 'Editar transaccion' : 'Nueva transaccion'}
          </h2>
          <button className={s.formDrawerClose} onClick={closeFormModal} type="button">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>

        {/* Type tabs */}
        {!editingTransaction && (
          <div style={{ padding: '0 20px 12px' }}>
            <div className={s.typeTabs}>
              {(['INCOME', 'EXPENSE', 'TRANSFER', 'EXCHANGE'] as const).map((type) => (
                <button
                  key={type}
                  className={watchedType === type ? s.typeTabOn : s.typeTab}
                  onClick={() => form.setFieldValue('type', type)}
                  type="button"
                >
                  <span className={`${s.typeTabDot} ${typeTabDotClass(type)}`} />
                  {getTypeLabel(type).slice(0, type === 'TRANSFER' ? 10 : undefined)}
                  {type === 'TRANSFER' ? '.' : ''}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ padding: '0 20px 20px' }}>
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
              <Form.Item name="type" hidden>
                <Input />
              </Form.Item>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Form.Item
                  name="amount"
                  label="Monto ($)"
                  rules={[
                    { required: true, message: 'El monto es requerido' },
                    { type: 'number', min: 0.01, message: 'El monto debe ser mayor a 0' },
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
                <Form.Item
                  name="date"
                  label="Fecha"
                  rules={[{ required: true, message: 'La fecha es requerida' }]}
                >
                  <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                </Form.Item>
              </div>

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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Form.Item
                  name="accountId"
                  label={watchedType === 'INCOME' ? 'Cuenta destino' : 'Cuenta origen'}
                  rules={[{ required: true, message: 'La cuenta es requerida' }]}
                >
                  <Select
                    placeholder="Seleccionar cuenta"
                    loading={accountsQuery.isLoading}
                    onChange={() => form.setFieldValue('toAccountId', undefined)}
                    options={accounts.map((acc) => ({
                      label: `${acc.name} (${acc.currency})`,
                      value: acc.id,
                    }))}
                  />
                </Form.Item>
                <Form.Item name="categoryId" label="Categoria">
                  <TreeSelect
                    placeholder="Seleccionar"
                    allowClear
                    showSearch
                    treeNodeFilterProp="label"
                    filterTreeNode={(input, node) =>
                      String((node as any)?.name ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                    treeData={categoryTree}
                    loading={categoriesQuery.isLoading}
                    treeDefaultExpandAll
                  />
                </Form.Item>
              </div>

              {(watchedType === 'TRANSFER' || watchedType === 'EXCHANGE') && (
                <>
                  <Form.Item
                    name="toAccountId"
                    label="Cuenta destino"
                    rules={[{ required: true, message: 'La cuenta destino es requerida' }]}
                  >
                    <Select
                      placeholder="Seleccionar cuenta destino"
                      loading={accountsQuery.isLoading}
                      options={accounts
                        .filter((acc) => {
                          if (acc.id === watchedAccountId) return false;
                          if (watchedType === 'TRANSFER') {
                            const srcAccount = accounts.find((a) => a.id === watchedAccountId);
                            return srcAccount ? acc.currency === srcAccount.currency : true;
                          }
                          return true;
                        })
                        .map((acc) => ({
                          label: `${acc.name} (${acc.currency})`,
                          value: acc.id,
                        }))}
                    />
                  </Form.Item>
                  {watchedType === 'EXCHANGE' && (
                    <Form.Item
                      name="toAmount"
                      label="Monto destino ($)"
                      rules={[
                        { required: true, message: 'El monto destino es requerido' },
                        { type: 'number', min: 0.01, message: 'El monto debe ser mayor a 0' },
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
                  )}
                </>
              )}

              <Form.Item name="notes" label="Notas">
                <TextArea
                  rows={2}
                  placeholder="Notas adicionales (opcional)"
                  maxLength={500}
                  showCount
                />
              </Form.Item>

              {!editingTransaction && (
                <label className={s.saveAnother}>
                  <input
                    type="checkbox"
                    checked={saveAnother}
                    onChange={(e) => setSaveAnother(e.target.checked)}
                  />
                  Guardar y crear otra
                </label>
              )}
            </Form>
          </Spin>
        </div>

        {/* Footer actions */}
        <div className={s.formDrawerFoot}>
          <Button onClick={closeFormModal}>
            {t('common.cancel')}
          </Button>
          <Button type="primary" onClick={handleFormSubmit} loading={isSaving}>
            {editingTransaction ? t('common.save') : t('common.create')}
          </Button>
        </div>
      </Drawer>

      {/* ═══════ DETAIL DRAWER ═══════ */}
      <TransactionDrawer
        transaction={drawerTx as DrawerTransaction | null}
        open={drawerOpen}
        onClose={closeDrawer}
        isMobile={isMobile}
        onEdit={(tx) => {
          closeDrawer();
          openEditModal(tx as unknown as Transaction);
        }}
        onDelete={(tx) => {
          closeDrawer();
          handleDelete(tx as unknown as Transaction);
        }}
        canWrite={canWrite}
      />
    </div>
  );
}
