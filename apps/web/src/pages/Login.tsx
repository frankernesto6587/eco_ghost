import { useEffect, useState } from 'react';
import { Form, Input, Button, App } from 'antd';
import { MailOutlined, LockOutlined, UserOutlined, EyeOutlined, EyeInvisibleOutlined } from '@ant-design/icons';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { authService } from '@/services/auth.service';
import styles from './Login.module.css';

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const { login, register, isLoggingIn, isRegistering } = useAuth();
  const [searchParams] = useSearchParams();
  const { message } = App.useApp();

  useEffect(() => {
    const error = searchParams.get('error');
    if (error) message.error('Error en la autenticacion con Google');
  }, [searchParams, message]);

  const onFinish = (values: { name?: string; email: string; password: string }) => {
    if (mode === 'login') {
      login({ email: values.email, password: values.password });
    } else {
      register({ name: values.name!, email: values.email, password: values.password });
    }
  };

  return (
    <div className={styles.login}>
      {/* LEFT: STORYTELLING */}
      <aside className={styles.story}>
        <div className={styles.storyDots} />

        <div className={styles.brandRow}>
          <span className={styles.logoMark}>eco</span>
          <span className={styles.badge}>alpha</span>
        </div>

        <div className={styles.headline}>
          <div className={styles.eyebrow}>
            <span className={styles.eyebrowLine} />
            finanzas personales · simples
          </div>
          <h1 className={styles.bigTitle}>
            Ordena tu <em>plata</em>.<br />
            Varias monedas.<br />
            Cero planillas.
          </h1>
          <p className={styles.lede}>
            Un solo lugar para registrar tus ingresos, gastos, transferencias y cambios — en USD, ARS y lo que te haga falta.
          </p>

          <div className={styles.floatWrap}>
            <div className={`${styles.floatCard} ${styles.balCard}`}>
              <div className={styles.floatLabel}>balance total · abr</div>
              <div className={styles.bigNum}>
                <span className={styles.cur}>$</span>12,480
                <span className={styles.dec}>.50</span>
              </div>
              <div className={styles.delta}>↑ 8.4% vs mes ant.</div>
            </div>

            <div className={`${styles.floatCard} ${styles.txCard}`}>
              <div className={styles.floatLabel}>movimientos · hoy</div>
              <div className={styles.txLine}>
                <span className={`${styles.dot} ${styles.dotInc}`} />
                <span className={styles.txText}>Acme · factura</span>
                <span className={`${styles.txNum} ${styles.pos}`}>+2,400</span>
              </div>
              <div className={styles.txLine}>
                <span className={`${styles.dot} ${styles.dotExp}`} />
                <span className={styles.txText}>Figma · anual</span>
                <span className={styles.txNum}>−144</span>
              </div>
              <div className={styles.txLine}>
                <span className={`${styles.dot} ${styles.dotTr}`} />
                <span className={styles.txText}>A visa business</span>
                <span className={styles.txNum}>↔ 1,200</span>
              </div>
            </div>
          </div>
        </div>

        <footer className={styles.storyFoot}>
          <span><span className={styles.footKey}>status</span> all systems ok</span>
          <span><span className={styles.footKey}>sync</span> 2s ago</span>
          <span><span className={styles.footKey}>build</span> 2026.04</span>
        </footer>
      </aside>

      {/* RIGHT: FORM */}
      <section className={styles.formSide}>
        <div className={styles.formWrap}>
          <h2 className={styles.formTitle}>
            {mode === 'login' ? 'Entrar' : 'Crear tu eco'}
          </h2>
          <p className={styles.formSub}>
            {mode === 'login'
              ? 'Bienvenido de vuelta. Retomemos donde lo dejaste.'
              : 'Empeza gratis. Sin tarjeta. 30 segundos.'}
          </p>

          <div className={styles.authTabs}>
            <button
              className={mode === 'login' ? styles.tabOn : styles.tab}
              onClick={() => setMode('login')}
            >
              Entrar
            </button>
            <button
              className={mode === 'register' ? styles.tabOn : styles.tab}
              onClick={() => setMode('register')}
            >
              Crear cuenta
            </button>
          </div>

          <div className={styles.social}>
            <a className={styles.socialBtn} href={authService.googleLoginUrl()}>
              <svg width="16" height="16" viewBox="0 0 48 48">
                <path fill="#FFC107" d="M43.6 20.08H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.2 8 3l5.7-5.7C34 6.05 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.92z" />
                <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.2 8 3l5.7-5.7C34 6.05 29.3 4 24 4c-7.8 0-14.5 4.3-17.7 10.7z" />
                <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3c-2 1.5-4.6 2.5-7.3 2.5-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.4 39.8 16.1 44 24 44z" />
                <path fill="#1976D2" d="M43.6 20.08H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4 5.5l6.3 5.3C41.4 36.1 44 30.4 44 24c0-1.3-.1-2.6-.4-3.92z" />
              </svg>
              Continuar con Google
            </a>
          </div>

          <div className={styles.divider}>
            <span>o con email</span>
          </div>

          <Form
            layout="vertical"
            onFinish={onFinish}
            autoComplete="off"
            key={mode}
            requiredMark={false}
          >
            {mode === 'register' && (
              <Form.Item
                name="name"
                rules={[{ required: true, message: 'Ingresa tu nombre' }]}
              >
                <Input
                  prefix={<UserOutlined />}
                  placeholder="Tu nombre"
                  size="large"
                />
              </Form.Item>
            )}

            <Form.Item
              name="email"
              rules={[
                { required: true, message: 'Ingresa tu correo' },
                { type: 'email', message: 'Correo invalido' },
              ]}
            >
              <Input
                prefix={<MailOutlined />}
                placeholder="tu@email.com"
                size="large"
              />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[
                { required: true, message: 'Ingresa tu contrasena' },
                ...(mode === 'register' ? [{ min: 8, message: 'Minimo 8 caracteres' }] : []),
              ]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="••••••••••"
                size="large"
                iconRender={(visible) =>
                  visible ? <EyeOutlined /> : <EyeInvisibleOutlined />
                }
              />
            </Form.Item>

            {mode === 'login' && (
              <div className={styles.forgotRow}>
                <Link to="#" className={styles.forgotLink}>¿Olvidaste tu contrasena?</Link>
              </div>
            )}

            <Form.Item style={{ marginBottom: 12 }}>
              <Button
                type="primary"
                htmlType="submit"
                block
                size="large"
                loading={mode === 'login' ? isLoggingIn : isRegistering}
                className={styles.bigCta}
              >
                {mode === 'login' ? 'Entrar a eco' : 'Crear cuenta'}
                <span className={styles.ctaKbd}>↵</span>
              </Button>
            </Form.Item>
          </Form>

          <p className={styles.below}>
            {mode === 'login' ? (
              <>¿Primera vez?{' '}<a href="#" onClick={(e) => { e.preventDefault(); setMode('register'); }}>Crea tu cuenta en 30s</a></>
            ) : (
              <>¿Ya tenes cuenta?{' '}<a href="#" onClick={(e) => { e.preventDefault(); setMode('login'); }}>Entrar</a></>
            )}
          </p>
        </div>

        <footer className={styles.formFoot}>
          <span>© 2026 eco</span>
          <div className={styles.formFootLinks}>
            <a href="#">Terminos</a>
            <a href="#">Privacidad</a>
          </div>
        </footer>
      </section>
    </div>
  );
}
