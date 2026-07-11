import { Outlet, history, useLocation, useIntl, setLocale, getLocale } from '@umijs/max';
import { ProLayout } from '@ant-design/pro-components';
import { CameraOutlined, DesktopOutlined, PictureOutlined, TeamOutlined, LogoutOutlined, CloudUploadOutlined, GlobalOutlined } from '@ant-design/icons';
import { Button, Dropdown } from 'antd';

export default function Layout() {
  const location = useLocation();
  const intl = useIntl();
  const currentLocale = getLocale();

  const menuData = [
    { path: '/devices', name: intl.formatMessage({ id: 'menu.devices' }), icon: <DesktopOutlined /> },
    { path: '/orders', name: intl.formatMessage({ id: 'menu.orders' }), icon: <PictureOutlined /> },
    { path: '/releases', name: intl.formatMessage({ id: 'menu.releases' }), icon: <CloudUploadOutlined /> },
    { path: '/admins', name: intl.formatMessage({ id: 'menu.admins' }), icon: <TeamOutlined /> },
  ];

  // 登录页：不套 ProLayout 侧边栏（否则窄屏会出横向滚动条）
  if (location.pathname === '/login') {
    return <Outlet />;
  }

  return (
    <ProLayout
      title={intl.formatMessage({ id: 'app.title' })}
      logo={<CameraOutlined style={{ fontSize: 22 }} />}
      layout="mix"
      fixSiderbar
      location={{ pathname: location.pathname }}
      route={{ routes: menuData }}
      menuItemRender={(item, dom) => <a onClick={() => history.push(item.path!)}>{dom}</a>}
      actionsRender={() => [
        <Dropdown
          key="locale"
          menu={{
            items: [
              { key: 'zh-CN', label: '🇨🇳 中文', onClick: () => setLocale('zh-CN', false) },
              { key: 'en-US', label: '🇺🇸 English', onClick: () => setLocale('en-US', false) },
            ],
            selectedKeys: [currentLocale],
          }}
        >
          <Button type="text" icon={<GlobalOutlined />}>
            {currentLocale === 'zh-CN' ? '中文' : 'EN'}
          </Button>
        </Dropdown>,
        <Button
          key="logout"
          type="text"
          icon={<LogoutOutlined />}
          onClick={() => {
            localStorage.removeItem('admin_token');
            history.push('/login');
          }}
        >
          {intl.formatMessage({ id: 'app.logout' })}
        </Button>,
      ]}
    >
      <Outlet />
    </ProLayout>
  );
}
