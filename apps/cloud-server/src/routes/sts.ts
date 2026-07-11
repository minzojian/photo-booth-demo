import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { StorageProvider } from '../storage/provider.js';

const photoBodySchema = z.object({ deviceId: z.string().min(1) });
const adminBodySchema = z.object({ scope: z.string().min(1) });

/**
 * 签发上传凭证。
 * 平台由注入的 StorageProvider 决定，路由本身不感知具体平台（COS/S3/...）。
 */
export function stsRoutes(app: FastifyInstance, provider: StorageProvider): void {
  // 前台设备上传照片
  app.post('/sts', async (req, reply) => {
    const parsed = photoBodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });
    const { deviceId } = parsed.data;

    try {
      const credentials = await provider.getUploadCredentials(deviceId);
      return credentials;
    } catch (e) {
      req.log.error(e, 'getUploadCredentials failed');
      return reply.code(502).send({ error: 'sts_failed' });
    }
  });

  // 管理员上传（升级包等），scope 如 "updates"
  app.post('/sts/admin', async (req, reply) => {
    const parsed = adminBodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });
    const { scope } = parsed.data;

    try {
      const credentials = await provider.getAdminUploadCredentials(scope);
      return credentials;
    } catch (e) {
      req.log.error(e, 'getAdminUploadCredentials failed');
      return reply.code(502).send({ error: 'sts_failed' });
    }
  });
}
