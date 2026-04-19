import { useState, useMemo } from 'react';
import { Modal, Form, Input, InputNumber, Select, DatePicker, App } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { debtsService, type CreateDebtDto, type AddPaymentDto } from '@/services/debts.service';
import { accountsService } from '@/services/accounts.service';
import type { Account } from '@/services/accounts.service';
import { usePermissions } from '@/hooks/usePermissions';
import { formatCurrency, formatDate, formatRelativeDate } from '@/lib/formatters';
import { DebtType, DebtStatus } from '@ecoghost/shared';
import css from './Debts.module.css';

const { TextArea } = Input;

interface Debt {
  id: string;
  personName: string;
  description?: string;
  totalAmount: number;
  paidAmount: number;
  type: DebtType;
  status: DebtStatus;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
  orgId: string;
  currency: string;
}

interface DebtDetail extends Debt {
  transactions: DebtTransaction[];
}

interface DebtTransaction {
  id: string;
  date: string;
  description?: string;
  amount: number;
  type: string;
  accountId: string;
  account?: {
    id: string;
    name: string;
    currency: string;
  };
}

type FilterTab = 'ALL' | DebtType.RECEIVABLE | DebtType.PAYABLE;

const PERSON_COLORS = [
  'oklch(0.72 0.16 60)',
  'oklch(0.68 0.18 350)',
  'oklch(0.7 0.14 180)',
  'oklch(0.58 0.2 300)',
  'oklch(0.7 0.12 30)',
  'oklch(0.65 0.15 110)',
  'oklch(0.6 0.1 220)',
];

function getPersonColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return PERSON_COLORS[Math.abs(hash) % PERSON_COLORS.length];
}

