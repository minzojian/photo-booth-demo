import { io, type Socket } from 'socket.io-client';

// 协议常量（与 @shared 对齐；此处内联避免把 workspace 包打进 main）
const ClientEvents = { REGISTER: 'device:register', HEARTBEAT: 'device:heartbeat', COMMAND_ACK: 'device:command_ack' } as const;
const ServerEvents = { COMMAND: 'server:command' } as const;
const HEARTBEAT_INTERVAL_MS = 5000;

interface Opts {
  getPending: () => number;
  onCommand: (cmd: { commandId: string; type: string; issuedBy?: string }) => void;
}

/** 与云端的实时连接：注册 + 周期心跳 + 接收远程指令并回 ACK。 */
export class Realtime {
  private socket: Socket | null = null;
  private timer: NodeJS.Timeout | null = null;
  private captured = 0;

  constructor(private server: string, private deviceId: string, private opts: Opts, private appVersion: string) {}

  start(): void {
    this.socket = io(this.server, { transports: ['websocket', 'polling'], reconnection: true });
    this.socket.on('connect', () => {
      this.socket!.emit(ClientEvents.REGISTER, { deviceId: this.deviceId, appVersion: this.appVersion });
      this.beat();
      this.timer = setInterval(() => this.beat(), HEARTBEAT_INTERVAL_MS);
    });
    this.socket.on(ServerEvents.COMMAND, (cmd: { commandId: string; type: string; issuedBy?: string }) => {
      this.opts.onCommand(cmd);
      this.socket!.emit(ClientEvents.COMMAND_ACK, {
        commandId: cmd.commandId,
        deviceId: this.deviceId,
        ok: true,
        message: 'prompted (demo: not executed)',
        ackedAt: Date.now(),
      });
    });
    this.socket.on('disconnect', () => {
      if (this.timer) { clearInterval(this.timer); this.timer = null; }
    });
  }

  private beat(): void {
    this.socket?.emit(ClientEvents.HEARTBEAT, {
      deviceId: this.deviceId,
      status: 'idle',
      appVersion: this.appVersion,
      pendingUploads: this.opts.getPending(),
      capturedCount: this.captured,
      clientTs: Date.now(),
    });
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.socket?.disconnect();
  }
}
