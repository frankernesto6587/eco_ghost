import { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Dropdown, Avatar, Typography, Space, Button, Tooltip, Modal, Form, Input, Select, App, theme, Drawer } from 'antd';
import type { MenuProps } from 'antd';
import {
  DashboardOutlined,
  SwapOutlined,
  WalletOutlined,
  TeamOutlined,
  AppstoreOutlined,
  SettingOutlined,
  BankOutlined,
  UserOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SunOutlined,
  MoonOutlined,
  PlusOutlined,
  CheckOutlined,
  LoginOutlined,
  EllipsisOutlined,
  HomeOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CURRENCIES } from '@ecoghost/shared';
import { useAuthStore, useUIStore } from '@/store';
import { useAuth } from '@/hooks/useAuth';
import { useIsMobile } from '@/hooks/useIsMobile';
import { authService } from '@/services/auth.service';
import { organizationsService } from '@/services/organizations.service';
import { APP_NAME, SIDEBAR_WIDTH, SIDEBAR_COLLAPSED_WIDTH, MOBILE_TAB_BAR_HEIGHT } from '@/lib/constants';

const { Header, Sider, Content, Footer } = Layout;
const { Text } = Typography;

export function AppLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { token: themeToken } = theme.useToken();
  const { message } = App.useApp();

  const { user, currentOrg, organizations } = useAuthStore();
  const { logout } = useAuth();
  const { sidebarCollapsed, toggleSidebar, isDark, setThemeMode, setIsMobile } = useUIStore();
  const setCurrentOrg = useAuthStore((state) => state.setCurrentOrg);
  const isMobile = useIsMobile();
  const [moreDrawerOpen, setMoreDrawerOpen] = useState(false);

  const queryClient = useQueryClient();

  const [createOrgOpen, setCreateOrgOpen] = useState(false);
  const [joinOrgOpen, setJoinOrgOpen] = useState(false);
  const [createOrgForm] = Form.useForm<{ name: string; baseCurrency: string }>();
  const [joinOrgForm] = Form.useForm<{ token: string }>();

  const createOrgMutation = useMutation({
    mutationFn: (payload: { name: string; baseCurrency: string }) =>
      organizationsService.create(payload),
    onSuccess: async () => {
      setCreateOrgOpen(false);
      createOrgForm.resetFields();
      message.success('Organizacion creada');
      // Refresh profile to get updated org list
      try {
        const { user: freshUser, organizations: freshOrgs } = await authService.getProfile();
        const tokens = useAuthStore.getState().tokens;
        if (tokens) {
          useAuthStore.getState().setAuth(freshUser, tokens, freshOrgs);
          // Switch to the newly created org (last in list)
          const newOrg = freshOrgs[freshOrgs.length - 1];
          if (newOrg) useAuthStore.getState().setCurrentOrg(newOrg);
        }
      } catch { /* profile refresh failed, will catch on next page load */ }
    },
    onError: () => {
      message.error('Error al crear organizacion');
    },
  });

  const joinOrgMutation = useMutation({
    mutationFn: (token: string) => organizationsService.join(token),
    onSuccess: async (org: { id: string; name: string; slug: string; plan: string; baseCurrency: string }) => {
      setJoinOrgOpen(false);
      joinOrgForm.resetFields();
      message.success(`Te uniste a "${org.name}"`);
      // Refresh profile to get updated org list
      try {
        const { user: freshUser, organizations: freshOrgs } = await authService.getProfile();
        const tokens = useAuthStore.getState().tokens;
        if (tokens) {
          useAuthStore.getState().setAuth(freshUser, tokens, freshOrgs);
          // Switch to the joined org
          const joined = freshOrgs.find((o) => o.id === org.id);
          if (joined) useAuthStore.getState().setCurrentOrg(joined);
        }
      } catch { /* profile refresh failed */ }
      queryClient.invalidateQueries();
      navigate('/dashboard');
    },
    onError: () => {
      message.error('Token invalido o ya eres miembro');
    },
  });

  const menuItems: MenuProps['items'] = useMemo(
    () => [
      {
        key: '/dashboard',
        icon: <DashboardOutlined />,
        label: t('nav.dashboard'),
      },
      {
        key: '/transactions',
        icon: <SwapOutlined />,
        label: t('nav.transactions'),
      },
      {
        key: '/accounts',
        icon: <WalletOutlined />,
        label: t('nav.accounts'),
      },
      {
        key: '/debts',
        icon: <TeamOutlined />,
        label: t('nav.debts'),
      },
      {
        key: '/categories',
        icon: <AppstoreOutlined />,
        label: t('nav.categories'),
      },
      {
        key: '/settings',
        icon: <SettingOutlined />,
        label: t('nav.settings'),
      },
      {
        key: '/organization',
        icon: <BankOutlined />,
        label: t('nav.organization'),
      },
    ],
    [t],
  );

  const handleSwitchOrg = useCallback(
    (org: typeof organizations[number]) => {
      setCurrentOrg(org);
      queryClient.invalidateQueries();
      navigate('/dashboard');
    },
    [setCurrentOrg, queryClient, navigate],
  );

  const orgMenuItems: MenuProps['items'] = useMemo(
    () => [
      ...organizations.map((org) => ({
        key: org.id,
        label: org.name,
        icon: org.id === currentOrg?.id ? <CheckOutlined /> : undefined,
        onClick: () => handleSwitchOrg(org),
      })),
      { type: 'divider' as const },
      {
        key: 'join-org',
        label: 'Unirse a organizacion',
        icon: <LoginOutlined />,
        onClick: () => setJoinOrgOpen(true),
      },
      {
        key: 'create-org',
        label: 'Nueva organizacion',
        icon: <PlusOutlined />,
        onClick: () => setCreateOrgOpen(true),
      },
    ],
    [organizations, currentOrg, handleSwitchOrg],
  );

  const userMenuItems: MenuProps['items'] = useMemo(
    () => [
      {
        key: 'profile',
        icon: <UserOutlined />,
        label: t('nav.settings'),
        onClick: () => navigate('/settings'),
      },
      { type: 'divider' as const },
      {
        key: 'logout',
        icon: <LogoutOutlined />,
        label: 'Cerrar sesion',
        danger: true,
        onClick: () => logout(),
      },
    ],
    [t, navigate, logout],
  );

  const selectedKeys = useMemo(() => {
    const match = menuItems?.find(
      (item) => item && 'key' in item && location.pathname.startsWith(item.key as string),
    );
    return match && 'key' in match ? [match.key as string] : [];
  }, [location.pathname, menuItems]);

  // Sync isMobile state to store for use in other components
  useEffect(() => {
    setIsMobile(isMobile);
  }, [isMobile, setIsMobile]);

  // Mobile tab bar items
  const mobileTabItems = useMemo(
    () => [
      { key: '/dashboard', icon: <HomeOutlined />, label: t('nav.dashboard') },
      { key: '/transactions', icon: <SwapOutlined />, label: t('nav.transactions') },
      { key: '/accounts', icon: <WalletOutlined />, label: t('nav.accounts') },
      { key: '__more__', icon: <EllipsisOutlined />, label: 'Mas' },
    ],
    [t],
  );

  const moreMenuItems = useMemo(
    () => [
      { key: '/categories', icon: <AppstoreOutlined />, label: t('nav.categories') },
      { key: '/debts', icon: <TeamOutlined />, label: t('nav.debts') },
      { key: '/organization', icon: <BankOutlined />, label: t('nav.organization') },
      { key: '/settings', icon: <SettingOutlined />, label: t('nav.settings') },
    ],
    [t],
  );

  const activeTabKey = useMemo(() => {
    const primary = mobileTabItems.find(
      (item) => item.key !== '__more__' && location.pathname.startsWith(item.key),
    );
    if (primary) return primary.key;
    const secondary = moreMenuItems.find((item) => location.pathname.startsWith(item.key));
    if (secondary) return '__more__';
    return '/dashboard';
  }, [location.pathname, mobileTabItems, moreMenuItems]);

  // ---------- Mobile Layout ----------
  if (isMobile) {
    return (
      <Layout style={{ minHeight: '100vh' }}>
        {/* Mobile Header */}
        <Header
          style={{
            height: 48,
            lineHeight: '48px',
            padding: '0 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: `1px solid ${themeToken.colorBorderSecondary}`,
            position: 'sticky',
            top: 0,
            zIndex: 10,
            background: themeToken.colorBgContainer,
          }}
        >
          <Text strong style={{ fontSize: 16, color: themeToken.colorPrimary }}>
            {APP_NAME}
          </Text>
          <Space size="small">
            <Button
              type="text"
              size="small"
              icon={isDark ? <SunOutlined /> : <MoonOutlined />}
              onClick={() => setThemeMode(isDark ? 'light' : 'dark')}
            />
            <Dropdown menu={{ items: orgMenuItems }} placement="bottomRight">
              <Button type="text" size="small" icon={<BankOutlined />} />
            </Dropdown>
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
              <Avatar
                size="small"
                icon={<UserOutlined />}
                src={user?.avatarUrl}
                style={{ cursor: 'pointer' }}
              />
            </Dropdown>
          </Space>
        </Header>

        {/* Mobile Content */}
        <Content
          style={{
            padding: 12,
            minHeight: 280,
            paddingBottom: MOBILE_TAB_BAR_HEIGHT + 12,
          }}
        >
          <Outlet />
        </Content>

        {/* Bottom Tab Bar */}
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            height: MOBILE_TAB_BAR_HEIGHT,
            paddingBottom: 'var(--safe-area-bottom)',
            background: themeToken.colorBgContainer,
            borderTop: `1px solid ${themeToken.colorBorderSecondary}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-around',
            zIndex: 100,
          }}
        >
          {mobileTabItems.map((item) => {
            const isActive = activeTabKey === item.key;
            return (
              <div
                key={item.key}
                onClick={() => {
                  if (item.key === '__more__') {
                    setMoreDrawerOpen(true);
                  } else {
                    navigate(item.key);
                  }
                }}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: isActive ? themeToken.colorPrimary : themeToken.colorTextSecondary,
                  fontSize: 20,
                  gap: 2,
                  paddingTop: 4,
                }}
              >
                {item.icon}
                <span style={{ fontSize: 10, lineHeight: 1 }}>{item.label}</span>
              </div>
            );
          })}
        </div>

        {/* More Drawer */}
        <Drawer
          title="Mas opciones"
          placement="bottom"
          open={moreDrawerOpen}
          onClose={() => setMoreDrawerOpen(false)}
          height="auto"
          styles={{ body: { padding: 0 } }}
        >
          <Menu
            mode="vertical"
            selectedKeys={selectedKeys}
            items={moreMenuItems}
            onClick={({ key }) => {
              navigate(key);
              setMoreDrawerOpen(false);
            }}
            style={{ border: 'none' }}
          />
        </Drawer>

        {/* Join Organization Modal */}
        <Modal
          open={joinOrgOpen}
          title="Unirse a organizacion"
          onCancel={() => {
            setJoinOrgOpen(false);
            joinOrgForm.resetFields();
          }}
          onOk={() => joinOrgForm.validateFields().then((v) => joinOrgMutation.mutate(v.token))}
          okText="Unirse"
          cancelText="Cancelar"
          confirmLoading={joinOrgMutation.isPending}
          destroyOnClose
          width="90%"
        >
          <Form form={joinOrgForm} layout="vertical" preserve={false}>
            <Form.Item
              name="token"
              label="Codigo de invitacion"
              rules={[{ required: true, message: 'Pegue el codigo de invitacion' }]}
            >
              <Input placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" style={{ fontFamily: 'monospace' }} />
            </Form.Item>
          </Form>
        </Modal>

        {/* Create Organization Modal */}
        <Modal
          open={createOrgOpen}
          title="Nueva organizacion"
          onCancel={() => {
            setCreateOrgOpen(false);
            createOrgForm.resetFields();
          }}
          onOk={() => createOrgForm.validateFields().then((v) => createOrgMutation.mutate(v))}
          okText="Crear"
          cancelText="Cancelar"
          confirmLoading={createOrgMutation.isPending}
          destroyOnClose
          width="90%"
        >
          <Form form={createOrgForm} layout="vertical" preserve={false} initialValues={{ baseCurrency: 'USD' }}>
            <Form.Item
              name="name"
              label="Nombre"
              rules={[{ required: true, message: 'Ingrese el nombre' }, { min: 2, message: 'Minimo 2 caracteres' }]}
            >
              <Input placeholder="Mi organizacion" />
            </Form.Item>
            <Form.Item
              name="baseCurrency"
              label="Moneda base"
              rules={[{ required: true, message: 'Seleccione moneda' }]}
            >
              <Select
                options={CURRENCIES.map((c) => ({
                  label: `${c.symbol} ${c.name} (${c.code})`,
                  value: c.code,
                }))}
              />
            </Form.Item>
          </Form>
        </Modal>
      </Layout>
    );
  }

  // ---------- Desktop Layout ----------
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={sidebarCollapsed}
        onCollapse={toggleSidebar}
        width={SIDEBAR_WIDTH}
        collapsedWidth={SIDEBAR_COLLAPSED_WIDTH}
        trigger={null}
        style={{
          overflow: 'auto',
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          background: themeToken.colorBgContainer,
          borderRight: `1px solid ${themeToken.colorBorderSecondary}`,
        }}
      >
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderBottom: `1px solid ${themeToken.colorBorderSecondary}`,
          }}
        >
          <Text
            strong
            style={{
              fontSize: sidebarCollapsed ? 16 : 20,
              color: themeToken.colorPrimary,
            }}
          >
            {sidebarCollapsed ? 'EG' : APP_NAME}
          </Text>
        </div>

        <Menu
          mode="inline"
          selectedKeys={selectedKeys}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ borderRight: 0, marginTop: 8, background: 'transparent' }}
        />
      </Sider>

      <Layout
        style={{
          marginLeft: sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH,
          transition: 'margin-left 0.2s',
        }}
      >
        <Header
          style={{
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: `1px solid ${themeToken.colorBorderSecondary}`,
            position: 'sticky',
            top: 0,
            zIndex: 10,
            background: themeToken.colorBgContainer,
          }}
        >
          <Space>
            {sidebarCollapsed ? (
              <MenuUnfoldOutlined
                onClick={toggleSidebar}
                style={{ fontSize: 18, cursor: 'pointer' }}
              />
            ) : (
              <MenuFoldOutlined
                onClick={toggleSidebar}
                style={{ fontSize: 18, cursor: 'pointer' }}
              />
            )}
          </Space>

          <Space size="middle">
            {/* Dark Mode Toggle */}
            <Tooltip title={isDark ? t('settings.lightMode') : t('settings.darkMode')}>
              <Button
                type="text"
                icon={isDark ? <SunOutlined /> : <MoonOutlined />}
                onClick={() => setThemeMode(isDark ? 'light' : 'dark')}
              />
            </Tooltip>

            {/* Org Switcher */}
            <Dropdown menu={{ items: orgMenuItems }} placement="bottomRight">
              <Space style={{ cursor: 'pointer' }}>
                <BankOutlined />
                <Text>{currentOrg?.name ?? 'Organizacion'}</Text>
              </Space>
            </Dropdown>

            {/* User Avatar */}
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
              <Space style={{ cursor: 'pointer' }}>
                <Avatar
                  size="small"
                  icon={<UserOutlined />}
                  src={user?.avatarUrl}
                />
                <Text>{user?.name}</Text>
              </Space>
            </Dropdown>
          </Space>
        </Header>

        <Content style={{ margin: 24, minHeight: 280 }}>
          <Outlet />
        </Content>

        <Footer style={{ textAlign: 'center', color: themeToken.colorTextSecondary }}>
          {APP_NAME} &copy; {new Date().getFullYear()}
        </Footer>
      </Layout>

      {/* Join Organization Modal */}
      <Modal
        open={joinOrgOpen}
        title="Unirse a organizacion"
        onCancel={() => {
          setJoinOrgOpen(false);
          joinOrgForm.resetFields();
        }}
        onOk={() => joinOrgForm.validateFields().then((v) => joinOrgMutation.mutate(v.token))}
        okText="Unirse"
        cancelText="Cancelar"
        confirmLoading={joinOrgMutation.isPending}
        destroyOnClose
      >
        <Form form={joinOrgForm} layout="vertical" preserve={false}>
          <Form.Item
            name="token"
            label="Codigo de invitacion"
            rules={[{ required: true, message: 'Pegue el codigo de invitacion' }]}
          >
            <Input placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" style={{ fontFamily: 'monospace' }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Create Organization Modal */}
      <Modal
        open={createOrgOpen}
        title="Nueva organizacion"
        onCancel={() => {
          setCreateOrgOpen(false);
          createOrgForm.resetFields();
        }}
        onOk={() => createOrgForm.validateFields().then((v) => createOrgMutation.mutate(v))}
        okText="Crear"
        cancelText="Cancelar"
        confirmLoading={createOrgMutation.isPending}
        destroyOnClose
      >
        <Form form={createOrgForm} layout="vertical" preserve={false} initialValues={{ baseCurrency: 'USD' }}>
          <Form.Item
            name="name"
            label="Nombre"
            rules={[{ required: true, message: 'Ingrese el nombre' }, { min: 2, message: 'Minimo 2 caracteres' }]}
          >
            <Input placeholder="Mi organizacion" />
          </Form.Item>
          <Form.Item
            name="baseCurrency"
            label="Moneda base"
            rules={[{ required: true, message: 'Seleccione moneda' }]}
          >
            <Select
              options={CURRENCIES.map((c) => ({
                label: `${c.symbol} ${c.name} (${c.code})`,
                value: c.code,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  );
}
