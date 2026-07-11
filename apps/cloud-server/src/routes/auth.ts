import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { adminUsers } from '../db/schema.js';
import { signToken, requireAuth, currentUser } from '../auth/jwt.js';

const loginSchema = z.object({ username: z.string().min(1), password: z.string().min(1) });

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/login', async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });
    const { username, password } = parsed.data;
    const rows = await db.select().from(adminUsers).where(eq(adminUsers.username, username)).limit(1);
    const user = rows[0];
    if (!user) return reply.code(400).send({ error: 'invalid_credentials' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return reply.code(400).send({ error: 'invalid_credentials' });
    const token = signToken({ sub: user.id, username: user.username, role: user.role });
    return { token, user: { id: user.id, username: user.username, role: user.role } };
  });

  app.get('/auth/me', { preHandler: requireAuth }, async (req) => currentUser(req));
}
