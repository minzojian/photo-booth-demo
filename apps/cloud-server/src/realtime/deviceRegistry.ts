import { EventEmitter } from 'node:events';
import { DeviceView, HeartbeatPayload, HEARTBEAT_TIMEOUT_MS } from '@lunastudio/shared';

/**
 * 内存态设备注册表：持有"活的"连接状态（socketId、最近心跳、在线判定）。
 * 与 DB 分工：DB 存耐久数据（设备档案/照片），此处存易失的实时状态。
 */
interface LiveDevice {
  socketId: string;
  last: HeartbeatPayload;
  lastSeen: number;
}

export class DeviceRegistry extends EventEmitter {
  private devices = new Map<string, LiveDevice>();

  constructor() {
    super();
    setInterval(() => this.sweep(), 2_000).unref();
  }

  upsertHeartbeat(socketId: string, hb: HeartbeatPayload): void {
    this.devices.set(hb.deviceId, { socketId, last: hb, lastSeen: Date.now() });
    this.emit('update', this.view(hb.deviceId));
  }

  removeBySocket(socketId: string): void {
    for (const [id, d] of this.devices) {
      if (d.socketId === socketId) {
        d.lastSeen = 0; // 标记离线，让中台看到"掉线"而非"消失"
        this.emit('update', this.view(id));
      }
    }
  }

  socketIdOf(deviceId: string): string | undefined {
    return this.devices.get(deviceId)?.socketId;
  }

  private isOnline(lastSeen: number): boolean {
    return Date.now() - lastSeen < HEARTBEAT_TIMEOUT_MS;
  }

  view(deviceId: string): DeviceView | undefined {
    const d = this.devices.get(deviceId);
    if (!d) return undefined;
    const online = this.isOnline(d.lastSeen);
    return { ...d.last, status: online ? d.last.status : 'offline', lastSeen: d.lastSeen, online };
  }

  snapshot(): DeviceView[] {
    const out: DeviceView[] = [];
    for (const id of this.devices.keys()) {
      const v = this.view(id);
      if (v) out.push(v);
    }
    return out;
  }

  private sweep(): void {
    for (const [id, d] of this.devices) {
      const online = this.isOnline(d.lastSeen);
      if (!online && d.last.status !== 'offline') {
        d.last = { ...d.last, status: 'offline' };
        this.emit('update', this.view(id));
      }
    }
  }
}

export const deviceRegistry = new DeviceRegistry();
