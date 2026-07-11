import { mysqlTable, varchar, int, boolean, datetime, text, index, unique } from 'drizzle-orm/mysql-core';

// ── AdminUser ────────────────────────────────────────────────────────────
export const adminUsers = mysqlTable('AdminUser', {
  id: varchar('id', { length: 36 }).primaryKey(),
  username: varchar('username', { length: 255 }).notNull().unique(),
  passwordHash: varchar('passwordHash', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).notNull().default('admin'),
  createdAt: datetime('createdAt').notNull(),
});

// ── Device ───────────────────────────────────────────────────────────────
export const devices = mysqlTable('Device', {
  id: varchar('id', { length: 255 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  location: varchar('location', { length: 255 }),
  appVersion: varchar('appVersion', { length: 50 }).notNull().default('0.0.0'),
  status: varchar('status', { length: 20 }).notNull().default('offline'),
  lastSeen: datetime('lastSeen'),
  createdAt: datetime('createdAt').notNull(),
});

// ── Photo ────────────────────────────────────────────────────────────────
export const photos = mysqlTable('Photo', {
  id: varchar('id', { length: 255 }).primaryKey(),
  deviceId: varchar('deviceId', { length: 255 }).notNull(),
  filename: varchar('filename', { length: 255 }).notNull(),
  size: int('size').notNull(),
  sha256: varchar('sha256', { length: 64 }).notNull(),
  contentType: varchar('contentType', { length: 255 }).notNull(),
  capturedAt: datetime('capturedAt').notNull(),
  createdAt: datetime('createdAt').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('completed'),
  storagePath: text('storagePath'),
  cosKey: text('cosKey'),
  publicUrl: text('publicUrl'),
}, (table) => [index('Photo_deviceId_idx').on(table.deviceId)]);

// ── CommandLog ───────────────────────────────────────────────────────────
export const commandLogs = mysqlTable('CommandLog', {
  id: varchar('id', { length: 255 }).primaryKey(),
  deviceId: varchar('deviceId', { length: 255 }).notNull(),
  type: varchar('type', { length: 50 }).notNull(),
  payload: text('payload'),
  issuedBy: varchar('issuedBy', { length: 255 }),
  issuedAt: datetime('issuedAt').notNull(),
  ackedAt: datetime('ackedAt'),
  ok: boolean('ok'),
  message: text('message'),
}, (table) => [index('CommandLog_deviceId_idx').on(table.deviceId)]);

// ── Release ──────────────────────────────────────────────────────────────
export const releases = mysqlTable('Release', {
  id: varchar('id', { length: 36 }).primaryKey(),
  version: varchar('version', { length: 50 }).notNull(),
  platform: varchar('platform', { length: 20 }).notNull(),
  arch: varchar('arch', { length: 20 }).notNull(),
  filename: varchar('filename', { length: 255 }).notNull(),
  size: int('size').notNull(),
  sha512: varchar('sha512', { length: 128 }).notNull(),
  cosKey: text('cosKey').notNull(),
  blockmapCosKey: text('blockmapCosKey'),
  releaseNotes: text('releaseNotes'),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: datetime('createdAt').notNull(),
}, (table) => [
  unique('Release_version_platform_arch_key').on(table.version, table.platform, table.arch),
  index('Release_platform_idx').on(table.platform),
]);
