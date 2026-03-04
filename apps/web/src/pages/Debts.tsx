import { useState, useMemo } from 'react';
import {
  Typography,
  Button,
  Card,
  Table,
  Tag,
  Space,
  Modal,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  DatePicker,
  Popconfirm,
  Spin,
  Empty,
  App,
  Segmented,
  Descriptions,
  List,
  Divider,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  EyeOutlined,
  DollarOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { debtsService, type CreateDebtDto, type AddPaymentDto } from '@/services/debts.service';
import { accountsService } from '@/services/accounts.service';
import type { Account } from '@/services/accounts.service';
import { usePermissions } from '@/hooks/usePermissions';
import { useIsMobile } from '@/hooks/useIsMobile';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { DebtType, DebtStatus } from '@ecoghost/shared';

const { Title, Text } = Typography;
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

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  [DebtStatus.PENDING]: { color: 'orange', label: 'Pendiente' },
  [DebtStatus.PARTIAL]: { color: 'blue', label: 'Parcial' },
  [DebtStatus.PAID]: { color: 'green', label: 'Pagada' },
};

const TYPE_CONFIG: Record<string, { color: string; label: string }> = {
  [DebtType.RECEIVABLE]: { color: 'green', label: 'Me deben' },
  [DebtType.PAYABLE]: { color: 'red', label: 'Debo' },
};

