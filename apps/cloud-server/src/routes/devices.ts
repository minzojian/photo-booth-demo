import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, asc, desc } from 'drizzle-orm';
import { db } from '../db.js';
import { devices, photos, commandLogs } from '../db/schema.js';
import { deviceRegistry } from '../realtime/deviceRegistry.js';
import { dispatchCommand } from '../realtime/gateway.js';
import { requireAuth, currentUser } from '../auth/jwt.js';
import type { CommandType } from '@lunastudio/shared';

const createSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  location: z.string().optional(),
});
const commandSchema = z.object({
  type: z.enum(['LOCK', 'UNLOCK', 'REBOOT', 'SHUTDOWN']),
  payload: z.unknown().optional(),
});

export async function deviceRoutes(app: FastifyInstance): Promise<void> {
  app.get('/devices', { preHandler: requireAuth }, async () => {
    const rows = await db.select().from(devices).orderBy(asc(devices.createdAt));
    return rows.map((d) => {
      const live = deviceRegistry.view(d.id);
      return {
        ...d,
        online: live?.online ?? false,
        liveStatus: live?.status ?? 'offline',
        pendingUploads: live?.pendingUploads ?? 0,
        capturedCount: live?.capturedCount ?? 0,
      };
    });
  });

  app.post('/devices', { preHandler: requireAuth }, async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', detail: parsed.error.issues });
    const rows = await db.select().from(devices).where(eq(devices.id, parsed.data.id)).limit(1);
    if (rows[0]) return reply.code(409).send({ error: 'device_exists' });
    const d = { ...parsed.data, appVersion: '0.0.0', status: 'offline' as const, lastSeen: null, createdAt: new Date() };
    await db.insert(devices).values(d);
    return reply.code(201).send(d);
  });

  app.delete('/devices/:id', { preHandler: requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    await db.delete(photos).where(eq(photos.deviceId, id));
    await db.delete(commandLogs).where(eq(commandLogs.deviceId, id));
    await db.delete(devices).where(eq(devices.id, id));
    return { ok: true };
  });

  app.post('/devices/:id/commands', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = commandSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_command', detail: parsed.error.issues });
    const res = await dispatchCommand(id, parsed.data.type as CommandType, parsed.data.payload, currentUser(req).username);
    return reply.send(res);
  });

  app.get('/devices/:id/commands', { preHandler: requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    return db.select().from(commandLogs).where(eq(commandLogs.deviceId, id)).orderBy(desc(commandLogs.issuedAt)).limit(50);
  });
}
