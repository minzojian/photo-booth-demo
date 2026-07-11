import { defineConfig } from '@umijs/max';

// 独立中台 demo：base='/'，直连 cloud-server（CORS 已开），无需 proxy。
// 注意：src/layouts/index.tsx 是 UmiJS 约定式全局布局，自动包裹所有路由，
// 因此这里不再显式引用它；登录页在该布局内按 pathname 跳过 ProLayout。
const isProd = process.env.NODE_ENV === 'production';
// 生产环境部署到 COS 子路径，开发环境保持根路径方便本地联调。
// 若 KEY_PREFIX 变更，需同步修改此处硬编码。
const basePath = isProd ? '/' : '/';
const publicPath = isProd ? '/projects/photo_booth/admin/' : '/';

export default defineConfig({
  base: basePath,
  publicPath: publicPath,
  hash: true,
  history: { type: 'hash' },
  antd: {},
  // i18n 国际化
  locale: {
    default: 'zh-CN',
    baseSeparator: '-',
    baseNavigator: true,       // 自动检测浏览器语言
    useLocalStorage: true,     // 记住用户选择
  },
  mfsu: false,
  npmClient: 'pnpm',
  title: 'Photo Booth Admin',
  routes: [
    { path: '/', redirect: '/devices' },
    { path: '/login', component: 'login' },
    { path: '/devices', component: 'devices', name: 'devices' },
    { path: '/orders', component: 'orders', name: 'orders' },
    { path: '/releases', component: 'releases', name: 'releases' },
    { path: '/admins', component: 'admins', name: 'admins' },
  ],
});
