import { useState, useCallback } from 'react';
import {
  Button,
  Modal,
  Form,
  Input,
  Select,
  Popconfirm,
  Spin,
  Avatar,
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
import { Role, CURRENCIES } from '@ecoghost/shared';
import { organizationsService, telegramService } from '@/services/organizations.service';
import type { CreateOrganizationDto } from '@/services/organizations.service';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuthStore } from '@/store/auth.store';
import { formatDate } from '@/lib/formatters';
import css from './Organization.module.css';

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

const ROLE_CLASS: Record<string, string> = {
  [Role.OWNER]: css.roleOwner,
  [Role.ADMIN]: css.roleAdmin,
  [Role.ACCOUNTANT]: css.roleAccountant,
  [Role.VIEWER]: css.roleViewer,
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

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

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
  const [activeTab, setActiveTab] = useState<'members' | 'settings'>('members');
  const [showInviteHelp, setShowInviteHelp] = useState(false);
  const [showTelegramHelp, setShowTelegramHelp] = useState(false);

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

  // Non-owner members for the regenerate modal checklist
  const nonOwnerMembers = members.filter((m) => m.role !== Role.OWNER);

  // ---------- Loading ----------

  if (!orgId) {
    return (
      <div className={css.loading}>
        <Spin size="large" />
      </div>
    );
  }

  // ---------- Tab content: Members ----------

  const membersContent = (
    <div className={css.section}>
      <div className={css.sectionHead}>
        <h3 className={css.sectionTitle}>{t('organization.membersTab')}</h3>
        <span className={css.sectionCount}>{members.length}</span>
      </div>

      {membersLoading ? (
        <div className={css.emptyState}>
          <Spin />
        </div>
      ) : members.length === 0 ? (
        <div className={css.emptyState}>Sin miembros</div>
      ) : (
        members.map((member) => (
          <div key={member.id} className={css.memberRow}>
            <div className={css.memberAvatar}>
              {member.user.avatarUrl ? (
                <img src={member.user.avatarUrl} alt={member.user.name} />
              ) : (
                getInitials(member.user.name)
              )}
            </div>

            <div className={css.memberInfo}>
              <div className={css.memberName}>{member.user.name}</div>
              <div className={css.memberEmail}>{member.user.email}</div>
            </div>

            <div className={css.memberMeta}>
              <span className={css.memberJoined}>{formatDate(member.createdAt)}</span>
              {canManageMembers && member.role !== Role.OWNER ? (
                <Select
                  value={member.role}
                  size="small"
                  style={{ width: 140 }}
                  onChange={(value) => handleRoleChange(member.id, value)}
                  options={ROLE_OPTIONS.map((opt) => ({
                    label: t(opt.translationKey),
                    value: opt.value,
                  }))}
                />
              ) : (
                <span className={ROLE_CLASS[member.role]}>
                  {getRoleLabel(member.role, t)}
                </span>
              )}
            </div>

            <div className={css.memberActions}>
              {canManageMembers && member.role !== Role.OWNER && (
                <Popconfirm
                  title={t('organization.removeMember')}
                  description={t('organization.removeMemberConfirm')}
                  onConfirm={() => handleRemoveMember(member.id)}
                  okText={t('common.confirm')}
                  cancelText={t('common.cancel')}
                >
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );

  // ---------- Tab content: Settings ----------

  const settingsContent = canManageOrg ? (
    <>
      {/* General settings */}
      <div className={css.section}>
        <div className={css.sectionHead}>
          <h3 className={css.sectionTitle}>General</h3>
        </div>
        <div className={css.sectionBody}>
          <div className={css.settingsForm}>
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
          </div>
        </div>
      </div>

      {/* Invite Token Section */}
      {orgDetails?.inviteToken && (
        <div className={css.section}>
          <div className={css.sectionHead}>
            <h3 className={css.sectionTitle}>Token de invitacion</h3>
          </div>
          <div className={css.sectionBody}>
            <div className={css.tokenRow}>
              <div className={css.tokenInput}>
                <Input value={orgDetails.inviteToken} readOnly />
              </div>
              <Button icon={<CopyOutlined />} onClick={handleCopyToken}>
                Copiar
              </Button>
            </div>

            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                setSelectedExpelIds([]);
                setRegenerateModalOpen(true);
              }}
              style={{ marginBottom: 12 }}
            >
              Regenerar token
            </Button>

            <div>
              <button
                className={css.helpToggle}
                onClick={() => setShowInviteHelp(!showInviteHelp)}
              >
                <InfoCircleOutlined />
                Como invitar miembros
              </button>
              {showInviteHelp && (
                <div className={css.helpContent}>
                  <div className={css.helpStep}>
                    <strong>1.</strong> Copia el token de invitacion usando el boton &quot;Copiar&quot;.
                  </div>
                  <div className={css.helpStep}>
                    <strong>2.</strong> Comparte el token con la persona que deseas invitar (por WhatsApp, correo, en persona, etc.).
                  </div>
                  <div className={css.helpStep}>
                    <strong>3.</strong> La persona pega el token en su panel usando &quot;Unirse a organizacion&quot; en el menu de organizaciones del header.
                  </div>
                  <div className={css.helpNote}>
                    Los nuevos miembros ingresan como Viewer. Puedes cambiar su rol desde la tabla de miembros.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Telegram Section */}
      {orgDetails?.inviteToken && (
        <div className={css.section}>
          <div className={css.sectionHead}>
            <h3 className={css.sectionTitle}>Telegram</h3>
          </div>
          <div className={css.sectionBody}>
            {orgDetails.telegramConnected ? (
              <div>
                <div className={css.telegramStatus}>
                  <span className={css.statusConnected}>Conectado</span>
                  <span className={css.statusText}>
                    Las notificaciones se envian al grupo de Telegram vinculado.
                  </span>
                </div>
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
            ) : (
              <div>
                <p className={css.statusText} style={{ marginBottom: 12 }}>
                  Conecta un grupo de Telegram para recibir notificaciones de todas las operaciones.
                </p>
                <Button
                  type="primary"
                  icon={<LinkOutlined />}
                  href={`https://t.me/${import.meta.env.VITE_TELEGRAM_BOT_USERNAME}?startgroup=${orgDetails.inviteToken}`}
                  target="_blank"
                  style={{ marginBottom: 12 }}
                >
                  Conectar grupo de Telegram
                </Button>
                <div>
                  <button
                    className={css.helpToggle}
                    onClick={() => setShowTelegramHelp(!showTelegramHelp)}
                  >
                    <InfoCircleOutlined />
                    Como conectar Telegram
                  </button>
                  {showTelegramHelp && (
                    <div className={css.helpContent}>
                      <div className={css.helpStep}>
                        <strong>1.</strong> Haz clic en &quot;Conectar grupo de Telegram&quot;.
                      </div>
                      <div className={css.helpStep}>
                        <strong>2.</strong> Selecciona el grupo donde quieres recibir notificaciones.
                      </div>
                      <div className={css.helpStep}>
                        <strong>3.</strong> El bot se conectara automaticamente a esta organizacion.
                      </div>
                      <div className={css.helpNote}>
                        Comandos disponibles en el grupo: /balance, /resumen, /deudas, /desconectar
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Webhook config */}
            <div className={css.webhookDivider}>
              <div className={css.webhookLabel}>Webhook</div>
              {webhookInfo?.url ? (
                <div className={css.webhookCurrent}>
                  Actual: <span className={css.webhookUrl}>{webhookInfo.url}</span>
                </div>
              ) : (
                <div className={css.webhookCurrent}>No hay webhook configurado.</div>
              )}
              <div className={css.webhookRow}>
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
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  ) : null;

  // ---------- Tab definitions ----------

  const tabs = [
    { key: 'members' as const, label: t('organization.membersTab') },
    ...(canManageOrg
      ? [{ key: 'settings' as const, label: t('organization.settingsTab') }]
      : []),
  ];

  // ---------- Main render ----------

  return (
    <div className={css.page}>
      <div className={css.pageHead}>
        <div>
          <h1 className={css.pageTitle}>
            {currentOrg?.name ?? t('organization.title')}
          </h1>
          {orgDetails && (
            <div className={css.pageSub}>
              {orgDetails.slug} &middot; {orgDetails.plan}
            </div>
          )}
        </div>
      </div>

      {/* Segmented tab bar */}
      <div className={css.seg}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={activeTab === tab.key ? css.segBtnOn : css.segBtn}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'members' && membersContent}
      {activeTab === 'settings' && settingsContent}

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
        <p>Se generara un nuevo token. El token anterior dejara de funcionar.</p>

        {nonOwnerMembers.length > 0 && (
          <>
            <p style={{ color: 'var(--eco-fg3)' }}>
              Opcionalmente, selecciona miembros para expulsar:
            </p>
            <Checkbox.Group
              value={selectedExpelIds}
              onChange={(values) => setSelectedExpelIds(values as string[])}
              style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
            >
              {nonOwnerMembers.map((m) => (
                <Checkbox key={m.id} value={m.id}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <Avatar
                      size="small"
                      src={m.user.avatarUrl}
                      icon={!m.user.avatarUrl ? <UserOutlined /> : undefined}
                    />
                    <span>{m.user.name}</span>
                    <span style={{ color: 'var(--eco-fg3)' }}>({m.user.email})</span>
                  </span>
                </Checkbox>
              ))}
            </Checkbox.Group>
          </>
        )}
      </Modal>
    </div>
  );
}
