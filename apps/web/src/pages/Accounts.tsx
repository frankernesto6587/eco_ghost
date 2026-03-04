import { useState } from 'react';
import {
  Typography,
  Button,
  Row,
  Col,
  Card,
  Tag,
  Space,
  Modal,
  Form,
  Input,
  Select,
  Popconfirm,
  Spin,
  Empty,
  App,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  BankOutlined,
  WalletOutlined,
  MobileOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { accountsService, type CreateAccountDto, type Account } from '@/services/accounts.service';
import { usePermissions } from '@/hooks/usePermissions';
import { formatCurrency } from '@/lib/formatters';
import { CURRENCIES, AccountType } from '@ecoghost/shared';
import { useAuthStore } from '@/store/auth.store';

const { Title, Text } = Typography;

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  [AccountType.CASH]: 'Efectivo',
  [AccountType.BANK]: 'Banco',
  [AccountType.DIGITAL]: 'Digital',
  [AccountType.OTHER]: 'Otro',
};

const ACCOUNT_TYPE_COLORS: Record<string, string> = {
  [AccountType.CASH]: 'green',
  [AccountType.BANK]: 'blue',
  [AccountType.DIGITAL]: 'purple',
  [AccountType.OTHER]: 'default',
};

function getAccountIcon(type: string) {
  switch (type) {
    case AccountType.CASH:
      return <WalletOutlined />;
    case AccountType.BANK:
      return <BankOutlined />;
    case AccountType.DIGITAL:
      return <MobileOutlined />;
    default:
      return <AppstoreOutlined />;
  }
}

export default function AccountsPage() {
  const { message } = App.useApp();
  const { canManageMembers } = usePermissions(); // Accounts require OWNER or ADMIN
  const queryClient = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [form] = Form.useForm();

  // --- Queries ---

  const { data: accounts = [], isLoading } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: () => accountsService.getAll(),
  });

  // --- Mutations ---

  const createMutation = useMutation({
    mutationFn: (payload: CreateAccountDto) => accountsService.create(payload),
    onSuccess: () => {
      message.success('Cuenta creada correctamente');
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      closeModal();
    },
    onError: () => {
      message.error('Error al crear la cuenta');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<CreateAccountDto> }) =>
      accountsService.update(id, payload),
    onSuccess: () => {
      message.success('Cuenta actualizada correctamente');
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      closeModal();
    },
    onError: () => {
      message.error('Error al actualizar la cuenta');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => accountsService.remove(id),
    onSuccess: () => {
      message.success('Cuenta eliminada correctamente');
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
    onError: () => {
      message.error('Error al eliminar la cuenta');
    },
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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 8 }}>
        <Title level={2} style={{ margin: 0 }}>
          Cuentas
        </Title>
        {canManageMembers && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
            Nueva Cuenta
          </Button>
        )}
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 64 }}>
          <Spin size="large" />
        </div>
      ) : accounts.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No hay cuentas registradas"
        >
          {canManageMembers && (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
              Crear primera cuenta
            </Button>
          )}
        </Empty>
      ) : (
        <Row gutter={[16, 16]}>
          {accounts.map((account) => (
            <Col key={account.id} xs={24} sm={12} lg={8}>
              <Card
                hoverable
                actions={
                  canManageMembers
                    ? [
                        <EditOutlined key="edit" onClick={() => openEditModal(account)} />,
                        <Popconfirm
                          key="delete"
                          title="Eliminar cuenta"
                          description="Esta accion no se puede deshacer. Se eliminara la cuenta y sus datos asociados."
                          onConfirm={() => handleDelete(account.id)}
                          okText="Eliminar"
                          cancelText="Cancelar"
                          okButtonProps={{ danger: true }}
                        >
                          <DeleteOutlined />
                        </Popconfirm>,
                      ]
                    : undefined
                }
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <span style={{ fontSize: 24 }}>
                    {account.icon ? (
                      <span>{account.icon}</span>
                    ) : (
                      getAccountIcon(account.type)
                    )}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text strong style={{ fontSize: 16, display: 'block' }} ellipsis>
                      {account.name}
                    </Text>
                    <Space size={4}>
                      <Tag color={ACCOUNT_TYPE_COLORS[account.type] ?? 'default'}>
                        {ACCOUNT_TYPE_LABELS[account.type] ?? account.type}
                      </Tag>
                      <Tag>{account.currency}</Tag>
                    </Space>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <Text
                    strong
                    style={{
                      fontSize: 20,
                      color: account.balance >= 0 ? '#52c41a' : '#ff4d4f',
                    }}
                  >
                    {formatCurrency(account.balance, account.currency)}
                  </Text>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
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
          initialValues={{ type: AccountType.CASH, currency: useAuthStore.getState().currentOrg?.baseCurrency ?? 'USD' }}
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
              <Select.Option value={AccountType.CASH}>
                <WalletOutlined /> Efectivo
              </Select.Option>
              <Select.Option value={AccountType.BANK}>
                <BankOutlined /> Banco
              </Select.Option>
              <Select.Option value={AccountType.DIGITAL}>
                <MobileOutlined /> Digital
              </Select.Option>
              <Select.Option value={AccountType.OTHER}>
                <AppstoreOutlined /> Otro
              </Select.Option>
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
            <Space>
              <Button onClick={closeModal}>Cancelar</Button>
              <Button type="primary" htmlType="submit" loading={isSaving}>
                {editingAccount ? 'Guardar cambios' : 'Crear cuenta'}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
