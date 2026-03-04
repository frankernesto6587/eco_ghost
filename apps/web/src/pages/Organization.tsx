import { useState, useCallback } from 'react';
import {
  Typography,
  Tabs,
  Table,
  Tag,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Select,
  Popconfirm,
  Spin,
  Avatar,
  Card,
  Collapse,
  Checkbox,
} from 'antd';
import {
  CopyOutlined,
  ReloadOutlined,
  DeleteOutlined,
  UserOutlined,
  InfoCircleOutlined,
  LinkOutlined,
  DisconnectOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { App } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Role, CURRENCIES } from '@ecoghost/shared';
import { organizationsService, telegramService } from '@/services/organizations.service';
import type { CreateOrganizationDto } from '@/services/organizations.service';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuthStore } from '@/store/auth.store';
import { formatDate } from '@/lib/formatters';

const { Title, Text, Paragraph } = Typography;

// ---------- Types ----------

interface MemberUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

interface Member {
  id: string;
  userId: string;
  orgId: string;
  role: Role;
  createdAt: string;
  user: MemberUser;
}

interface OrgDetails {
  id: string;
  name: string;
  slug: string;
  plan: string;
  baseCurrency: string;
  inviteToken?: string;
  telegramConnected?: boolean;
}

// ---------- Role display helpers ----------

const ROLE_COLOR: Record<string, string> = {
  [Role.OWNER]: 'gold',
  [Role.ADMIN]: 'blue',
  [Role.ACCOUNTANT]: 'green',
  [Role.VIEWER]: 'default',
};

const ROLE_OPTIONS = [
  { label: 'Viewer', value: Role.VIEWER, translationKey: 'organization.roleViewer' },
  { label: 'Accountant', value: Role.ACCOUNTANT, translationKey: 'organization.roleAccountant' },
  { label: 'Admin', value: Role.ADMIN, translationKey: 'organization.roleAdmin' },
];

const getRoleLabel = (role: string, t: (key: string) => string): string => {
  const map: Record<string, string> = {
    [Role.OWNER]: t('organization.roleOwner'),
    [Role.ADMIN]: t('organization.roleAdmin'),
    [Role.ACCOUNTANT]: t('organization.roleAccountant'),
    [Role.VIEWER]: t('organization.roleViewer'),
  };
  return map[role] ?? role;
};

// ---------- Component ----------

