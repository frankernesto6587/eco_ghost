import { useEffect, useMemo, useState } from 'react';
import { App, Button, DatePicker, Form, Input, InputNumber, Modal, Segmented, Select, Spin, Tag, TreeSelect } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import type { ApprovalItem, ApprovalKind } from '@ecoghost/shared';
import { approvalsService, type ApprovalEdits } from '@/services/approvals.service';
import { accountsService } from '@/services/accounts.service';
import { categoriesService } from '@/services/categories.service';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuthStore } from '@/store/auth.store';
import { invalidateMoneyQueries } from '@/lib/invalidateMoney';
import { flattenCategories } from '@/lib/categoryTree';
import { formatRelativeDate } from '@/lib/formatters';
import css from './Approvals.module.css';

const KIND_LABEL: Record<ApprovalKind, string> = {
  INCOME: 'Ingreso',
  EXPENSE: 'Gasto',
  TRANSFER: 'Transferencia',
  EXCHANGE: 'Cambio',
  DEBT_CREATE: 'Deuda nueva',
  DEBT_PAYMENT: 'Pago de deuda',
};

/** Importe con centavos solo si los hay y la moneda al lado: "6 400 MN". */
const money = (cents: number, currency: string) =>
  `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(cents / 100)} ${currency}`;

type Scope = 'review' | 'mine';

/** Formulario de correccion (importes en unidades, no centavos). */
interface EditForm {
  date: dayjs.Dayjs;
  description: string;
  amount: number;
  accountId: string;
  categoryId?: string | null;
  notes?: string;
  toAccountId?: string;
  toAmount?: number;
}

