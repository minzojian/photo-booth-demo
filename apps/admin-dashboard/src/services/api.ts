// 开发默认 localhost:4000，生产由 .env 的 UMI_APP_API_SERVER 注入
export const SERVER = (process.env.UMI_APP_API_SERVER || 'http://localhost:4000').replace(/\/$/, '');

export function getToken(): string {
  return localStorage.getItem('admin_token') || '';
}

function authHeader(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: 'Bearer ' + t } : {};
}

async function handle(res: Response) {
  if (res.status === 401) {
    localStorage.removeItem('admin_token');
    if (!location.hash.includes('/login')) location.hash = '#/login';
    throw new Error('unauthorized');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body && body.error) || 'request_failed');
  return body;
}

export async function apiGet<T = unknown>(path: string): Promise<T> {
  const res = await fetch(SERVER + path, { headers: { ...authHeader() } });
  return handle(res);
}

export async function apiSend<T = unknown>(method: string, path: string, data?: unknown): Promise<T> {
  const res = await fetch(SERVER + path, {
    method,
    headers: data !== undefined
      ? { 'Content-Type': 'application/json', ...authHeader() }
      : { ...authHeader() },
    body: data !== undefined ? JSON.stringify(data) : undefined,
  });
  return handle(res);
}

// 登录用原生 fetch，避免 401 处理器干扰（凭证错误服务端返回 400）
export async function login(username: string, password: string) {
  const res = await fetch(SERVER + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error === 'invalid_credentials' ? '用户名或密码错误' : '登录失败');
  return body as { token: string; user: { id: string; username: string; role: string } };
}
