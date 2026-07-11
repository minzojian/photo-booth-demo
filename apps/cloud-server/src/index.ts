import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server as SocketServer } from 'socket.io';
import { config } from './config.js';
import { TencentCOSProvider } from './storage/tencent-cos.js';
import { initGateway } from './realtime/gateway.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { adminUserRoutes } from './routes/adminUsers.js';
import { deviceRoutes } from './routes/devices.js';
import { photoRoutes } from './routes/photos.js';
import { stsRoutes } from './routes/sts.js';
import { releaseRoutes } from './routes/releases.js';
import { updateRoutes } from './routes/updates.js';

async function main() {
  const app = Fastify({ logger: { level: 'info' }, bodyLimit: 32 * 1024 * 1024 });

  await app.register(cors, { origin: true });

  const storageProvider = new TencentCOSProvider();

  healthRoutes(app, storageProvider);
  await app.register(authRoutes);
  await app.register(adminUserRoutes);
  await app.register(deviceRoutes);
  await app.register(photoRoutes);
  await app.register(releaseRoutes);
  await app.register(updateRoutes);

  stsRoutes(app, storageProvider);

  await app.listen({ port: config.port, host: '0.0.0.0' });

  const io = new SocketServer(app.server, { cors: { origin: true }, pingInterval: 10_000, pingTimeout: 8_000 });
  initGateway(io);

  console.log(`\n  REST  http://localhost:${config.port}`);
  console.log(`  WS    ws://localhost:${config.port}  (socket.io)`);
  console.log(`  Upload: ${storageProvider.platform}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
