import { useCallback, useEffect } from 'react';
import {
  Typography,
  Card,
  Form,
  Input,
  Button,
  Avatar,
  Space,
  Spin,
  Segmented,
} from 'antd';
import { UserOutlined, SunOutlined, MoonOutlined, DesktopOutlined, LockOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { App } from 'antd';
import { api } from '@/services/api';
import { useAuthStore } from '@/store/auth.store';
import { useUIStore } from '@/store/ui.store';
import type { UserProfile } from '@ecoghost/shared';

const { Title, Text } = Typography;

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

  // ---------- Queries ----------

  const { data: profile, isLoading } = useQuery<UserProfile>({
    queryKey: ['profile'],
    queryFn: fetchProfile,
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
      <div style={{ textAlign: 'center', padding: 64 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <Title level={2} style={{ marginBottom: 24 }}>
        {t('settings.title')}
      </Title>

      {/* Appearance card */}
      <Card
        title={t('settings.appearance')}
        style={{ maxWidth: 560, marginBottom: 24 }}
      >
        <div>
          <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            {t('settings.themeDescription')}
          </Text>
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
      </Card>

      {/* Profile card */}
      <Card
        title={t('settings.profile')}
        style={{ maxWidth: 560, marginBottom: 24 }}
      >
        <Space direction="vertical" align="center" style={{ width: '100%', marginBottom: 24 }}>
          <Avatar
            size={80}
            src={user?.avatarUrl}
            icon={!user?.avatarUrl ? <UserOutlined /> : undefined}
          />
          <Title level={4} style={{ margin: 0 }}>
            {user?.name}
          </Title>
          <Text type="secondary">{user?.email}</Text>
        </Space>

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

          <Form.Item>
            <Button
              type="primary"
              onClick={handleSave}
              loading={updateMutation.isPending}
            >
              {t('common.save')}
            </Button>
          </Form.Item>
        </Form>
      </Card>

      {/* Password card (only for LOCAL auth users) */}
      {!isOAuthUser && (
        <Card
          title={
            <Space>
              <LockOutlined />
              Cambiar contrasena
            </Space>
          }
          style={{ maxWidth: 560, marginBottom: 24 }}
        >
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

            <Form.Item>
              <Button
                type="primary"
                onClick={handleChangePassword}
                loading={passwordMutation.isPending}
              >
                Cambiar contrasena
              </Button>
            </Form.Item>
          </Form>
        </Card>
      )}
    </div>
  );
}