function getInitials(name: string): string {
  return name
    .split(/[\s·\-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

function splitAmount(cents: number): { sign: string; integer: string; decimal: string } {
  const abs = Math.abs(cents / 100);
  const parts = abs.toFixed(2).split('.');
  const integer = new Intl.NumberFormat('en-US').format(Number(parts[0]));
  return {
    sign: cents < 0 ? '−' : '',
    integer,
    decimal: `.${parts[1]}`,
  };
}

export default function DebtsPage() {
  const { message } = App.useApp();
  const { canWrite } = usePermissions();
  const queryClient = useQueryClient();

  const [activeFilter, setActiveFilter] = useState<FilterTab>('ALL');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentDebtId, setPaymentDebtId] = useState<string | null>(null);

  const [debtForm] = Form.useForm();
  const [paymentForm] = Form.useForm();

  // --- Queries ---
  const { data: debts = [], isLoading } = useQuery<Debt[]>({
    queryKey: ['debts'],
    queryFn: () => debtsService.getAll(),
  });

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: () => accountsService.getAll(),
  });

  const { data: debtDetail } = useQuery<DebtDetail>({
    queryKey: ['debts', expandedId],
    queryFn: () => debtsService.getOne(expandedId!),
    enabled: !!expandedId,
  });

  // --- Filtered data ---
  const filteredDebts = useMemo(() => {
    if (activeFilter === 'ALL') return debts;
    return debts.filter((d) => d.type === activeFilter);
  }, [debts, activeFilter]);

  // --- Summary stats ---
  const stats = useMemo(() => {
    let receivable = 0;
    let payable = 0;
    let receivableCount = 0;
    let payableCount = 0;

    for (const d of debts) {
      const remaining = d.totalAmount - d.paidAmount;
      if (d.type === DebtType.RECEIVABLE) {
        receivable += remaining;
        if (d.status !== DebtStatus.PAID) receivableCount++;
      } else {
        payable += remaining;
        if (d.status !== DebtStatus.PAID) payableCount++;
      }
    }

    return {
      net: receivable - payable,
      receivable,
      payable,
      receivableCount,
      payableCount,
      total: debts.filter((d) => d.status !== DebtStatus.PAID).length,
    };
  }, [debts]);

  // --- Mutations ---
  const createMutation = useMutation({
    mutationFn: (payload: CreateDebtDto) => debtsService.create(payload),
    onSuccess: () => {
      message.success('Deuda creada correctamente');
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      closeDebtModal();
    },
    onError: () => message.error('Error al crear la deuda'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<CreateDebtDto> }) =>
      debtsService.update(id, payload),
    onSuccess: () => {
      message.success('Deuda actualizada correctamente');
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      closeDebtModal();
    },
    onError: () => message.error('Error al actualizar la deuda'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => debtsService.remove(id),
    onSuccess: (_data, deletedId) => {
      message.success('Deuda eliminada correctamente');
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      if (expandedId === deletedId) setExpandedId(null);
    },
    onError: () => message.error('Error al eliminar la deuda'),
  });

  const addPaymentMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: AddPaymentDto }) =>
      debtsService.addPayment(id, payload),
    onSuccess: () => {
      message.success('Pago registrado correctamente');
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      paymentForm.resetFields();
      setPaymentModalOpen(false);
      setPaymentDebtId(null);
    },
    onError: () => message.error('Error al registrar el pago'),
  });

  // --- Handlers ---
  function openCreateModal() {
    setEditingDebt(null);
    debtForm.resetFields();
    debtForm.setFieldsValue({ type: DebtType.RECEIVABLE });
    setModalOpen(true);
  }

  function openEditModal(debt: Debt) {
    setEditingDebt(debt);
    debtForm.setFieldsValue({
      personName: debt.personName,
      description: debt.description,
      totalAmount: debt.totalAmount / 100,
      type: debt.type,
      dueDate: debt.dueDate ? dayjs(debt.dueDate) : undefined,
    });
    setModalOpen(true);
  }

  function closeDebtModal() {
    setModalOpen(false);
    setEditingDebt(null);
    debtForm.resetFields();
  }

  function openPaymentModal(debtId: string) {
    setPaymentDebtId(debtId);
    paymentForm.resetFields();
    paymentForm.setFieldsValue({ date: dayjs() });
    setPaymentModalOpen(true);
  }

  function handleDebtSubmit(values: {
    personName: string;
    description?: string;
    totalAmount: number;
    type: string;
    accountId: string;
    dueDate?: dayjs.Dayjs;
  }) {
    const payload: CreateDebtDto = {
      personName: values.personName.trim(),
      description: values.description?.trim(),
      totalAmount: Math.round(values.totalAmount * 100),
      type: values.type,
      accountId: values.accountId,
      dueDate: values.dueDate ? values.dueDate.toISOString() : undefined,
    };

    if (editingDebt) {
      updateMutation.mutate({ id: editingDebt.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function handlePaymentSubmit(values: {
    amount: number;
    date: dayjs.Dayjs;
    accountId: string;
    description?: string;
  }) {
    if (!paymentDebtId) return;
    const payload: AddPaymentDto = {
      amount: Math.round(values.amount * 100),
      date: values.date.toISOString(),
      accountId: values.accountId,
      description: values.description?.trim(),
    };
    addPaymentMutation.mutate({ id: paymentDebtId, payload });
  }

  function handleDelete(id: string) {
    Modal.confirm({
      title: 'Eliminar deuda',
      content: 'Esta accion no se puede deshacer.',
      okText: 'Eliminar',
      cancelText: 'Cancelar',
      okButtonProps: { danger: true },
      onOk: () => deleteMutation.mutate(id),
    });
  }

  function toggleExpand(debtId: string) {
    setExpandedId((prev) => (prev === debtId ? null : debtId));
  }

  // --- Render helpers ---
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const activeDebts = debts.filter((d) => d.status !== DebtStatus.PAID);
  const paymentDebt = debts.find((d) => d.id === paymentDebtId);
  const paymentRemaining = paymentDebt ? paymentDebt.totalAmount - paymentDebt.paidAmount : 0;
  const paymentCurrency = paymentDebt?.currency ?? 'USD';

  // Net amount display
  const netAmt = splitAmount(stats.net);
  const recAmt = splitAmount(stats.receivable);
  const payAmt = splitAmount(stats.payable);

  if (isLoading) {
    return (
      <div className={css.page}>
        <div className={css.loading}>
          <div style={{ color: 'var(--eco-fg3)', fontFamily: "'Geist Mono', monospace", fontSize: 13 }}>
            cargando deudas...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={css.page}>
      {/* Page header */}
      <header className={css.pageHead}>
        <div>
          <h1 className={css.pageTitle}>Deudas</h1>
          <div className={css.pageSub}>
            {activeDebts.length} deuda{activeDebts.length !== 1 ? 's' : ''} activa{activeDebts.length !== 1 ? 's' : ''}
          </div>
        </div>
        <div className={css.pageActions}>
          {canWrite && (
            <button
              onClick={openCreateModal}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                borderRadius: 8,
                border: 'none',
                background: 'var(--eco-accent)',
                color: '#1a1715',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Nueva deuda
            </button>
          )}
        </div>
      </header>

      {/* Hero stats */}
      {debts.length > 0 && (
        <section className={css.heroGrid}>
          {/* Net balance */}
          <article className={css.card}>
            <div className={css.cardLabel}>
              <span className={css.cardDot} />
              balance neto · deudas
            </div>
            <div className={`${css.bigNum} ${stats.net > 0 ? css.bigNumPos : ''}`}>
              {stats.net > 0 ? '+' : stats.net < 0 ? '−' : ''}
              <span className={css.bigNumCur}>$</span>
              {netAmt.integer}
              <span className={css.bigNumDec}>{netAmt.decimal}</span>
            </div>
            <div className={css.flowRow}>
              <div className={css.flowItem}>
                <span className={css.flowLabel}>te deben</span>
                <span className={`${css.flowVal} ${css.flowValPos}`}>
                  +{formatCurrency(stats.receivable, 'USD').replace('$', '$')}
                </span>
              </div>
              <div className={css.flowItem}>
                <span className={css.flowLabel}>debes</span>
                <span className={`${css.flowVal} ${css.flowValNeg}`}>
                  −{formatCurrency(stats.payable, 'USD').replace('$', '$').replace('-', '')}
                </span>
              </div>
            </div>
          </article>

          {/* Receivable */}
          <article className={css.card}>
            <div className={css.cardLabel}>
              <span className={css.cardDotPos} />
              por cobrar
            </div>
            <div className={css.bigNum}>
              <span className={css.bigNumCur}>$</span>
              {recAmt.integer}
              <span className={css.bigNumDec}>{recAmt.decimal}</span>
            </div>
            <div className={css.flowRow}>
              <div className={css.flowItem}>
                <span className={css.flowLabel}>personas</span>
                <span className={css.flowVal} style={{ fontSize: 13 }}>{stats.receivableCount}</span>
              </div>
            </div>
          </article>

          {/* Payable */}
          <article className={css.card}>
            <div className={css.cardLabel}>
              <span className={css.cardDotNeg} />
              por pagar
            </div>
            <div className={css.bigNum}>
              <span className={css.bigNumCur}>$</span>
              {payAmt.integer}
              <span className={css.bigNumDec}>{payAmt.decimal}</span>
            </div>
            <div className={css.flowRow}>
              <div className={css.flowItem}>
                <span className={css.flowLabel}>personas</span>
                <span className={css.flowVal} style={{ fontSize: 13 }}>{stats.payableCount}</span>
              </div>
            </div>
          </article>
        </section>
      )}

      {/* People list */}
      <div className={css.peopleList}>
        <header className={css.plHead}>
          <h3 className={css.plTitle}>Deudas</h3>
          <span className={css.plCount}>{filteredDebts.length} total</span>

          <div className={css.seg}>
            {([
              { label: 'Todas', value: 'ALL' as FilterTab },
              { label: 'Te deben', value: DebtType.RECEIVABLE as FilterTab },
              { label: 'Debes', value: DebtType.PAYABLE as FilterTab },
            ]).map((opt) => (
              <button
                key={opt.value}
                className={activeFilter === opt.value ? css.segBtnOn : css.segBtn}
                onClick={() => setActiveFilter(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </header>

        {filteredDebts.length === 0 ? (
          <div className={css.emptyState}>
            No hay deudas registradas
          </div>
        ) : (
          filteredDebts.map((debt) => {
            const remaining = debt.totalAmount - debt.paidAmount;
            const isReceivable = debt.type === DebtType.RECEIVABLE;
            const isExpanded = expandedId === debt.id;
            const color = getPersonColor(debt.personName);
            const initials = getInitials(debt.personName);
            const isOverdue = debt.dueDate && dayjs(debt.dueDate).isBefore(dayjs(), 'day');
            const isDueSoon = debt.dueDate && !isOverdue && dayjs(debt.dueDate).diff(dayjs(), 'day') <= 7;
            const daysLabel = debt.dueDate
              ? isOverdue
                ? `vencida ${dayjs().diff(dayjs(debt.dueDate), 'day')}d`
                : isDueSoon
                  ? `vence en ${dayjs(debt.dueDate).diff(dayjs(), 'day')}d`
                  : null
              : null;

            return (
              <div key={debt.id}>
                <div
                  className={isExpanded ? css.personOpen : css.person}
                  style={{ '--person-color': color } as React.CSSProperties}
                  onClick={() => toggleExpand(debt.id)}
                >
                  <div className={css.avatar}>{initials}</div>
                  <div>
                    <div className={css.personName}>
                      {debt.personName}
                      {debt.status === DebtStatus.PARTIAL && (
                        <span className={css.statusPartial}>parcial</span>
                      )}
                      {isOverdue && debt.status !== DebtStatus.PAID && (
                        <span className={css.statusOverdue}>{daysLabel}</span>
                      )}
                      {isDueSoon && debt.status !== DebtStatus.PAID && (
                        <span className={css.statusDue}>{daysLabel}</span>
                      )}
                    </div>
                    <div className={css.personSub}>
                      <span>{formatRelativeDate(debt.updatedAt)}</span>
                      <span className={css.personSubDot} />
                      <span>{debt.description || (isReceivable ? 'te debe' : 'le debes')}</span>
                    </div>
                  </div>
                  <div className={css.personAmt}>
                    <span className={`${css.personAmtNum} ${isReceivable ? css.personAmtPos : css.personAmtNeg}`}>
                      {isReceivable ? '+' : '−'}{formatCurrency(remaining, debt.currency)}
                    </span>
                    <span className={css.personAmtSub}>
                      {isReceivable ? 'te debe' : 'le debes'} · {debt.currency.toLowerCase()}
                    </span>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className={css.personDetail}>
                    <div className={css.timeline}>
                      {/* Original debt */}
                      <div className={`${css.tlEntry} ${debt.status === DebtStatus.PAID ? css.tlEntryPaid : css.tlEntryPending}`}>
                        <div className={css.tlRow}>
                          <div>
                            <div className={css.tlTitle}>
                              {debt.description || 'Deuda original'} · {debt.status === DebtStatus.PAID ? 'pagada' : 'pendiente'}
                            </div>
                            <div className={css.tlSub}>
                              creada {formatDate(debt.createdAt)}
                              {debt.dueDate && ` · vence ${formatDate(debt.dueDate)}`}
                            </div>
                          </div>
                          <div className={css.tlAmt}>
                            {formatCurrency(debt.totalAmount, debt.currency)} {debt.currency.toLowerCase()}
                          </div>
                        </div>
                      </div>

                      {/* Payment history */}
                      {debtDetail?.transactions?.map((tx) => (
                        <div key={tx.id} className={`${css.tlEntry} ${css.tlEntryPaid}`}>
                          <div className={css.tlRow}>
                            <div>
                              <div className={css.tlTitle}>
                                Pago {tx.description ? `— ${tx.description}` : ''}
                              </div>
                              <div className={css.tlSub}>
                                {formatDate(tx.date)}
                                {tx.account && ` · via ${tx.account.name}`}
                              </div>
                            </div>
                            <div className={`${css.tlAmt} ${css.tlAmtPos}`}>
                              +{formatCurrency(tx.amount, tx.account?.currency ?? debt.currency)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Actions */}
                    <div className={css.pdActions}>
                      {canWrite && debt.status !== DebtStatus.PAID && (
                        <button
                          onClick={(e) => { e.stopPropagation(); openPaymentModal(debt.id); }}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '7px 12px',
                            borderRadius: 8,
                            border: 'none',
                            background: 'var(--eco-accent)',
                            color: '#1a1715',
                            fontSize: 12,
                            fontWeight: 500,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                          }}
                        >
                          Registrar pago
                        </button>
                      )}
                      {canWrite && (
                        <button
                          onClick={(e) => { e.stopPropagation(); openEditModal(debt); }}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '7px 12px',
                            borderRadius: 8,
                            border: '1px solid var(--eco-line)',
                            background: 'var(--eco-surface)',
                            color: 'var(--eco-fg2)',
                            fontSize: 12,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                          }}
                        >
                          Editar
                        </button>
                      )}
                      {canWrite && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(debt.id); }}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '7px 12px',
                            borderRadius: 8,
                            border: '1px solid var(--eco-neg-soft)',
                            background: 'transparent',
                            color: 'var(--eco-neg)',
                            fontSize: 12,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            marginLeft: 'auto',
                          }}
                        >
                          Eliminar
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Create / Edit Debt Modal */}
      <Modal
        title={editingDebt ? 'Editar Deuda' : 'Nueva Deuda'}
        open={modalOpen}
        onCancel={closeDebtModal}
        footer={null}
        destroyOnClose
      >
        <Form
          form={debtForm}
          layout="vertical"
          onFinish={handleDebtSubmit}
          initialValues={{ type: DebtType.RECEIVABLE }}
        >
          <Form.Item
            name="personName"
            label="Nombre de la persona"
            rules={[{ required: true, message: 'El nombre es obligatorio' }]}
          >
            <Input placeholder="Ej: Juan Perez" maxLength={100} />
          </Form.Item>

          <Form.Item name="description" label="Descripcion">
            <TextArea placeholder="Descripcion o motivo de la deuda" rows={3} maxLength={500} />
          </Form.Item>

          <Form.Item
            name="totalAmount"
            label="Monto total"
            rules={[
              { required: true, message: 'El monto es obligatorio' },
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
            name="type"
            label="Tipo"
            rules={[{ required: true, message: 'Seleccione un tipo' }]}
          >
            <Select>
              <Select.Option value={DebtType.RECEIVABLE}>Me deben (a cobrar)</Select.Option>
              <Select.Option value={DebtType.PAYABLE}>Debo (a pagar)</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="accountId"
            label="Cuenta"
            rules={[{ required: true, message: 'Seleccione una cuenta' }]}
          >
            <Select placeholder="Seleccione una cuenta">
              {accounts.map((acc) => (
                <Select.Option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.currency})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="dueDate" label="Fecha de vencimiento (opcional)">
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" placeholder="Seleccione una fecha" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={closeDebtModal}
                style={{
                  padding: '7px 14px',
                  borderRadius: 8,
                  border: '1px solid var(--eco-line)',
                  background: 'var(--eco-surface2)',
                  color: 'var(--eco-fg2)',
                  fontSize: 13,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSaving}
                style={{
                  padding: '7px 14px',
                  borderRadius: 8,
                  border: 'none',
                  background: 'var(--eco-accent)',
                  color: '#1a1715',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: isSaving ? 'wait' : 'pointer',
                  opacity: isSaving ? 0.7 : 1,
                  fontFamily: 'inherit',
                }}
              >
                {isSaving ? 'Guardando...' : editingDebt ? 'Guardar cambios' : 'Crear deuda'}
              </button>
            </div>
          </Form.Item>
        </Form>
      </Modal>

      {/* Payment Modal */}
      <Modal
        title="Registrar pago"
        open={paymentModalOpen}
        onCancel={() => { setPaymentModalOpen(false); setPaymentDebtId(null); }}
        footer={null}
        destroyOnClose
      >
        {paymentDebt && (
          <div style={{
            marginBottom: 16,
            padding: '10px 14px',
            background: 'var(--eco-surface2)',
            borderRadius: 8,
            fontFamily: "'Geist Mono', monospace",
            fontSize: 12,
            color: 'var(--eco-fg3)',
          }}>
            {paymentDebt.personName} · Restante: {formatCurrency(paymentRemaining, paymentCurrency)}
          </div>
        )}
        <Form
          form={paymentForm}
          layout="vertical"
          onFinish={handlePaymentSubmit}
          initialValues={{ date: dayjs() }}
        >
          <Form.Item
            name="amount"
            label="Monto"
            rules={[
              { required: true, message: 'El monto es obligatorio' },
              { type: 'number', min: 0.01, message: 'El monto debe ser mayor a 0' },
              { type: 'number', max: paymentRemaining / 100, message: `Maximo: ${formatCurrency(paymentRemaining, paymentCurrency)}` },
            ]}
          >
            <InputNumber
              style={{ width: '100%' }}
              placeholder="0.00"
              min={0.01}
              max={paymentRemaining / 100}
              step={0.01}
              precision={2}
              prefix="$"
            />
          </Form.Item>

          <Form.Item
            name="date"
            label="Fecha"
            rules={[{ required: true, message: 'La fecha es obligatoria' }]}
          >
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>

          <Form.Item
            name="accountId"
            label="Cuenta"
            rules={[{ required: true, message: 'Seleccione una cuenta' }]}
          >
            <Select placeholder="Seleccione la cuenta">
              {accounts.map((acc) => (
                <Select.Option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.currency})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="description" label="Notas (opcional)">
            <TextArea rows={2} placeholder="Notas adicionales" maxLength={250} />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <button
              type="submit"
              disabled={addPaymentMutation.isPending}
              style={{
                width: '100%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '9px 14px',
                borderRadius: 8,
                border: 'none',
                background: 'var(--eco-accent)',
                color: '#1a1715',
                fontSize: 13,
                fontWeight: 500,
                cursor: addPaymentMutation.isPending ? 'wait' : 'pointer',
                opacity: addPaymentMutation.isPending ? 0.7 : 1,
                fontFamily: 'inherit',
              }}
            >
              {addPaymentMutation.isPending ? 'Registrando...' : 'Registrar pago'}
            </button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
