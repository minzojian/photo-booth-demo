import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from './db.js';
import { adminUsers, devices } from './db/schema.js';

async function main() {
  const passwordHash = await bcrypt.hash('admin123', 10);
  const rows = await db.select().from(adminUsers).where(eq(adminUsers.username, 'admin')).limit(1);
  if (!rows[0]) {
    await db.insert(adminUsers).values({
      id: crypto.randomUUID(), username: 'admin', passwordHash, role: 'admin', createdAt: new Date(),
    });
  }

  const deviceList = [
    { id: 'kiosk-sh-001', name: '上海恒隆-01', location: '上海恒隆广场 L1' },
    { id: 'kiosk-bj-002', name: '北京SKP-02', location: '北京 SKP B1' },
    { id: 'kiosk-gz-003', name: '广州太古汇-03', location: '广州太古汇 2F' },
  ];
  for (const d of deviceList) {
    const now = new Date();
    await db.insert(devices).values({
      id: d.id, name: d.name, location: d.location, appVersion: '0.0.0', status: 'offline', createdAt: now,
    }).onDuplicateKeyUpdate({ set: { name: d.name, location: d.location } }).catch(() => undefined);
  }

  console.log('Seed done: admin / admin123, 3 devices');
}

main();
