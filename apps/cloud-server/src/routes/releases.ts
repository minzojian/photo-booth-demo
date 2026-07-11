import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db.js';
import { releases } from '../db/schema.js';
import { requireAuth } from '../auth/jwt.js';

const createSchema = z.object({
  version: z.string().min(1),
  platform: z.enum(['darwin', 'win32', 'linux']),
  arch: z.enum(['arm64', 'x64']),
  filename: z.string().min(1),
  size: z.number().int().positive(),
  sha512: z.string().min(1),
  cosKey: z.string().min(1),
  blockmapCosKey: z.string().optional(),
  releaseNotes: z.string().min(1, 'releaseNotes is required'),
});

export async function releaseRoutes(app: FastifyInstance): Promise<void> {
  app.get('/releases', { preHandler: requireAuth }, async (_req, reply) => {
    const list = await db.select().from(releases).orderBy(desc(releases.createdAt));
    return reply.send(list);
  });

  app.post('/releases', { preHandler: requireAuth }, async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    const data = parsed.data;
    const now = new Date();
    const id = crypto.randomUUID();
    // 新版本默认下线，避免上传后立即被客户端拉到
    await db.insert(releases).values({ ...data, id, enabled: false, createdAt: now }).onDuplicateKeyUpdate({
      set: {
        filename: data.filename,
        size: data.size,
        sha512: data.sha512,
        cosKey: data.cosKey,
        blockmapCosKey: data.blockmapCosKey ?? null,
        releaseNotes: data.releaseNotes ?? null,
        createdAt: now,
      },
    });
    const rows = await db.select().from(releases).where(
      and(eq(releases.version, data.version), eq(releases.platform, data.platform), eq(releases.arch, data.arch)),
    ).limit(1);
    return reply.code(201).send(rows[0]);
  });

  app.patch('/releases/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = z.object({ releaseNotes: z.string().min(1).optional() }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });
    const rows = await db.select().from(releases).where(eq(releases.id, id)).limit(1);
    if (!rows[0]) return reply.code(404).send({ error: 'not_found' });
    await db.update(releases).set(parsed.data).where(eq(releases.id, id));
    return reply.send({ ...rows[0], ...parsed.data });
  });

  app.delete('/releases/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await db.delete(releases).where(eq(releases.id, id));
    return reply.send({ ok: true });
  });

  app.patch('/releases/:id/toggle', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const rows = await db.select().from(releases).where(eq(releases.id, id)).limit(1);
    if (!rows[0]) return reply.code(404).send({ error: 'not_found' });
    await db.update(releases).set({ enabled: !rows[0].enabled }).where(eq(releases.id, id));
    return reply.send({ ...rows[0], enabled: !rows[0].enabled });
  });
}
