import { useCallback, useEffect, useState } from 'react';
import {
  Form,
  Input,
  Button,
  Avatar,
  Spin,
  Segmented,
} from 'antd';
import { UserOutlined, SunOutlined, MoonOutlined, DesktopOutlined, LockOutlined, SendOutlined, CopyOutlined, DisconnectOutlined, CheckOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { App } from 'antd';
import { api } from '@/services/api';
import { useAuthStore } from '@/store/auth.store';
import { useUIStore } from '@/store/ui.store';
import type { UserProfile } from '@ecoghost/shared';
import s from './Settings.module.css';

// ---------- Inline service calls ----------

async function fetchProfile(): Promise<UserProfile> {
  const { data } = await api.get('/users/profile');
  return data;
}

async function updateProfile(payload: { name: string }): Promise<UserProfile> {
  const { data } = await api.patch('/users/profile', payload);
  return data;
}

async function changePassword(payload: { currentPassword: string; newPassword: string }) {
  const { data } = await api.post('/users/change-password', payload);
  return data;
}

async function getTelegramStatus(): Promise<{ linked: boolean }> {
  const { data } = await api.get('/users/telegram-link');
  return data;
}

async function generateTelegramLink(): Promise<{ code: string; expiresAt: string }> {
  const { data } = await api.post('/users/telegram-link');
  return data;
}

async function unlinkTelegram(): Promise<void> {
  await api.delete('/users/telegram-link');
}

// ---------- Component ----------

export default function SettingsPage() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const storeUser = useAuthStore((state) => state.user);
  const { themeMode, setThemeMode } = useUIStore();
  const [form] = Form.useForm<{ name: string; email: string }>();
  const [passwordForm] = Form.useForm<{ currentPassword: string; newPassword: string; confirmPassword: string }>();

  const isOAuthUser = (storeUser as UserProfile & { provider?: string })?.provider !== 'LOCAL';
  const [telegramCode, setTelegramCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // ---------- Queries ----------

  const { data: profile, isLoading } = useQuery<UserProfile>({
    queryKey: ['profile'],
    queryFn: fetchProfile,
  });

  const { data: telegramStatus, refetch: refetchTelegram } = useQuery({
    queryKey: ['telegram-status'],
    queryFn: getTelegramStatus,
  });

  const user = profile ?? storeUser;

  // Sync form fields when profile loads
  useEffect(() => {
    if (user) {
      form.setFieldsValue({
        name: user.name,
        email: user.email,
      });
    }
  }, [user, form]);

  // ---------- Mutations ----------

  const updateMutation = useMutation({
    mutationFn: (payload: { name: string }) => updateProfile(payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      // Also update the store so the sidebar / header reflect the change immediately
      const currentState = useAuthStore.getState();
      if (currentState.user) {
        useAuthStore.setState({
          user: { ...currentState.user, name: data.name },
        });
      }
      message.success(t('settings.updateSuccess'));
    },
    onError: () => {
      message.error(t('settings.updateError'));
    },
  });

  const telegramLinkMutation = useMutation({
    mutationFn: generateTelegramLink,
    onSuccess: (data) => {
      setTelegramCode(data);
      setCopied(false);
    },
    onError: () => {
      message.error('Error al generar codigo');
    },
  });

  const telegramUnlinkMutation = useMutation({
    mutationFn: unlinkTelegram,
    onSuccess: () => {
      setTelegramCode(null);
      refetchTelegram();
      message.success('Telegram desvinculado');
    },
    onError: () => {
      message.error('Error al desvincular');
    },
  });

  const passwordMutation = useMutation({
    mutationFn: (payload: { currentPassword: string; newPassword: string }) =>
      changePassword(payload),
    onSuccess: () => {
      passwordForm.resetFields();
      message.success('Contrasena actualizada');
    },
    onError: () => {
      message.error('Error al cambiar contrasena. Verifique la contrasena actual.');
    },
  });

  // ---------- Handlers ----------

  const handleChangePassword = useCallback(async () => {
    try {
      const values = await passwordForm.validateFields();
      passwordMutation.mutate({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
    } catch {
      // Validation failed
    }
  }, [passwordForm, passwordMutation]);

  const handleSave = useCallback(async () => {
    try {
      const values = await form.validateFields();
      updateMutation.mutate({ name: values.name });
    } catch {
      // Validation failed
    }
  }, [form, updateMutation]);

  // ---------- Render ----------

  if (isLoading) {
    return (
      <div className={s.loading}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className={s.page}>
      {/* Page header */}
      <div className={s.pageHead}>
        <div>
          <h1 className={s.pageTitle}>{t('settings.title')}</h1>
          {user?.email && <p className={s.pageSub}>{user.email}</p>}
        </div>
      </div>

      <div className={s.sections}>
        {/* ── Appearance ── */}
        <div className={s.section}>
          <div className={s.sectionHead}>
            <span className={s.sectionIcon}><SunOutlined /></span>
            <h2 className={s.sectionTitle}>{t('settings.appearance')}</h2>
          </div>
          <div className={s.themeWrap}>
            <span className={s.themeDesc}>{t('settings.themeDescription')}</span>
            <Segmented
              value={themeMode}
              onChange={(val) => setThemeMode(val as 'light' | 'dark' | 'system')}
              options={[
                { label: t('settings.lightMode'), value: 'light', icon: <SunOutlined /> },
                { label: t('settings.darkMode'), value: 'dark', icon: <MoonOutlined /> },
                { label: t('settings.systemMode'), value: 'system', icon: <DesktopOutlined /> },
              ]}
            />
          </div>
        </div>

        {/* ── Profile ── */}
        <div className={s.section}>
          <div className={s.sectionHead}>
            <span className={s.sectionIcon}><UserOutlined /></span>
            <h2 className={s.sectionTitle}>{t('settings.profile')}</h2>
          </div>

          <div className={s.avatarArea}>
            <Avatar
              size={72}
              src={user?.avatarUrl}
              icon={!user?.avatarUrl ? <UserOutlined /> : undefined}
            />
            <span className={s.avatarName}>{user?.name}</span>
            <span className={s.avatarEmail}>{user?.email}</span>
          </div>

          <Form form={form} layout="vertical">
            <Form.Item
              name="name"
              label={t('settings.profileName')}
              rules={[{ required: true, message: t('settings.profileName') }]}
            >
              <Input />
            </Form.Item>

            <Form.Item name="email" label={t('settings.profileEmail')}>
              <Input disabled />
            </Form.Item>

            <Form.Item style={{ marginBottom: 0 }}>
              <Button
                type="primary"
                onClick={handleSave}
                loading={updateMutation.isPending}
              >
                {t('common.save')}
              </Button>
            </Form.Item>
          </Form>
        </div>

        {/* ── Telegram ── */}
        <div className={s.section}>
          <div className={s.sectionHead}>
            <span className={s.sectionIcon}><SendOutlined /></span>
            <h2 className={s.sectionTitle}>Vincular Telegram</h2>
          </div>

          {telegramStatus?.linked ? (
            <div>
              <div className={s.telegramStatus}>
                <span className={s.statusDot} />
                <span className={s.statusText}>Tu cuenta esta vinculada a Telegram</span>
              </div>
              <Button
                danger
                icon={<DisconnectOutlined />}
                onClick={() => telegramUnlinkMutation.mutate()}
                loading={telegramUnlinkMutation.isPending}
              >
                Desvincular
              </Button>
            </div>
          ) : (
            <div>
              <p className={s.telegramInfo}>
                Vincula tu cuenta para registrar gastos desde el grupo de Telegram.
              </p>

              <div className={s.telegramHelp}>
                <h3 className={s.telegramHelpTitle}>Como vincular</h3>
                <ol className={s.telegramHelpList}>
                  <li>Genera un codigo aqui abajo</li>
                  <li>Ve al grupo de Telegram conectado a tu organizacion</li>
                  <li>Pega el codigo de 6 digitos en el grupo</li>
                  <li>El bot confirmara la vinculacion</li>
                </ol>
              </div>

              {telegramCode ? (
                <div className={s.telegramCodeWrap}>
                  <span className={s.telegramCodeLabel}>Tu codigo (expira en 10 minutos):</span>
                  <div className={s.telegramCodeRow}>
                    <span className={s.telegramCode}>{telegramCode.code}</span>
                    <Button
                      icon={copied ? <CheckOutlined /> : <CopyOutlined />}
                      type={copied ? 'default' : 'primary'}
                      onClick={() => {
                        navigator.clipboard.writeText(telegramCode.code);
                        setCopied(true);
                        message.success('Codigo copiado');
                      }}
                    >
                      {copied ? 'Copiado' : 'Copiar'}
                    </Button>
                  </div>
                  <Button
                    type="link"
                    onClick={() => telegramLinkMutation.mutate()}
                    loading={telegramLinkMutation.isPending}
                  >
                    Generar nuevo codigo
                  </Button>
                </div>
              ) : (
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  onClick={() => telegramLinkMutation.mutate()}
                  loading={telegramLinkMutation.isPending}
                >
                  Generar codigo de vinculacion
                </Button>
              )}
            </div>
          )}
        </div>

        {/* ── Password (only for LOCAL auth users) ── */}
        {!isOAuthUser && (
          <div className={s.section}>
            <div className={s.sectionHead}>
              <span className={s.sectionIcon}><LockOutlined /></span>
              <h2 className={s.sectionTitle}>Cambiar contrasena</h2>
            </div>

            <Form form={passwordForm} layout="vertical">
              <Form.Item
                name="currentPassword"
                label="Contrasena actual"
                rules={[{ required: true, message: 'Ingrese su contrasena actual' }]}
              >
                <Input.Password />
              </Form.Item>

              <Form.Item
                name="newPassword"
                label="Nueva contrasena"
                rules={[
                  { required: true, message: 'Ingrese la nueva contrasena' },
                  { min: 8, message: 'Minimo 8 caracteres' },
                ]}
              >
                <Input.Password />
              </Form.Item>

              <Form.Item
                name="confirmPassword"
                label="Confirmar contrasena"
                dependencies={['newPassword']}
                rules={[
                  { required: true, message: 'Confirme la nueva contrasena' },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue('newPassword') === value) {
                        return Promise.resolve();
                      }
                      return Promise.reject(new Error('Las contrasenas no coinciden'));
                    },
                  }),
                ]}
              >
                <Input.Password />
              </Form.Item>

              <Form.Item style={{ marginBottom: 0 }}>
                <Button
                  type="primary"
                  onClick={handleChangePassword}
                  loading={passwordMutation.isPending}
                >
                  Cambiar contrasena
                </Button>
              </Form.Item>
            </Form>
          </div>
        )}
      </div>
    </div>
  );
}
