import { history } from '@umijs/max';

// 路由级鉴权守卫：无 token 去登录页；已登录访问登录页则回首页。
export function onRouteChange({ location }: { location: { pathname: string } }) {
  const token = localStorage.getItem('admin_token');
  const isLogin = location.pathname === '/login';
  if (!token && !isLogin) history.push('/login');
  if (token && isLogin) history.push('/devices');
}