function DebtCard({
  debt,
  canWrite,
  onView,
  onEdit,
  onDelete,
}: {
  debt: Debt;
  canWrite: boolean;
  onView: (id: string) => void;
  onEdit: (debt: Debt) => void;
  onDelete: (id: string) => void;
}) {
  const remaining = debt.totalAmount - debt.paidAmount;
  const statusCfg = STATUS_CONFIG[debt.status];
  const typeCfg = TYPE_CONFIG[debt.type];

  return (
    <Card
      size="small"
      style={{ marginBottom: 8 }}
      onClick={() => onView(debt.id)}
      hoverable
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text strong ellipsis style={{ display: 'block', marginBottom: 4 }}>
            {debt.personName}
          </Text>
          <Space size={4} wrap>
            <Tag color={typeCfg?.color}>{typeCfg?.label ?? debt.type}</Tag>
            <Tag color={statusCfg?.color}>{statusCfg?.label ?? debt.status}</Tag>
          </Space>
          {debt.dueDate && (
            <div style={{ marginTop: 4 }}>
              <Text
                type={dayjs(debt.dueDate).isBefore(dayjs(), 'day') ? 'danger' : 'secondary'}
                style={{ fontSize: 12 }}
              >
                Vence: {formatDate(debt.dueDate)}
              </Text>
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right', marginLeft: 8, flexShrink: 0 }}>
          <Text strong style={{ fontSize: 14 }}>
            {formatCurrency(debt.totalAmount, debt.currency)}
          </Text>
          {remaining > 0 && (
            <div>
              <Text type="warning" style={{ fontSize: 12 }}>
                Resta: {formatCurrency(remaining, debt.currency)}
              </Text>
            </div>
          )}
          {canWrite && (
            <Space size={4} style={{ marginTop: 4 }}>
              <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
                onClick={(e) => { e.stopPropagation(); onEdit(debt); }}
              />
              <Popconfirm
                title="Eliminar deuda"
                description="Esta accion no se puede deshacer."
                onConfirm={() => onDelete(debt.id)}
                okText="Eliminar"
                cancelText="Cancelar"
                okButtonProps={{ danger: true }}
              >
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={(e) => e.stopPropagation()}
                />
              </Popconfirm>
            </Space>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function DebtsPage() {
  const { message } = App.useApp();
  const { canWrite } = usePermissions();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();

  const [activeFilter, setActiveFilter] = useState<FilterTab>('ALL');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedDebtId, setSelectedDebtId] = useState<string | null>(null);

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

  const { data: debtDetail, isLoading: isLoadingDetail } = useQuery<DebtDetail>({
    queryKey: ['debts', selectedDebtId],
    queryFn: () => debtsService.getOne(selectedDebtId!),
    enabled: !!selectedDebtId,
  });

  // --- Filtered data ---

  const filteredDebts = useMemo(() => {
    if (activeFilter === 'ALL') return debts;
    return debts.filter((d) => d.type === activeFilter);
  }, [debts, activeFilter]);

  // --- Mutations ---

  const createMutation = useMutation({
    mutationFn: (payload: CreateDebtDto) => debtsService.create(payload),
    onSuccess: () => {
      message.success('Deuda creada correctamente');
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      closeDebtModal();
    },
    onError: () => {
      message.error('Error al crear la deuda');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<CreateDebtDto> }) =>
      debtsService.update(id, payload),
    onSuccess: () => {
      message.success('Deuda actualizada correctamente');
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      closeDebtModal();
    },
    onError: () => {
      message.error('Error al actualizar la deuda');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => debtsService.remove(id),
    onSuccess: () => {
      message.success('Deuda eliminada correctamente');
      queryClient.invalidateQueries({ queryKey: ['debts'] });
    },
    onError: () => {
      message.error('Error al eliminar la deuda');
    },
  });

  const addPaymentMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: AddPaymentDto }) =>
      debtsService.addPayment(id, payload),
    onSuccess: () => {
      message.success('Pago registrado correctamente');
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      paymentForm.resetFields();
    },
    onError: () => {
      message.error('Error al registrar el pago');
    },
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

  function openDrawer(debtId: string) {
    setSelectedDebtId(debtId);
    paymentForm.resetFields();
    paymentForm.setFieldsValue({ date: dayjs() });
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setSelectedDebtId(null);
    paymentForm.resetFields();
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
    if (!selectedDebtId) return;

    const payload: AddPaymentDto = {
      amount: Math.round(values.amount * 100),
      date: values.date.toISOString(),
      accountId: values.accountId,
      description: values.description?.trim(),
    };

    addPaymentMutation.mutate({ id: selectedDebtId, payload });
  }

  function handleDelete(id: string) {
    deleteMutation.mutate(id);
  }

  // --- Table columns ---

  const columns: ColumnsType<Debt> = [
    {
      title: 'Persona',
      dataIndex: 'personName',
      key: 'personName',
      ellipsis: true,
    },
    {
      title: 'Descripcion',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      responsive: ['md'],
      render: (text: string) => text || '-',
    },
    {
      title: 'Monto total',
      dataIndex: 'totalAmount',
      key: 'totalAmount',
      align: 'right',
      render: (amount: number, record: Debt) => formatCurrency(amount, record.currency),
      sorter: (a, b) => a.totalAmount - b.totalAmount,
    },
    {
      title: 'Pagado',
      dataIndex: 'paidAmount',
      key: 'paidAmount',
      align: 'right',
      render: (amount: number, record: Debt) => formatCurrency(amount, record.currency),
    },
    {
      title: 'Restante',
      key: 'remaining',
      align: 'right',
      render: (_: unknown, record: Debt) =>
        formatCurrency(record.totalAmount - record.paidAmount, record.currency),
    },
    {
      title: 'Estado',
      dataIndex: 'status',
      key: 'status',
      render: (status: DebtStatus) => {
        const config = STATUS_CONFIG[status];
        return <Tag color={config?.color}>{config?.label ?? status}</Tag>;
      },
      filters: [
        { text: 'Pendiente', value: DebtStatus.PENDING },
        { text: 'Parcial', value: DebtStatus.PARTIAL },
        { text: 'Pagada', value: DebtStatus.PAID },
      ],
      onFilter: (value, record) => record.status === value,
    },
    {
      title: 'Tipo',
      dataIndex: 'type',
      key: 'type',
      render: (type: DebtType) => {
        const config = TYPE_CONFIG[type];
        return <Tag color={config?.color}>{config?.label ?? type}</Tag>;
      },
    },
    {
      title: 'Vencimiento',
      dataIndex: 'dueDate',
      key: 'dueDate',
      responsive: ['lg'],
      render: (date: string | undefined) => {
        if (!date) return '-';
        const isOverdue = dayjs(date).isBefore(dayjs(), 'day');
        return (
          <Text type={isOverdue ? 'danger' : undefined}>
            {formatDate(date)}
          </Text>
        );
      },
      sorter: (a, b) => {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return dayjs(a.dueDate).unix() - dayjs(b.dueDate).unix();
      },
    },
    {
      title: 'Acciones',
      key: 'actions',
      width: 180,
      render: (_: unknown, record: Debt) => (
        <Space size="small">
          <Button
            type="text"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => openDrawer(record.id)}
            title="Ver detalles"
          />
          {canWrite && record.status !== DebtStatus.PAID && (
            <Button
              type="text"
              size="small"
              icon={<DollarOutlined />}
              onClick={() => openDrawer(record.id)}
              title="Agregar pago"
            />
          )}
          {canWrite && (
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => openEditModal(record)}
              title="Editar"
            />
          )}
          {canWrite && (
            <Popconfirm
              title="Eliminar deuda"
              description="Esta accion no se puede deshacer."
              onConfirm={() => handleDelete(record.id)}
              okText="Eliminar"
              cancelText="Cancelar"
              okButtonProps={{ danger: true }}
            >
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                title="Eliminar"
              />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  // --- Render ---

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const remainingOnSelected = debtDetail
    ? debtDetail.totalAmount - debtDetail.paidAmount
    : 0;
  const detailCurrency = debtDetail?.currency ?? 'USD';

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 8 }}>
        <Title level={isMobile ? 3 : 2} style={{ margin: 0 }}>
          Deudas
        </Title>
        {canWrite && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
            {isMobile ? 'Nueva' : 'Nueva Deuda'}
          </Button>
        )}
      </div>

      {/* Filter tabs */}
      <div style={{ marginBottom: 16 }}>
        <Segmented
          value={activeFilter}
          onChange={(val) => setActiveFilter(val as FilterTab)}
          options={[
            { label: 'Todas', value: 'ALL' },
            { label: 'Me deben', value: DebtType.RECEIVABLE },
            { label: 'Debo', value: DebtType.PAYABLE },
          ]}
        />
      </div>

      {/* Debts table / cards */}
      {isMobile ? (
        isLoading ? (
          <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
        ) : filteredDebts.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No hay deudas registradas" />
        ) : (
          filteredDebts.map((debt) => (
            <DebtCard
              key={debt.id}
              debt={debt}
              canWrite={canWrite}
              onView={openDrawer}
              onEdit={openEditModal}
              onDelete={handleDelete}
            />
          ))
        )
      ) : (
        <Table<Debt>
          columns={columns}
          dataSource={filteredDebts}
          rowKey="id"
          loading={isLoading}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showTotal: (total) => `${total} deudas`,
          }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="No hay deudas registradas"
              />
            ),
          }}
          scroll={{ x: 800 }}
        />
      )}

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
            <TextArea
              placeholder="Descripcion o motivo de la deuda"
              rows={3}
              maxLength={500}
            />
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
            <DatePicker
              style={{ width: '100%' }}
              format="DD/MM/YYYY"
              placeholder="Seleccione una fecha"
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={closeDebtModal}>Cancelar</Button>
              <Button type="primary" htmlType="submit" loading={isSaving}>
                {editingDebt ? 'Guardar cambios' : 'Crear deuda'}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Debt Detail + Payment Drawer */}
      <Drawer
        title="Detalle de deuda"
        open={drawerOpen}
        onClose={closeDrawer}
        width={isMobile ? '100%' : 520}
        destroyOnClose
      >
        {isLoadingDetail ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin size="large" />
          </div>
        ) : debtDetail ? (
          <>
            {/* Debt summary */}
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="Persona">
                {debtDetail.personName}
              </Descriptions.Item>
              {debtDetail.description && (
                <Descriptions.Item label="Descripcion">
                  {debtDetail.description}
                </Descriptions.Item>
              )}
              <Descriptions.Item label="Tipo">
                <Tag color={TYPE_CONFIG[debtDetail.type]?.color}>
                  {TYPE_CONFIG[debtDetail.type]?.label ?? debtDetail.type}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Monto total">
                {formatCurrency(debtDetail.totalAmount, detailCurrency)}
              </Descriptions.Item>
              <Descriptions.Item label="Pagado">
                {formatCurrency(debtDetail.paidAmount, detailCurrency)}
              </Descriptions.Item>
              <Descriptions.Item label="Restante">
                <Text strong type={remainingOnSelected > 0 ? 'warning' : 'success'}>
                  {formatCurrency(remainingOnSelected, detailCurrency)}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="Estado">
                <Tag color={STATUS_CONFIG[debtDetail.status]?.color}>
                  {STATUS_CONFIG[debtDetail.status]?.label ?? debtDetail.status}
                </Tag>
              </Descriptions.Item>
              {debtDetail.dueDate && (
                <Descriptions.Item label="Vencimiento">
                  {formatDate(debtDetail.dueDate)}
                </Descriptions.Item>
              )}
              <Descriptions.Item label="Creada">
                {formatDate(debtDetail.createdAt)}
              </Descriptions.Item>
            </Descriptions>

            {/* Payment history */}
            <Divider orientation="left">Historial de pagos</Divider>

            {debtDetail.transactions && debtDetail.transactions.length > 0 ? (
              <List
                size="small"
                dataSource={debtDetail.transactions}
                renderItem={(tx) => (
                  <List.Item>
                    <List.Item.Meta
                      title={
                        <Space>
                          <Text>{formatDate(tx.date)}</Text>
                          {tx.account && (
                            <Tag>{tx.account.name}</Tag>
                          )}
                        </Space>
                      }
                      description={tx.description || undefined}
                    />
                    <Text strong style={{ color: '#52c41a' }}>
                      {formatCurrency(tx.amount, tx.account?.currency ?? 'USD')}
                    </Text>
                  </List.Item>
                )}
              />
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="No hay pagos registrados"
              />
            )}

            {/* Add payment form */}
            {canWrite && debtDetail.status !== DebtStatus.PAID && (
              <>
                <Divider orientation="left">Registrar pago</Divider>
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
                      {
                        type: 'number',
                        min: 0.01,
                        message: 'El monto debe ser mayor a 0',
                      },
                      {
                        type: 'number',
                        max: remainingOnSelected / 100,
                        message: `El monto no puede superar ${formatCurrency(remainingOnSelected, detailCurrency)}`,
                      },
                    ]}
                  >
                    <InputNumber
                      style={{ width: '100%' }}
                      placeholder="0.00"
                      min={0.01}
                      max={remainingOnSelected / 100}
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
                    <DatePicker
                      style={{ width: '100%' }}
                      format="DD/MM/YYYY"
                    />
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
                    <Button
                      type="primary"
                      htmlType="submit"
                      loading={addPaymentMutation.isPending}
                      block
                      icon={<DollarOutlined />}
                    >
                      Registrar pago
                    </Button>
                  </Form.Item>
                </Form>
              </>
            )}
          </>
        ) : (
          <Empty description="No se encontro la deuda" />
        )}
      </Drawer>
    </div>
  );
}
