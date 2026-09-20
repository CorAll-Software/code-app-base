import { LogoutOutlined, MenuOutlined, CloseOutlined, UserOutlined } from '@ant-design/icons';
import { clickable } from './core/utils/a11y';
import { Avatar, Button, Drawer, Grid, Layout, Menu, Tooltip, Typography, theme } from 'antd';
import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LoadingPage } from './layouts/loading-page';
import { TopProgress, NavProgress } from './layouts/top-progress';
import { menu } from './menu.config';
import { useAuth } from './providers/auth-provider';
import { getColorString, BRAND } from './core/color';
import { useFeedback } from './providers/message.provider';
import { PublicRoutes } from './public-router.config';
import { APP_ROUTES } from './router.config';
import { authService } from './services/auth.service';
import { ProfileDrawer } from './components/profile-drawer';
import { useProfileDrawerStore } from './store/profile-drawer.store';
import { NotificationsPopover } from './components/NotificationsPopover';
import { useNotificationsStore } from './store/notifications.store';
import { POST } from './core/http';

const { Header, Content, Sider } = Layout;
const { Text } = Typography;

const BRAND_COLOR = BRAND.primary;

function App() {

  const authContext = useAuth();
  const { notification } = useFeedback();
  const user = authContext.user;


  useEffect(() => {
    const handleOnline = () => {
      notification.success({
        message: 'Conexión a internet',
        description: 'Se ha restablecido la conexión a internet',
        placement: 'topRight',
      });
    }
    const handleOffline = () => {
      notification.error({
        message: 'Sin conexión a internet',
        description: 'Se ha perdido la conexión a internet',
        placement: 'topRight',
      });
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])


  const Nav = () => {
    const navigate = useNavigate();
    const screens = Grid.useBreakpoint();
    const { token } = theme.useToken();
    const isMobile = !screens.md;
    const [collapsed, setCollapsed] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [mobileOpenKeys, setMobileOpenKeys] = useState<string[]>([]);

    const location = useLocation().pathname;
    const pathSegments = location.split('/').filter((item) => item !== '');
    const selectedKeys = pathSegments.slice(0, 2).length > 0 ? pathSegments.slice(0, 2) : [''];

    // Auto-close mobile drawer when switching to desktop
    useEffect(() => {
      if (!isMobile) setMobileMenuOpen(false);
    }, [isMobile]);

    // Set initial open key based on current route
    useEffect(() => {
      if (pathSegments.length > 1) {
        setMobileOpenKeys([pathSegments[0]]);
      }
    }, [location]);

    // WebSocket for session monitoring
    useEffect(() => {
      if (!authContext.isAuthenticated()) return;

      let currentSocket: any;

      const connect = () => {
        const socket = authService.userActive();
        currentSocket = socket;

        socket.onMessage(async (msg) => {
          let data = msg;
          if (typeof msg === 'string' && msg.startsWith('{')) {
            try {
              data = JSON.parse(msg);
            } catch (_err) {}
          }

          if (data && typeof data === 'object') {
            // Eventos propios de un módulo: emitirlos con notifyUserJson en el
            // backend y manejar aquí su `type`.

            if (data.type === 'notification' && data.payload) {
              const notif = data.payload;
              const notificationKey = `notif_${notif.id}`;
              useNotificationsStore.getState().addNotification(notif);

              notification.info({
                message: notif.title || 'Nueva notificación',
                description: notif.message || '',
                placement: 'topRight',
                duration: 10,
                showProgress: true,
                pauseOnHover: true,
                style: { width: 320 },
                key: notificationKey,
                btn: notif.link ? (
                  <Button
                    type="primary"
                    size="small"
                    onClick={() => {
                      useNotificationsStore.getState().markAsRead(notif.id);
                      navigate(notif.link);
                      notification.destroy(notificationKey);
                    }}
                  >
                    Ir al módulo
                  </Button>
                ) : undefined,
              });
            }
          }

          if (msg === 'close') {
            notification.error({
              message: 'Sesión expirada',
              description: 'Credenciales inválidas o vencidas.',
              placement: 'topRight',
            });
            authContext.logout();
          }

          if (msg === 'reload') {
            // Consultar los permisos nuevos sin tocar el estado todavía
            try {
              const json: any = await POST('auth/verify-token', { hideNotification: true });
              if (json?.user) {
                const pathSegments = window.location.pathname.split('/').filter(Boolean);
                const currentPath = pathSegments.join('/');

                if (currentPath && currentPath !== '') {
                  const currentRoute = APP_ROUTES.find(r =>
                    r.path === currentPath ||
                    (r.path.includes(':') && currentPath.startsWith(r.path.split(':')[0]))
                  );

                  const nextPerms = new Set(json.user.permisos || []);
                  const checkSlug = (slug: any) => {
                    if (!slug) return true;
                    if (json.user.roles?.some((r: any) => r.name === 'Administrador' || r.id === 1)) return true;
                    const slugs = Array.isArray(slug) ? slug : [slug];
                    return slugs.some(s => nextPerms.has(s));
                  };

                  if (currentRoute && !checkSlug(currentRoute.slug)) {
                    // Solo si perdió acceso a donde está parado, forzar recarga y redirección
                    await authContext.refreshPermissions();
                    window.location.href = '/';
                  }
                }
              }
            } catch { /* sesión caída: el 401 ya dispara el logout */ }
          }
        });
      };

      connect();

      return () => {
        if (currentSocket) {
          currentSocket.close();
        }
      };
    }, [authContext.user]);

    if (authContext.loading) { return <LoadingPage /> }

    if (!authContext.isAuthenticated()) {
      return <PublicRoutes />;
    }

    const filterMenuItem = (item: any): any | null => {
      if (item.type === 'group') {
        const filteredChildren = (item.children || []).map(filterMenuItem).filter(Boolean);
        return filteredChildren.length > 0 ? { ...item, children: filteredChildren } : null;
      }
      if (item.children) {
        const filteredChildren = item.children
          .map((child: any) => child.type === 'group' ? filterMenuItem(child) : (authContext.hasPermission(child.slug) ? child : null))
          .filter(Boolean);
        return filteredChildren.length > 0 ? { ...item, children: filteredChildren } : null;
      }
      return authContext.hasPermission(item.slug) ? item : null;
    };

    const filteredMenu = menu.map(filterMenuItem).filter(Boolean) as any[];

    const HUBSPOT_MENU_LINKS: Record<string, string> = {
      'crm-link-portal': 'https://app.hubspot.com/',
    };

    const findMenuUrl = (items: any[], key: string): string | null => {
      for (const it of items) {
        if (it.key === key) return it.url ?? null;
        if (it.children) { const found = findMenuUrl(it.children, key); if (found) return found; }
      }
      return null;
    };

    const handleMenuClick = (item: any) => {
      const externalUrl = HUBSPOT_MENU_LINKS[item.key as string];
      if (externalUrl) {
        window.open(externalUrl, '_blank', 'noopener,noreferrer');
        if (isMobile) setMobileMenuOpen(false);
        return;
      }

      // Items under container submenus (Operaciones, Administración Interna) carry an
      // explicit `url` so we don't rely on keyPath which would build wrong paths.
      const customUrl = findMenuUrl(menu, item.key);
      if (customUrl) {
        navigate(customUrl);
        if (isMobile) setMobileMenuOpen(false);
        return;
      }

      // Standard case: immediate parent submenu key + leaf key = route path
      const leaf = item.keyPath[0];
      const parent = item.keyPath[1];
      navigate(parent ? `/${parent}/${leaf}` : `/${leaf}`);
      if (isMobile) setMobileMenuOpen(false);
    };

    // Mobile accordion: only one submenu open at a time
    const handleMobileOpenChange = (keys: string[]) => {
      const rootKeys = filteredMenu.filter(m => m.children).map(m => m.key);
      const latestOpen = keys.find(k => !mobileOpenKeys.includes(k));
      if (latestOpen && rootKeys.includes(latestOpen)) {
        setMobileOpenKeys([latestOpen]);
      } else {
        setMobileOpenKeys(keys.filter(k => !rootKeys.includes(k)));
      }
    };

    // Shared menu CSS overrides for cleaner hierarchy
    const menuStyleOverrides = `
      .app-nav-menu .ant-menu-sub .ant-menu-item {
        padding-left: 48px !important;
        font-size: 13px;
        height: 38px;
        line-height: 38px;
        margin: 2px 8px;
        border-radius: 8px;
        width: calc(100% - 16px);
      }
      .app-nav-menu .ant-menu-sub .ant-menu-item-selected {
        background: ${BRAND_COLOR}10;
        color: ${BRAND_COLOR};
        font-weight: 600;
      }
      .app-nav-menu .ant-menu-submenu-title {
        font-weight: 500;
        height: 44px !important;
        line-height: 44px !important;
        margin: 2px 8px;
        border-radius: 8px;
        width: calc(100% - 16px);
      }
      .app-nav-menu .ant-menu-submenu-selected > .ant-menu-submenu-title {
        color: ${BRAND_COLOR};
        font-weight: 600;
      }
      .app-nav-menu .ant-menu-item {
        height: 44px;
        line-height: 44px;
        font-weight: 500;
        margin: 2px 8px;
        border-radius: 8px;
        width: calc(100% - 16px);
      }
      .app-nav-menu .ant-menu-item-selected {
        background: ${BRAND_COLOR}10;
        color: ${BRAND_COLOR};
        font-weight: 600;
      }
      .app-nav-menu .ant-menu-item-selected::after {
        border-right-color: ${BRAND_COLOR};
      }
    `;

    const userName = user?.names || user?.email || 'Usuario';
    const userInitials = userName.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase();

    return (
      <>
        <style>{menuStyleOverrides}</style>
        <Layout style={{ height: '100vh', overflow: 'hidden', maxWidth: '100vw' }}>
          {/* Header */}
          <Header className="header flex-between" style={{ padding: isMobile ? '0 12px' : 15, zIndex: 101, flexShrink: 0 }}>
            <div className='flex-center-row gap-10' style={{ flexShrink: 0 }}>
              {isMobile && (
                <Button
                  type="text"
                  icon={<MenuOutlined style={{ fontSize: 20 }} />}
                  onClick={() => setMobileMenuOpen(true)}
                  style={{ color: '#fff', marginRight: 4 }}
                  aria-label="Abrir menú"
                />
              )}
              <Link className="header-logo flex-center-row gap-10 text-bold" to="/">
                <img src='/webp/logo.png' alt="Logo" style={{ height: isMobile ? '32px' : '40px', objectFit: 'contain' }} />
              </Link>
            </div>

            <div className='flex-center-row text-white-100 gap-20' style={{ minWidth: 0, flex: 1, justifyContent: 'flex-end', overflow: 'hidden' }}>
              <NotificationsPopover />
              {isMobile ? (
                <Avatar
                  size={32}
                  style={{
                    background: getColorString(userName),
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: '2px solid rgba(255,255,255,0.8)',
                    flexShrink: 0
                  }}
                  onClick={() => useProfileDrawerStore.getState().openDrawer()}
                >
                  {userInitials}
                </Avatar>
              ) : (
                <Text
                  strong
                  className='text-white-100'
                  ellipsis
                  style={{ cursor: 'pointer', fontSize: 15, maxWidth: '40%', color: 'inherit' }}
                  onClick={() => useProfileDrawerStore.getState().openDrawer()}
                >
                  {userName}
                </Text>
              )}
              {!isMobile && (
                <Tooltip title='Cerrar sesión'>
                  <Button size='large' icon={<LogoutOutlined />} type='text' className='text-white' onClick={() => authContext.logout()} />
                </Tooltip>
              )}
            </div>
          </Header>

          <Layout style={{ flex: 1, minHeight: 0, overflow: 'hidden', maxWidth: '100vw' }}>
            {/* Desktop Sider */}
            {!isMobile && (
              <Sider
                className="sidebar-scroll-invisible"
                collapsible
                collapsed={collapsed}
                onCollapse={(value) => setCollapsed(value)}
                width={220}
                style={{
                  height: 'calc(100vh - 70px)',
                  position: 'sticky',
                  top: '70px',
                  left: 0,
                  overflowY: 'auto',
                  background: '#fff',
                  borderRight: `1px solid ${token.colorBorderSecondary}`,
                }}
              >
                <Menu
                  className="app-nav-menu"
                  mode="inline"
                  selectedKeys={selectedKeys}
                  style={{ border: 'none', paddingTop: 8 }}
                  theme='light'
                  items={filteredMenu}
                  onClick={handleMenuClick}
                />
              </Sider>
            )}

            {/* Mobile Menu Drawer */}
            <Drawer
              placement="left"
              open={mobileMenuOpen}
              onClose={() => setMobileMenuOpen(false)}
              styles={{
                wrapper: { width: 300 },
                header: { background: BRAND_COLOR, padding: '16px 20px', borderBottom: 'none' },
                body: { padding: 0, display: 'flex', flexDirection: 'column' },
              }}
              title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <img src='/webp/logo.png' alt="Logo" style={{ height: 28, objectFit: 'contain', filter: 'brightness(10)' }} />
                </div>
              }
              closeIcon={<CloseOutlined style={{ color: 'rgba(255,255,255,0.8)', fontSize: 16 }} />}
            >
              {/* User profile section */}
              <div
                style={{
                  padding: '20px 20px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  cursor: 'pointer',
                  borderBottom: `1px solid ${token.colorBorderSecondary}`,
                }}
                {...clickable(() => {
                  useProfileDrawerStore.getState().openDrawer();
                  setMobileMenuOpen(false);
                })}
              >
                <Avatar
                  size={40}
                  style={{ background: BRAND_COLOR, fontWeight: 600, fontSize: 14, flexShrink: 0 }}
                  icon={!userName ? <UserOutlined /> : undefined}
                >
                  {userInitials}
                </Avatar>
                <div style={{ minWidth: 0 }}>
                  <Text strong style={{ display: 'block', fontSize: 14, lineHeight: 1.3 }} ellipsis>{userName}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>Ver perfil</Text>
                </div>
              </div>

              {/* Navigation menu - scrollable */}
              <div style={{ flex: 1, overflowY: 'auto', paddingTop: 8 }}>
                <Menu
                  className="app-nav-menu"
                  mode="inline"
                  selectedKeys={selectedKeys}
                  openKeys={mobileOpenKeys}
                  onOpenChange={handleMobileOpenChange}
                  style={{ border: 'none' }}
                  items={filteredMenu}
                  onClick={handleMenuClick}
                />
              </div>

              {/* Logout - fixed at bottom */}
              <div style={{ padding: '12px 16px', borderTop: `1px solid ${token.colorBorderSecondary}`, flexShrink: 0 }}>
                <Button
                  block
                  icon={<LogoutOutlined />}
                  onClick={() => { authContext.logout(); setMobileMenuOpen(false); }}
                  style={{
                    height: 44,
                    borderRadius: 10,
                    color: token.colorError,
                    borderColor: token.colorErrorBorder,
                  }}
                >
                  Cerrar sesión
                </Button>
              </div>
            </Drawer>

            {/* Main Content */}
            <Layout
              className="main-layout-container"
              style={{
                padding: isMobile ? '8px 4px' : '12px',
                flex: 1,
                overflowX: 'hidden',
                overflowY: 'auto',
                minHeight: 0,
                position: 'relative',
                WebkitOverflowScrolling: 'touch',
              }}
            >
              {/* Feedback de carga de rutas lazy: barra superior + overlay con spin
                  sobre el contenido actual mientras navega (transiciones ON). */}
              <NavProgress />
              <Content
                className="main-layout-content"
                style={isMobile ? { maxWidth: '100%' } : { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
              >
                <Outlet />
              </Content>
            </Layout>
          </Layout>
        </Layout>
        <ProfileDrawer />
      </>
    );
  };

  return (
    <>
      <TopProgress />
      <Nav />
    </>
  );
}

export default App
