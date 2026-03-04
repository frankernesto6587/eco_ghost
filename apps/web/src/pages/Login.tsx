import { useEffect } from 'react';
import { Form, Input, Button, Card, Typography, Divider, Space, App, theme } from 'antd';
import { GoogleOutlined, MailOutlined, LockOutlined } from '@ant-design/icons';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { authService } from '@/services/auth.service';
import { APP_NAME } from '@/lib/constants';

const { Title, Text } = Typography;

export default function LoginPage() {
  const { t } = useTranslation();
  const { login, isLoggingIn } = useAuth();
  const { token } = theme.useToken();
  const [searchParams] = useSearchParams();
  const { message } = App.useApp();

  useEffect(() => {
    const error = searchParams.get('error');
    if (error) {
      message.error('Error en la autenticacion con Google');
    }
  }, [searchParams, message]);

  const onFinish = (values: { email: string; password: string }) => {
    login(values);
  };

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: token.colorBgLayout,
      }}
    >
      <Card style={{ width: 400, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <div style={{ textAlign: 'center' }}>
            <Title level={3} style={{ marginBottom: 4 }}>
              {APP_NAME}
            </Title>
            <Text type="secondary">{t('auth.login')}</Text>
          </div>

          <Button
            block
            size="large"
            icon={<GoogleOutlined />}
            href={authService.googleLoginUrl()}
          >
            {t('auth.loginWithGoogle')}
          </Button>

          <Divider plain>o</Divider>

          <Form layout="vertical" onFinish={onFinish} autoComplete="off">
            <Form.Item
              name="email"
              rules={[
                { required: true, message: 'Ingrese su correo' },
                { type: 'email', message: 'Correo invalido' },
              ]}
            >
              <Input
                prefix={<MailOutlined />}
                placeholder={t('auth.email')}
                size="large"
              />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[{ required: true, message: 'Ingrese su contrasena' }]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder={t('auth.password')}
                size="large"
              />
            </Form.Item>

            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                block
                size="large"
                loading={isLoggingIn}
              >
                {t('auth.login')}
              </Button>
            </Form.Item>
          </Form>

          <div style={{ textAlign: 'center' }}>
            <Text type="secondary">
              No tienes cuenta?{' '}
              <Link to="/register">{t('auth.register')}</Link>
            </Text>
          </div>
        </Space>
      </Card>
    </div>
  );
}