export default function ApprovalsPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { canApprove } = usePermissions();
  const orgId = useAuthStore((s) => s.currentOrg?.id);
  const [scope, setScope] = useState<Scope>(canApprove ? 'review' : 'mine');
  const [editing, setEditing] = useState<{ item: ApprovalItem; mode: 'approve' | 'author' } | null>(null);
  const [rejecting, setRejecting] = useState<ApprovalItem | null>(null);
  const [reason, setReason] = useState('');
  const [form] = Form.useForm<EditForm>();

  useEffect(() => {
    if (!canApprove) setScope('mine');
  }, [canApprove]);

  const listQuery = useQuery({
    queryKey: ['approvals', 'list', scope, orgId],
    queryFn: () => approvalsService.list(scope),
    enabled: !!orgId,
    refetchInterval: 60_000,
  });
  const notesQuery = useQuery({
    queryKey: ['approvals', 'notifications', orgId],
    queryFn: () => approvalsService.notifications(),
    enabled: !!orgId,
  });
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => accountsService.getAll() }).data ?? [];
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => categoriesService.getAll() }).data;
  const categoryTree = useMemo(() => (categories ? flattenCategories(categories) : []), [categories]);

  const done = (msg: string) => {
    message.success(msg);
    invalidateMoneyQueries(queryClient);
  };
  const failed = (e: unknown) => {
    const err = e as { response?: { data?: { message?: string | string[] } } };
    const m = err.response?.data?.message;
    message.error(Array.isArray(m) ? m.join('. ') : m ?? 'No se pudo completar');
    invalidateMoneyQueries(queryClient);
  };

  const approve = useMutation({
    mutationFn: ({ id, edits }: { id: string; edits?: ApprovalEdits }) => approvalsService.approve(id, edits),
    onSuccess: (r) => done(r.originalSnapshot ? 'Aprobado con correcciones' : 'Aprobado'),
    onError: failed,
  });
  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => approvalsService.reject(id, reason),
    onSuccess: () => done('Rechazado'),
    onError: failed,
  });
  const authorEdit = useMutation({
    mutationFn: ({ id, edits }: { id: string; edits: ApprovalEdits }) => approvalsService.edit(id, edits),
    onSuccess: (r) => done(r.status === 'APPROVED' ? 'Guardado y aprobado' : 'Enviado otra vez a revisión'),
    onError: failed,
  });
  const resubmit = useMutation({
    mutationFn: (id: string) => approvalsService.resubmit(id),
    onSuccess: () => done('Reenviado'),
    onError: failed,
  });
  const withdraw = useMutation({
    mutationFn: (id: string) => approvalsService.withdraw(id),
    onSuccess: () => done('Retirado'),
    onError: failed,
  });
  const markRead = useMutation({
    mutationFn: () => approvalsService.markRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['approvals'] }),
  });

  const openEdit = (item: ApprovalItem, mode: 'approve' | 'author') => {
    setEditing({ item, mode });
    form.setFieldsValue({
      date: dayjs(item.date),
      description: item.description,
      amount: item.from.amount / 100,
      accountId: item.from.accountId,
      categoryId: item.category?.id ?? null,
      notes: item.notes ?? undefined,
      ...(item.to && { toAccountId: item.to.accountId, toAmount: item.to.amount / 100 }),
    });
  };

  /** Solo se manda lo que cambio: asi el historial guarda correcciones reales. */
  const submitEdit = async () => {
    if (!editing) return;
    const v = await form.validateFields();
    const { item } = editing;
    const edits: ApprovalEdits = {};
    if (!v.date.isSame(dayjs(item.date), 'day')) edits.date = v.date.format('YYYY-MM-DD');
    if (v.description.trim() !== item.description) edits.description = v.description.trim();
    if (Math.round(v.amount * 100) !== item.from.amount) edits.amount = Math.round(v.amount * 100);
    if (v.accountId !== item.from.accountId) edits.accountId = v.accountId;
    if ((v.categoryId ?? null) !== (item.category?.id ?? null)) edits.categoryId = v.categoryId ?? null;
    if ((v.notes ?? '') !== (item.notes ?? '')) edits.notes = v.notes ?? '';
    if (item.to) {
      if (v.toAccountId !== item.to.accountId) edits.toAccountId = v.toAccountId;
      if (item.kind === 'EXCHANGE' && v.toAmount !== undefined && Math.round(v.toAmount * 100) !== item.to.amount) {
        edits.toAmount = Math.round(v.toAmount * 100);
      }
    }
    const body = Object.keys(edits).length ? edits : undefined;
    if (editing.mode === 'approve') await approve.mutateAsync({ id: item.id, edits: body });
    else await authorEdit.mutateAsync({ id: item.id, edits: edits });
    setEditing(null);
  };

  const items = listQuery.data?.data ?? [];
  const counts = listQuery.data?.counts;
  const notes = notesQuery.data ?? [];
  const unread = notes.filter((n) => !n.isRead).length;
  const busy = approve.isPending || reject.isPending || authorEdit.isPending || resubmit.isPending || withdraw.isPending;

  const editingItem = editing?.item;
  const watchedAccountId = Form.useWatch('accountId', form);
  const fromAccount = accounts.find((a) => a.id === watchedAccountId);
  const isDebt = editingItem?.kind === 'DEBT_CREATE' || editingItem?.kind === 'DEBT_PAYMENT';
  // Las cuentas que tienen sentido: en deudas, la misma moneda; en un traspaso,
  // misma moneda; en un cambio, el destino en otra.
  const fromOptions = accounts.filter((a) => !isDebt || a.currency === editingItem?.from.currency);
  const toOptions = accounts.filter(
    (a) =>
      a.id !== fromAccount?.id &&
      (editingItem?.kind === 'TRANSFER' ? a.currency === fromAccount?.currency : a.currency !== fromAccount?.currency),
  );

  return (
    <div className={css.page}>
      <header className={css.pageHead}>
        <div>
          <h1 className={css.pageTitle}>Aprobaciones</h1>
          <div className={css.pageSub}>
            {canApprove
              ? `${counts?.toReview ?? 0} por revisar · solo cuenta lo aprobado`
              : `${counts?.mine.pending ?? 0} esperando · ${counts?.mine.rejected ?? 0} rechazados`}
          </div>
        </div>
        <Segmented<Scope>
          value={scope}
          onChange={setScope}
          options={[
            ...(canApprove ? [{ label: `Por revisar (${counts?.toReview ?? 0})`, value: 'review' as const }] : []),
            { label: `Mis envíos (${(counts?.mine.pending ?? 0) + (counts?.mine.rejected ?? 0)})`, value: 'mine' as const },
          ]}
        />
      </header>

      {listQuery.isLoading ? (
        <div className={css.empty}><Spin /></div>
      ) : items.length === 0 ? (
        <div className={css.empty}>
          {scope === 'review' ? 'Nada por revisar.' : 'No tienes envíos pendientes ni rechazados.'}
        </div>
      ) : (
        <div className={css.list}>
          {items.map((item) => {
            const rejected = item.status === 'REJECTED';
            const incoming = item.kind === 'INCOME' || (item.kind === 'DEBT_PAYMENT' && item.debt?.type === 'RECEIVABLE') || (item.kind === 'DEBT_CREATE' && item.debt?.type === 'PAYABLE');
            return (
              <article key={item.id} className={`${css.card} ${rejected ? css.cardRejected : ''}`}>
                <div className={css.top}>
                  <Tag>{KIND_LABEL[item.kind]}</Tag>
                  <Tag color={rejected ? 'red' : 'gold'}>{rejected ? 'Rechazado' : 'Por aprobar'}</Tag>
                  <span className={css.desc}>{item.description}</span>
                </div>
                <div className={`${css.amount} ${incoming ? css.amountIn : ''}`}>
                  {incoming ? '+' : item.to ? '' : '−'}
                  {money(item.from.amount, item.from.currency)}
                  {item.to && (
                    <span className={css.amountTo}>→ {money(item.to.amount, item.to.currency)}</span>
                  )}
                </div>
                <div className={css.meta}>
                  <span>{dayjs(item.date).format('DD/MM/YYYY')}</span>
                  <span>{item.from.accountName}{item.to ? ` → ${item.to.accountName}` : ''}</span>
                  {item.category && <span>{item.category.name}</span>}
                  {item.debt && <span>Deuda: {item.debt.personName}</span>}
                  <span>
                    {scope === 'review' ? `Anotó ${item.author.name ?? '?'}` : 'Enviado'} {formatRelativeDate(item.submittedAt)}
                    {item.source === 'telegram' ? ' · por Telegram' : ''}
                  </span>
                </div>
                {rejected && (
                  <div className={css.reason}>
                    Rechazado por {item.reviewer?.name ?? '?'}: {item.rejectionReason}
                  </div>
                )}
                <div className={css.actions}>
                  {scope === 'review' ? (
                    <>
                      <Button type="primary" disabled={busy} onClick={() => approve.mutate({ id: item.id })}>
                        Aprobar
                      </Button>
                      <Button disabled={busy} onClick={() => openEdit(item, 'approve')}>Corregir y aprobar</Button>
                      <Button danger disabled={busy} onClick={() => { setRejecting(item); setReason(''); }}>
                        Rechazar
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button type={rejected ? 'primary' : 'default'} disabled={busy} onClick={() => openEdit(item, 'author')}>
                        {rejected ? 'Corregir y reenviar' : 'Editar'}
                      </Button>
                      {rejected && <Button disabled={busy} onClick={() => resubmit.mutate(item.id)}>Reenviar igual</Button>}
                      <Button
                        danger
                        type="text"
                        disabled={busy}
                        onClick={() =>
                          Modal.confirm({
                            title: 'Retirar',
                            content: `"${item.description}" se quita de la bandeja. No contará en ningún número.`,
                            okText: 'Retirar',
                            okButtonProps: { danger: true },
                            cancelText: 'Cancelar',
                            onOk: () => withdraw.mutateAsync(item.id),
                          })
                        }
                      >
                        Retirar
                      </Button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {notes.length > 0 && (
        <section className={css.notes}>
          <div className={css.notesTitle} style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Avisos {unread ? `(${unread} sin leer)` : ''}</span>
            {unread > 0 && (
              <Button type="link" size="small" onClick={() => markRead.mutate()}>Marcar como leídos</Button>
            )}
          </div>
          {notes.slice(0, 10).map((n) => (
            <div key={n.id} className={`${css.note} ${n.isRead ? '' : css.noteUnread}`}>
              <span>{n.title}</span>
              <span style={{ color: 'var(--eco-fg3)' }}>{n.message}</span>
              <span style={{ marginLeft: 'auto', color: 'var(--eco-fg4)', whiteSpace: 'nowrap' }}>{formatRelativeDate(n.createdAt)}</span>
            </div>
          ))}
        </section>
      )}

      <Modal
        open={!!editing}
        title={editing?.mode === 'approve' ? 'Corregir y aprobar' : editing?.item.status === 'REJECTED' ? 'Corregir y reenviar' : 'Editar envío'}
        okText={editing?.mode === 'approve' ? 'Aprobar' : 'Guardar'}
        cancelText="Cancelar"
        onCancel={() => setEditing(null)}
        onOk={submitEdit}
        confirmLoading={approve.isPending || authorEdit.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item name="description" label="Descripción" rules={[{ required: true, message: 'Falta la descripción' }]}>
            <Input />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="amount" label={`Importe (${fromAccount?.currency ?? editingItem?.from.currency ?? ''})`} rules={[{ required: true }, { type: 'number', min: 0.01 }]}>
              <InputNumber style={{ width: '100%' }} min={0.01} step={1} />
            </Form.Item>
            <Form.Item name="date" label="Fecha" rules={[{ required: true }]}>
              <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
            </Form.Item>
          </div>
          <Form.Item name="accountId" label={editingItem?.to ? 'Cuenta origen' : 'Cuenta'} rules={[{ required: true }]}>
            <Select options={fromOptions.map((a) => ({ label: `${a.name} (${a.currency})`, value: a.id }))} />
          </Form.Item>
          {editingItem?.to && (
            <div style={{ display: 'grid', gridTemplateColumns: editingItem.kind === 'EXCHANGE' ? '1fr 1fr' : '1fr', gap: 12 }}>
              <Form.Item name="toAccountId" label="Cuenta destino" rules={[{ required: true }]}>
                <Select options={toOptions.map((a) => ({ label: `${a.name} (${a.currency})`, value: a.id }))} />
              </Form.Item>
              {editingItem.kind === 'EXCHANGE' && (
                <Form.Item name="toAmount" label="Recibe" rules={[{ required: true }, { type: 'number', min: 0.01 }]}>
                  <InputNumber style={{ width: '100%' }} min={0.01} />
                </Form.Item>
              )}
            </div>
          )}
          {!isDebt && (
            <Form.Item name="categoryId" label="Categoría">
              <TreeSelect allowClear showSearch treeData={categoryTree} treeNodeFilterProp="name" treeDefaultExpandAll placeholder="Sin categoría" />
            </Form.Item>
          )}
          <Form.Item name="notes" label="Notas">
            <Input.TextArea rows={2} />
          </Form.Item>
          {editing?.mode === 'approve' && (
            <div style={{ color: 'var(--eco-fg3)', fontSize: 12 }}>
              Se guarda lo que envió {editingItem?.author.name ?? 'el autor'} y se le avisa de las correcciones.
            </div>
          )}
        </Form>
      </Modal>

      <Modal
        open={!!rejecting}
        title={`Rechazar "${rejecting?.description ?? ''}"`}
        okText="Rechazar"
        okButtonProps={{ danger: true, disabled: reason.trim().length < 3 }}
        cancelText="Cancelar"
        confirmLoading={reject.isPending}
        onCancel={() => setRejecting(null)}
        onOk={async () => {
          await reject.mutateAsync({ id: rejecting!.id, reason: reason.trim() });
          setRejecting(null);
        }}
        destroyOnClose
      >
        <p style={{ color: 'var(--eco-fg3)' }}>
          {rejecting?.author.name ?? 'El autor'} verá el motivo y podrá corregirlo y reenviarlo.
        </p>
        <Input.TextArea
          autoFocus
          rows={3}
          maxLength={300}
          showCount
          placeholder="Motivo (p. ej. fue por BANDEC, no en efectivo)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Modal>
    </div>
  );
}