export default function OrganizationPage() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const currentOrg = useAuthStore((state) => state.currentOrg);
  const { canManageMembers, canManageOrg } = usePermissions();

  const [settingsForm] = Form.useForm<CreateOrganizationDto>();
  const [regenerateModalOpen, setRegenerateModalOpen] = useState(false);
  const [selectedExpelIds, setSelectedExpelIds] = useState<string[]>([]);

  const orgId = currentOrg?.id ?? '';

  // ---------- Queries ----------

  const { data: members = [], isLoading: membersLoading } = useQuery<Member[]>({
    queryKey: ['members', orgId],
    queryFn: () => organizationsService.getMembers(orgId),
    enabled: !!orgId,
  });

  const { data: orgDetails } = useQuery<OrgDetails>({
    queryKey: ['org-details', orgId],
    queryFn: () => organizationsService.getOne(orgId),
    enabled: !!orgId,
  });

  // ---------- Mutations ----------

  const updateRoleMutation = useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: string }) =>
      organizationsService.updateMemberRole(orgId, memberId, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members', orgId] });
      message.success(t('organization.changeRoleSuccess'));
    },
    onError: () => {
      message.error(t('common.error'));
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (memberId: string) => organizationsService.removeMember(orgId, memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members', orgId] });
      message.success(t('organization.removeMemberSuccess'));
    },
    onError: () => {
      message.error(t('common.error'));
    },
  });

  const updateOrgMutation = useMutation({
    mutationFn: (payload: Partial<CreateOrganizationDto>) =>
      organizationsService.update(orgId, payload),
    onSuccess: (data: { name?: string; baseCurrency?: string }) => {
      const current = useAuthStore.getState().currentOrg;
      if (current) {
        const updated = {
          ...current,
          ...(data.name !== undefined && { name: data.name }),
          ...(data.baseCurrency !== undefined && { baseCurrency: data.baseCurrency }),
        };
        useAuthStore.getState().setCurrentOrg(updated);
      }
      message.success(t('organization.updateSuccess'));
    },
    onError: () => {
      message.error(t('common.error'));
    },
  });

  const regenerateTokenMutation = useMutation({
    mutationFn: (expelMemberIds?: string[]) =>
      organizationsService.regenerateToken(orgId, expelMemberIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-details', orgId] });
      queryClient.invalidateQueries({ queryKey: ['members', orgId] });
      message.success('Token regenerado');
      setRegenerateModalOpen(false);
      setSelectedExpelIds([]);
    },
    onError: () => {
      message.error(t('common.error'));
    },
  });

  const { data: webhookInfo } = useQuery({
    queryKey: ['telegram-webhook'],
    queryFn: () => telegramService.getWebhookInfo(),
    enabled: !!orgId && canManageOrg,
  });

  const [webhookUrl, setWebhookUrl] = useState('');

  const setWebhookMutation = useMutation({
    mutationFn: (url: string) => telegramService.setWebhook(url),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['telegram-webhook'] });
      message.success(`Webhook configurado: ${data.url}`);
    },
    onError: () => {
      message.error(t('common.error'));
    },
  });

  const disconnectTelegramMutation = useMutation({
    mutationFn: () => organizationsService.disconnectTelegram(orgId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-details', orgId] });
      message.success('Telegram desconectado');
    },
    onError: () => {
      message.error(t('common.error'));
    },
  });

  // ---------- Handlers ----------

  const handleRoleChange = useCallback(
    (memberId: string, role: string) => {
      updateRoleMutation.mutate({ memberId, role });
    },
    [updateRoleMutation],
  );

  const handleRemoveMember = useCallback(
    (memberId: string) => {
      removeMemberMutation.mutate(memberId);
    },
    [removeMemberMutation],
  );

  const handleSaveSettings = useCallback(async () => {
    try {
      const values = await settingsForm.validateFields();
      updateOrgMutation.mutate(values);
    } catch {
      // Validation failed
    }
  }, [settingsForm, updateOrgMutation]);

  const handleCopyToken = useCallback(() => {
    if (orgDetails?.inviteToken) {
      navigator.clipboard.writeText(orgDetails.inviteToken);
      message.success('Token copiado al portapapeles');
    }
  }, [orgDetails, message]);

  const handleRegenerateToken = useCallback(() => {
    regenerateTokenMutation.mutate(
      selectedExpelIds.length > 0 ? selectedExpelIds : undefined,
    );
  }, [regenerateTokenMutation, selectedExpelIds]);

  // ---------- Table columns ----------

  const columns: ColumnsType<Member> = [
    {
      title: t('organization.memberName'),
      dataIndex: ['user', 'name'],
      key: 'name',
      render: (_: unknown, record: Member) => (
        <Space>
          <Avatar
            src={record.user.avatarUrl}
            icon={!record.user.avatarUrl ? <UserOutlined /> : undefined}
            size="small"
          />
          {record.user.name}
        </Space>
      ),
    },
    {
      title: t('organization.memberEmail'),
      dataIndex: ['user', 'email'],
      key: 'email',
      responsive: ['md'] as any,
    },
    {
      title: t('organization.memberRole'),
      dataIndex: 'role',
      key: 'role',
      render: (role: Role, record: Member) => {
        if (canManageMembers && role !== Role.OWNER) {
          return (
            <Select
              value={role}
              size="small"
              style={{ width: 140 }}
              onChange={(value) => handleRoleChange(record.id, value)}
              options={ROLE_OPTIONS.map((opt) => ({
                label: t(opt.translationKey),
                value: opt.value,
              }))}
            />
          );
        }
        return <Tag color={ROLE_COLOR[role]}>{getRoleLabel(role, t)}</Tag>;
      },
    },
    {
      title: t('organization.memberJoined'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      responsive: ['md'] as any,
      render: (date: string) => formatDate(date),
    },
    ...(canManageMembers
      ? [
          {
            title: t('common.actions'),
            key: 'actions',
            width: 80,
            render: (_: unknown, record: Member) => {
              if (record.role === Role.OWNER) return null;
              return (
                <Popconfirm
                  title={t('organization.removeMember')}
                  description={t('organization.removeMemberConfirm')}
                  onConfirm={() => handleRemoveMember(record.id)}
                  okText={t('common.confirm')}
                  cancelText={t('common.cancel')}
                >
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              );
            },
          } as ColumnsType<Member>[number],
        ]
      : []),
  ];

  // Non-owner members for the regenerate modal checklist
  const nonOwnerMembers = members.filter((m) => m.role !== Role.OWNER);

  // ---------- Tab content ----------

  const membersContent = (
    <Table<Member>
      columns={columns}
      dataSource={members}
      rowKey="id"
      loading={membersLoading}
      pagination={false}
      scroll={{ x: 600 }}
    />
  );

  const settingsContent = canManageOrg ? (
    <div style={{ maxWidth: 560 }}>
      <Card style={{ marginBottom: 24 }}>
        <Form
          form={settingsForm}
          layout="vertical"
          initialValues={{
            name: currentOrg?.name ?? '',
            baseCurrency: currentOrg?.baseCurrency ?? 'USD',
          }}
        >
          <Form.Item
            name="name"
            label={t('organization.orgName')}
            rules={[{ required: true, message: t('organization.orgName') }]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="baseCurrency"
            label={t('organization.baseCurrency')}
            rules={[{ required: true, message: t('organization.baseCurrency') }]}
          >
            <Select
              options={CURRENCIES.map((c) => ({
                label: `${c.symbol} ${c.name} (${c.code})`,
                value: c.code,
              }))}
            />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              onClick={handleSaveSettings}
              loading={updateOrgMutation.isPending}
            >
              {t('common.save')}
            </Button>
          </Form.Item>
        </Form>
      </Card>

      {/* Invite Token Section — only for OWNER */}
      {orgDetails?.inviteToken && (
        <Card title="Token de invitacion" style={{ marginBottom: 24 }}>
          <Space.Compact style={{ width: '100%', marginBottom: 16 }}>
            <Input
              value={orgDetails.inviteToken}
              readOnly
              style={{ fontFamily: 'monospace' }}
            />
            <Button icon={<CopyOutlined />} onClick={handleCopyToken}>
              Copiar
            </Button>
          </Space.Compact>

          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              setSelectedExpelIds([]);
              setRegenerateModalOpen(true);
            }}
          >
            Regenerar token
          </Button>

          <Collapse
            ghost
            style={{ marginTop: 16 }}
            items={[
              {
                key: 'help',
                label: (
                  <Space>
                    <InfoCircleOutlined />
                    Como invitar miembros
                  </Space>
                ),
                children: (
                  <div>
                    <Paragraph>
                      <strong>1.</strong> Copia el token de invitacion usando el boton &quot;Copiar&quot;.
                    </Paragraph>
                    <Paragraph>
                      <strong>2.</strong> Comparte el token con la persona que deseas invitar (por WhatsApp, correo, en persona, etc.).
                    </Paragraph>
                    <Paragraph>
                      <strong>3.</strong> La persona pega el token en su panel usando &quot;Unirse a organizacion&quot; en el menu de organizaciones del header.
                    </Paragraph>
                    <Paragraph type="secondary">
                      Los nuevos miembros ingresan como Viewer. Puedes cambiar su rol desde la tabla de miembros.
                    </Paragraph>
                  </div>
                ),
              },
            ]}
          />
        </Card>
      )}

      {/* Telegram Section — only for OWNER */}
      {orgDetails?.inviteToken && (
        <Card title="Telegram" style={{ marginBottom: 24 }}>
          {orgDetails.telegramConnected ? (
            <div>
              <Space style={{ marginBottom: 16 }}>
                <Tag color="green">Conectado</Tag>
                <Text type="secondary">
                  Las notificaciones se envian al grupo de Telegram vinculado.
                </Text>
              </Space>
              <div>
                <Popconfirm
                  title="Desconectar Telegram"
                  description="El grupo dejara de recibir notificaciones. Puedes reconectar cuando quieras."
                  onConfirm={() => disconnectTelegramMutation.mutate()}
                  okText="Desconectar"
                  cancelText="Cancelar"
                >
                  <Button
                    icon={<DisconnectOutlined />}
                    danger
                    loading={disconnectTelegramMutation.isPending}
                  >
                    Desconectar
                  </Button>
                </Popconfirm>
              </div>
            </div>
          ) : (
            <div>
              <Paragraph type="secondary">
                Conecta un grupo de Telegram para recibir notificaciones de todas las operaciones.
              </Paragraph>
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <Button
                  type="primary"
                  icon={<LinkOutlined />}
                  href={`https://t.me/${import.meta.env.VITE_TELEGRAM_BOT_USERNAME}?startgroup=${orgDetails.inviteToken}`}
                  target="_blank"
                >
                  Conectar grupo de Telegram
                </Button>
                <Collapse
                  ghost
                  items={[
                    {
                      key: 'telegram-help',
                      label: (
                        <Space>
                          <InfoCircleOutlined />
                          Como conectar Telegram
                        </Space>
                      ),
                      children: (
                        <div>
                          <Paragraph>
                            <strong>1.</strong> Haz clic en &quot;Conectar grupo de Telegram&quot;.
                          </Paragraph>
                          <Paragraph>
                            <strong>2.</strong> Selecciona el grupo donde quieres recibir notificaciones.
                          </Paragraph>
                          <Paragraph>
                            <strong>3.</strong> El bot se conectara automaticamente a esta organizacion.
                          </Paragraph>
                          <Paragraph type="secondary">
                            Comandos disponibles en el grupo: /balance, /resumen, /deudas, /desconectar
                          </Paragraph>
                        </div>
                      ),
                    },
                  ]}
                />
              </Space>
            </div>
          )}

          {/* Webhook config */}
          <div style={{ marginTop: 24, borderTop: '1px solid #f0f0f0', paddingTop: 16 }}>
            <Text strong>Webhook</Text>
            {webhookInfo?.url ? (
              <Paragraph type="secondary" style={{ margin: '8px 0' }}>
                Actual: <Text code>{webhookInfo.url}</Text>
              </Paragraph>
            ) : (
              <Paragraph type="secondary" style={{ margin: '8px 0' }}>
                No hay webhook configurado.
              </Paragraph>
            )}
            <Space.Compact style={{ width: '100%' }}>
              <Input
                placeholder="https://tu-url.ngrok-free.app"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
              />
              <Button
                type="primary"
                onClick={() => setWebhookMutation.mutate(webhookUrl)}
                loading={setWebhookMutation.isPending}
                disabled={!webhookUrl}
              >
                Configurar
              </Button>
            </Space.Compact>
          </div>
        </Card>
      )}
    </div>
  ) : null;

  // ---------- Main render ----------

  if (!orgId) {
    return (
      <div style={{ textAlign: 'center', padding: 64 }}>
        <Spin size="large" />
      </div>
    );
  }

  const tabItems = [
    {
      key: 'members',
      label: t('organization.membersTab'),
      children: membersContent,
    },
    ...(canManageOrg
      ? [
          {
            key: 'settings',
            label: t('organization.settingsTab'),
            children: settingsContent,
          },
        ]
      : []),
  ];

  return (
    <div>
      <Title level={2} style={{ marginBottom: 24 }}>
        {currentOrg?.name ?? t('organization.title')}
      </Title>

      <Tabs items={tabItems} />

      {/* Regenerate Token Modal */}
      <Modal
        open={regenerateModalOpen}
        title="Regenerar token de invitacion"
        onCancel={() => {
          setRegenerateModalOpen(false);
          setSelectedExpelIds([]);
        }}
        onOk={handleRegenerateToken}
        okText="Regenerar"
        cancelText="Cancelar"
        confirmLoading={regenerateTokenMutation.isPending}
        destroyOnClose
      >
        <Paragraph>
          Se generara un nuevo token. El token anterior dejara de funcionar.
        </Paragraph>

        {nonOwnerMembers.length > 0 && (
          <>
            <Paragraph type="secondary">
              Opcionalmente, selecciona miembros para expulsar:
            </Paragraph>
            <Checkbox.Group
              value={selectedExpelIds}
              onChange={(values) => setSelectedExpelIds(values as string[])}
              style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
            >
              {nonOwnerMembers.map((m) => (
                <Checkbox key={m.id} value={m.id}>
                  <Space>
                    <Avatar
                      size="small"
                      src={m.user.avatarUrl}
                      icon={!m.user.avatarUrl ? <UserOutlined /> : undefined}
                    />
                    <Text>{m.user.name}</Text>
                    <Text type="secondary">({m.user.email})</Text>
                  </Space>
                </Checkbox>
              ))}
            </Checkbox.Group>
          </>
        )}
      </Modal>
    </div>
  );
}
