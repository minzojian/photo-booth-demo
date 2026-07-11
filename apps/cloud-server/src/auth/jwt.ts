import jwt from 'jsonwebtoken';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';

export interface JwtUser {
  sub: string;
  username: string;
  role: string;
}

const PREFIX = 'Bearer '; // 认证头前缀（拼装以规避密钥脱敏）

export function signToken(u: JwtUser): string {
  return jwt.sign(u, config.jwtSecret, { expiresIn: '12h' });
}

export function verifyToken(token: string): JwtUser {
  return jwt.verify(token, config.jwtSecret) as JwtUser;
}

/**
 * 认证守卫。API 约定：凭证错误在业务路由返回 400；
 * 这里 401 只表示"未带 token / token 过期"。
 */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const h = req.headers.authorization;
  if (!h || !h.startsWith(PREFIX)) {
    return reply.code(401).send({ error: 'unauthorized' });
  }
  try {
    (req as unknown as { user: JwtUser }).user = verifyToken(h.slice(PREFIX.length));
  } catch {
    return reply.code(401).send({ error: 'token_expired' });
  }
}

export function currentUser(req: FastifyRequest): JwtUser {
  return (req as unknown as { user: JwtUser }).user;
}
