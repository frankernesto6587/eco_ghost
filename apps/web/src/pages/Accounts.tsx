import { useState, useMemo } from 'react';
import { Modal, Form, Input, Select, App, Dropdown } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { accountsService, type CreateAccountDto, type Account } from '@/services/accounts.service';
import { usePermissions } from '@/hooks/usePermissions';
import { formatCurrency } from '@/lib/formatters';
import { CURRENCIES, AccountType } from '@ecoghost/shared';
import { useAuthStore } from '@/store/auth.store';
import css from './Accounts.module.css';

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  [AccountType.CASH]: 'Efectivo',
  [AccountType.BANK]: 'Banco',
  [AccountType.DIGITAL]: 'Digital',
  [AccountType.OTHER]: 'Otro',
};

const TYPE_COLORS: Record<string, string> = {
  [AccountType.CASH]: '#8a7e72',
  [AccountType.BANK]: 'oklch(0.6 0.1 220)',
  [AccountType.DIGITAL]: 'oklch(0.58 0.2 300)',
  [AccountType.OTHER]: '#d4700a',
};

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

export default function AccountsPage() {
  const { message } = App.useApp();
  const { canManageMembers } = usePermissions();
  const queryClient = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [form] = Form.useForm();

  // --- Queries ---
  const { data: accounts = [], isLoading } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: () => accountsService.getAll(),
  });

  // --- Group by currency ---
  const grouped = useMemo(() => {
    const map = new Map<string, { accounts: Account[]; total: number }>();
    for (const acc of accounts) {
      const group = map.get(acc.currency) ?? { accounts: [], total: 0 };
      group.accounts.push(acc);
      group.total += acc.balance;
      map.set(acc.currency, group);
    }
    return Array.from(map.entries());
  }, [accounts]);

  // --- Mutations ---
  const createMutation = useMutation({
    mutationFn: (payload: CreateAccountDto) => accountsService.create(payload),
    onSuccess: () => {
      message.success('Cuenta creada correctamente');
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      closeModal();
    },
    onError: () => message.error('Error al crear la cuenta'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<CreateAccountDto> }) =>
      accountsService.update(id, payload),
    onSuccess: () => {
      message.success('Cuenta actualizada correctamente');
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      closeModal();
    },
    onError: () => message.error('Error al actualizar la cuenta'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => accountsService.remove(id),
    onSuccess: () => {
      message.success('Cuenta eliminada correctamente');
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
    onError: () => message.error('Error al eliminar la cuenta'),
  });

  // --- Handlers ---
  function openCreateModal() {
    setEditingAccount(null);
    form.resetFields();
    form.setFieldsValue({
      type: AccountType.CASH,
      currency: useAuthStore.getState().currentOrg?.baseCurrency ?? 'USD',
    });
    setModalOpen(true);
  }

  function openEditModal(account: Account) {
    setEditingAccount(account);
    form.setFieldsValue({
      name: account.name,
      type: account.type,
      currency: account.currency,
      icon: account.icon || undefined,
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingAccount(null);
    form.resetFields();
  }

  function handleSubmit(values: { name: string; type: string; currency: string; icon?: string }) {
    const payload: CreateAccountDto = {
      name: values.name.trim(),
      type: values.type,
      currency: values.currency,
      icon: values.icon?.trim() || undefined,
    };

    if (editingAccount) {
      updateMutation.mutate({ id: editingAccount.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function handleDelete(id: string) {
    deleteMutation.mutate(id);
  }

  // --- Render ---
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const totalAccounts = accounts.length;

  if (isLoading) {
    return (
      <div className={css.page}>
        <div className={css.loading}>
          <div style={{ color: 'var(--db-fg3)', fontFamily: "'Geist Mono', monospace", fontSize: 13 }}>
            cargando cuentas...
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
          <h1 className={css.pageTitle}>Cuentas</h1>
          <div className={css.pageSub}>
            {totalAccounts} cuenta{totalAccounts !== 1 ? 's' : ''} activa{totalAccounts !== 1 ? 's' : ''}
          </div>
        </div>
        <div className={css.pageActions}>
          {canManageMembers && (
            <button
              className="btn primary"
              onClick={openCreateModal}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                borderRadius: 8,
                border: 'none',
                background: 'var(--db-accent)',
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
              Nueva cuenta
            </button>
          )}
        </div>
      </header>

      {accounts.length === 0 ? (
        <div className={css.emptyState}>
          <div style={{ marginBottom: 16 }}>No hay cuentas registradas</div>
          {canManageMembers && (
            <button
              onClick={openCreateModal}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                borderRadius: 8,
                border: 'none',
                background: 'var(--db-accent)',
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
              Crear primera cuenta
            </button>
          )}
        </div>
      ) : (
        grouped.map(([currency, group]) => (
          <div key={currency}>
            {/* Currency group header */}
            <div className={css.groupHd}>
              <h3 className={css.groupTitle}>{currency}</h3>
              <span className={css.groupLine} />
              <span className={css.groupTotal}>
                <span className={css.groupTotalLabel}>total: </span>
                {formatCurrency(group.total, currency)}
              </span>
            </div>

            {/* Account cards grid */}
            <div className={css.accountsGrid}>
              {group.accounts.map((account) => {
                const color = TYPE_COLORS[account.type] ?? '#d4700a';
                const amt = splitAmount(account.balance);
                const initials = account.icon || getInitials(account.name);
                const typeLabel = ACCOUNT_TYPE_LABELS[account.type] ?? account.type;

                const menuItems = canManageMembers
                  ? [
                      {
                        key: 'edit',
                        label: 'Editar',
                        onClick: () => openEditModal(account),
                      },
                      {
                        key: 'delete',
                        label: 'Eliminar',
                        danger: true,
                        onClick: () => {
                          Modal.confirm({
                            title: 'Eliminar cuenta',
                            content: 'Esta accion no se puede deshacer. Se eliminara la cuenta y sus datos asociados.',
                            okText: 'Eliminar',
                            cancelText: 'Cancelar',
                            okButtonProps: { danger: true },
                            onOk: () => handleDelete(account.id),
                          });
                        },
                      },
                    ]
                  : [];

                return (
                  <article
                    key={account.id}
                    className={css.accCard}
                    style={{ '--card-color': color } as React.CSSProperties}
                    onClick={() => canManageMembers && openEditModal(account)}
                  >
                    <div className={css.accHead}>
                      <div className={css.accIcon}>{initials}</div>
                      <div className={css.accMeta}>
                        <div className={css.accName}>{account.name}</div>
                        <div className={css.accSub}>
                          {typeLabel.toLowerCase()}
                          <span className={css.accSubDot} />
                          {account.currency}
                        </div>
                      </div>
                      {canManageMembers && (
                        <Dropdown
                          menu={{ items: menuItems }}
                          trigger={['click']}
                          placement="bottomRight"
                        >
                          <button
                            className={css.accMore}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="12" cy="12" r="1.5" />
                              <circle cx="5" cy="12" r="1.5" />
                              <circle cx="19" cy="12" r="1.5" />
                            </svg>
                          </button>
                        </Dropdown>
                      )}
                    </div>

                    <div className={`${css.accBalance} ${account.balance < 0 ? css.accBalNeg : ''}`}>
                      {amt.sign}
                      <span className={css.accBalCur}>$</span>
                      {amt.integer}
                      <span className={css.accBalDec}>{amt.decimal}</span>
                    </div>

                    <div className={css.accEquiv}>
                      {account.currency.toLowerCase()} · {typeLabel.toLowerCase()}
                    </div>

                    {/* Mini chart placeholder */}
                    <div className={css.miniChart}>
                      <svg viewBox="0 0 200 40" preserveAspectRatio="none">
                        <path
                          d={generateMiniChartPath(account.id)}
                          fill="none"
                          stroke={color}
                          strokeWidth="1.5"
                        />
                      </svg>
                    </div>

                    <div className={css.accFoot}>
                      <span>ult. 30d</span>
                      <span className={account.balance >= 0 ? css.accDeltaPos : css.accDeltaNeg}>
                        {account.balance >= 0 ? '↑' : '↓'} activa
                      </span>
                    </div>
                  </article>
                );
              })}

              {/* Add new account card (only in last currency group) */}
              {canManageMembers && currency === grouped[grouped.length - 1][0] && (
                <article className={css.addCard} onClick={openCreateModal}>
                  <div className={css.addCardPlus}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </div>
                  <div className={css.addCardLabel}>agregar cuenta</div>
                  <div className={css.addCardSub}>bancaria · digital · efectivo</div>
                </article>
              )}
            </div>
          </div>
        ))
      )}

      {/* Create / Edit Modal */}
      <Modal
        title={editingAccount ? 'Editar Cuenta' : 'Nueva Cuenta'}
        open={modalOpen}
        onCancel={closeModal}
        footer={null}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{
            type: AccountType.CASH,
            currency: useAuthStore.getState().currentOrg?.baseCurrency ?? 'USD',
          }}
        >
          <Form.Item
            name="name"
            label="Nombre"
            rules={[{ required: true, message: 'El nombre es obligatorio' }]}
          >
            <Input placeholder="Ej: Efectivo casa, Banco Popular..." maxLength={100} />
          </Form.Item>

          <Form.Item
            name="type"
            label="Tipo de cuenta"
            rules={[{ required: true, message: 'Seleccione un tipo' }]}
          >
            <Select>
              <Select.Option value={AccountType.CASH}>Efectivo</Select.Option>
              <Select.Option value={AccountType.BANK}>Banco</Select.Option>
              <Select.Option value={AccountType.DIGITAL}>Digital</Select.Option>
              <Select.Option value={AccountType.OTHER}>Otro</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="currency"
            label="Moneda"
            rules={[{ required: true, message: 'Seleccione una moneda' }]}
          >
            <Select>
              {CURRENCIES.map((c) => (
                <Select.Option key={c.code} value={c.code}>
                  {c.symbol} {c.name} ({c.code})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="icon" label="Icono (opcional)">
            <Input placeholder="Emoji o texto corto" maxLength={10} />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={closeModal}
                style={{
                  padding: '7px 14px',
                  borderRadius: 8,
                  border: '1px solid var(--db-line)',
                  background: 'var(--db-surface2)',
                  color: 'var(--db-fg2)',
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
                  background: 'var(--db-accent)',
                  color: '#1a1715',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: isSaving ? 'wait' : 'pointer',
                  opacity: isSaving ? 0.7 : 1,
                  fontFamily: 'inherit',
                }}
              >
                {isSaving ? 'Guardando...' : editingAccount ? 'Guardar cambios' : 'Crear cuenta'}
              </button>
            </div>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

/** Generate a deterministic-looking mini chart path from account id */
function generateMiniChartPath(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  const points: number[] = [];
  for (let i = 0; i < 11; i++) {
    hash = ((hash * 16807) + 1) | 0;
    points.push(5 + (Math.abs(hash) % 30));
  }
  return points
    .map((y, i) => `${i === 0 ? 'M' : 'L'}${i * 20},${y}`)
    .join(' ');
}
