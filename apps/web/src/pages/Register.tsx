import { Form, Input, Button, Card, Typography, Divider, Space, theme } from 'antd';
import { GoogleOutlined, MailOutlined, LockOutlined, UserOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { authService } from '@/services/auth.service';
import { APP_NAME } from '@/lib/constants';

const { Title, Text } = Typography;

export default function RegisterPage() {
  const { t } = useTranslation();
  const { register, isRegistering } = useAuth();
  const { token } = theme.useToken();

  const onFinish = (values: { name: string; email: string; password: string }) => {
    register(values);
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
      <Card style={{ width: '100%', maxWidth: 400, margin: '0 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <div style={{ textAlign: 'center' }}>
            <Title level={3} style={{ marginBottom: 4 }}>
              {APP_NAME}
            </Title>
            <Text type="secondary">{t('auth.register')}</Text>
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
              name="name"
              rules={[{ required: true, message: 'Ingrese su nombre' }]}
            >
              <Input
                prefix={<UserOutlined />}
                placeholder={t('auth.name')}
                size="large"
              />
            </Form.Item>

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
              rules={[
                { required: true, message: 'Ingrese su contrasena' },
                { min: 8, message: 'Minimo 8 caracteres' },
              ]}
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
                loading={isRegistering}
              >
                {t('auth.register')}
              </Button>
            </Form.Item>
          </Form>

          <div style={{ textAlign: 'center' }}>
            <Text type="secondary">
              Ya tienes cuenta?{' '}
              <Link to="/login">{t('auth.login')}</Link>
            </Text>
          </div>
        </Space>
      </Card>
    </div>
  );
}
