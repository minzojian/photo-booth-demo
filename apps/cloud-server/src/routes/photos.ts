import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db.js';
import { photos, devices } from '../db/schema.js';
import { config } from '../config.js';
import { requireAuth } from '../auth/jwt.js';

const createSchema = z.object({
  clientPhotoId: z.string().min(1),
  deviceId: z.string().min(1),
  filename: z.string().min(1),
  size: z.number().int().positive(),
  sha256: z.string().length(64),
  contentType: z.string().min(1),
  capturedAt: z.number().int(),
  cosKey: z.string().min(1),
  publicUrl: z.string().optional(),
});

export async function photoRoutes(app: FastifyInstance): Promise<void> {
  app.post('/photos', async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', detail: parsed.error.issues });
    const p = parsed.data;
    const now = new Date();
    await db.insert(photos).values({
      id: p.clientPhotoId,
      deviceId: p.deviceId,
      filename: p.filename,
      size: p.size,
      sha256: p.sha256,
      contentType: p.contentType,
      capturedAt: new Date(p.capturedAt),
      createdAt: now,
      cosKey: p.cosKey,
      publicUrl: p.publicUrl ?? null,
      status: 'completed',
    }).onDuplicateKeyUpdate({
      set: { status: 'completed', cosKey: p.cosKey, publicUrl: p.publicUrl ?? null },
    });
    return reply.code(201).send({ ok: true, orderId: p.clientPhotoId });
  });

  app.get('/photos', { preHandler: requireAuth }, async (req) => {
    const q = req.query as { deviceId?: string; limit?: string };
    const take = Math.min(Number(q.limit ?? 100), 500);
    const rows = await db
      .select({
        orderId: photos.id,
        deviceId: photos.deviceId,
        deviceName: devices.name,
        filename: photos.filename,
        size: photos.size,
        status: photos.status,
        cosKey: photos.cosKey,
        storagePath: photos.storagePath,
        capturedAt: photos.capturedAt,
        createdAt: photos.createdAt,
        publicUrl: photos.publicUrl,
      })
      .from(photos)
      .leftJoin(devices, eq(photos.deviceId, devices.id))
      .orderBy(desc(photos.createdAt))
      .limit(take)
      .where(q.deviceId ? eq(photos.deviceId, q.deviceId) : undefined);
    return rows.map((r) => ({
      ...r,
      previewUrl: r.publicUrl || (r.cosKey && config.cdnBase ? config.cdnBase + r.cosKey : null),
    }));
  });
}
