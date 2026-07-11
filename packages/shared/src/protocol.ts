/**
 * 客户端 <-> 云端 的 WebSocket 事件协议（socket.io channel 名集中定义）。
 *
 * 心跳/指令是双向、低延迟、长连接场景，用 WebSocket 而非轮询。
 * socket.io 自带断线重连、心跳保活，天然适配弱网。
 */

/** 客户端(前台) -> 服务端 事件。 */
export const ClientEvents = {
  REGISTER: 'device:register',
  HEARTBEAT: 'device:heartbeat',
  COMMAND_ACK: 'device:command_ack',
} as const;

/** 服务端 -> 客户端(前台) 事件。 */
export const ServerEvents = {
  REGISTERED: 'server:registered',
  COMMAND: 'server:command',
} as const;

/** 服务端 -> 管理中台 事件（中台也用 WS 订阅，实现实时刷新）。 */
export const DashboardEvents = {
  SUBSCRIBE: 'dashboard:subscribe',
  SNAPSHOT: 'dashboard:snapshot',
  DEVICE_UPDATE: 'dashboard:device_update',
} as const;

export interface RegisterPayload {
  deviceId: string;
  appVersion: string;
}
