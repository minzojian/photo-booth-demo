import type { Server } from 'socket.io';
import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { devices, commandLogs } from '../db/schema.js';
import { deviceRegistry } from './deviceRegistry.js';
import {
  ClientEvents,
  ServerEvents,
  DashboardEvents,
  type HeartbeatPayload,
  type RegisterPayload,
  type RemoteCommand,
  type CommandAck,
  type CommandType,
} from '@lunastudio/shared';

let ioRef: Server | null = null;

function normalizeAppVersion(v: string): string {
  return v === '0.1.0' ? '1.0.0' : v;
}

export function initGateway(io: Server): void {
  ioRef = io;

  io.on('connection', (socket) => {
    socket.on(ClientEvents.REGISTER, async (p: RegisterPayload) => {
      socket.data.deviceId = p.deviceId;
      const appVersion = normalizeAppVersion(p.appVersion);
      const now = new Date();
      try {
        await db.insert(devices).values({
          id: p.deviceId, name: p.deviceId, appVersion, status: 'online', lastSeen: now, createdAt: now,
        }).onDuplicateKeyUpdate({
          set: { appVersion, status: 'online', lastSeen: now },
        });
      } catch (e: unknown) { console.error('[gateway] device upsert failed', e); }
      socket.emit(ServerEvents.REGISTERED, { ok: true });
    });

    socket.on(ClientEvents.HEARTBEAT, async (hb: HeartbeatPayload) => {
      deviceRegistry.upsertHeartbeat(socket.id, hb);
      const appVersion = normalizeAppVersion(hb.appVersion);
      try {
        await db.update(devices)
          .set({ status: hb.status, lastSeen: new Date(), appVersion })
          .where(eq(devices.id, hb.deviceId));
      } catch { /* ignore */ }
    });

    socket.on(ClientEvents.COMMAND_ACK, async (ack: CommandAck) => {
      try {
        await db.update(commandLogs)
          .set({ ackedAt: new Date(), ok: ack.ok, message: ack.message })
          .where(eq(commandLogs.id, ack.commandId));
      } catch { /* ignore */ }
    });

    socket.on(DashboardEvents.SUBSCRIBE, () => {
      socket.join('dashboard');
      socket.emit(DashboardEvents.SNAPSHOT, deviceRegistry.snapshot());
    });

    socket.on('disconnect', () => deviceRegistry.removeBySocket(socket.id));
  });

  deviceRegistry.on('update', (view) => {
    if (view) ioRef?.to('dashboard').emit(DashboardEvents.DEVICE_UPDATE, view);
  });
}

export async function dispatchCommand(
  deviceId: string,
  type: CommandType,
  payload?: unknown,
  issuedBy = 'admin',
): Promise<{ delivered: boolean; commandId: string }> {
  const commandId = nanoid();
  await db.insert(commandLogs).values({
    id: commandId,
    deviceId,
    type,
    payload: payload ? JSON.stringify(payload) : null,
    issuedBy,
    issuedAt: new Date(),
  });
  const cmd: RemoteCommand = { commandId, type, deviceId, payload, issuedAt: Date.now(), issuedBy };
  const socketId = deviceRegistry.socketIdOf(deviceId);
  if (!socketId || !ioRef) return { delivered: false, commandId };
  ioRef.to(socketId).emit(ServerEvents.COMMAND, cmd);
  return { delivered: true, commandId };
}
