import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { eq, asc, count } from 'drizzle-orm';
import { db } from '../db.js';
import { adminUsers } from '../db/schema.js';
import { requireAuth, currentUser } from '../auth/jwt.js';

const createSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
  role: z.string().optional(),
});
const pwdSchema = z.object({ password: z.string().min(6) });

export async function adminUserRoutes(app: FastifyInstance): Promise<void> {
  app.get('/admin/users', { preHandler: requireAuth }, async () => {
    const rows = await db.select().from(adminUsers).orderBy(asc(adminUsers.createdAt));
    return rows.map((u) => ({ id: u.id, username: u.username, role: u.role, createdAt: u.createdAt }));
  });

  app.post('/admin/users', { preHandler: requireAuth }, async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', detail: parsed.error.issues });
    const { username, password, role } = parsed.data;
    const rows = await db.select().from(adminUsers).where(eq(adminUsers.username, username)).limit(1);
    if (rows[0]) return reply.code(409).send({ error: 'username_taken' });
    const passwordHash = await bcrypt.hash(password, 10);
    const id = crypto.randomUUID();
    const now = new Date();
    await db.insert(adminUsers).values({ id, username, passwordHash, role: role ?? 'admin', createdAt: now });
    return reply.code(201).send({ id, username, role: role ?? 'admin', createdAt: now });
  });

  app.post('/admin/users/:id/password', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = pwdSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });
    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    await db.update(adminUsers).set({ passwordHash }).where(eq(adminUsers.id, id));
    return { ok: true };
  });

  app.delete('/admin/users/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (currentUser(req).sub === id) return reply.code(400).send({ error: 'cannot_delete_self' });
    const cnt = await db.select({ count: count() }).from(adminUsers);
    if (Number(cnt[0].count) <= 1) return reply.code(400).send({ error: 'cannot_delete_last_admin' });
    await db.delete(adminUsers).where(eq(adminUsers.id, id));
    return { ok: true };
  });
}
