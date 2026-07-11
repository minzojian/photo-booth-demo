import type { FastifyInstance } from 'fastify';
import type { StorageProvider } from '../storage/provider.js';

export function healthRoutes(app: FastifyInstance, provider: StorageProvider): void {
  app.get('/health', async () => ({ ok: true, ts: Date.now(), upload: provider.platform }));
}
