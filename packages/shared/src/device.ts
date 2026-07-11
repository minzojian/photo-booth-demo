/**
 * 设备与心跳相关的领域类型。
 *
 * 心跳包是"设备实时监测"的核心：客户端按固定间隔上报，
 * 云端据此判断在线/离线，并把状态实时推送给管理中台。
 */

/** 设备生命周期状态。 */
export type DeviceStatus = 'online' | 'idle' | 'busy' | 'offline' | 'locked';

/** 心跳间隔（毫秒）。客户端每 HEARTBEAT_INTERVAL 上报一次。 */
export const HEARTBEAT_INTERVAL_MS = 5_000;

/**
 * 判定离线的超时时间。
 * 取心跳间隔的 3 倍 + 缓冲，容忍弱网下 1~2 次丢包而不误判离线。
 */
export const HEARTBEAT_TIMEOUT_MS = HEARTBEAT_INTERVAL_MS * 3 + 2_000;

/**
 * 心跳包负载。刻意保持精简——弱网下每个字节都要算。
 */
export interface HeartbeatPayload {
  deviceId: string;
  status: DeviceStatus;
  /** 客户端应用版本。 */
  appVersion: string;
  /** 本地离线队列中待上传的照片数——运维一眼看出哪台设备在积压。 */
  pendingUploads: number;
  /** 已拍摄张数（累计）。 */
  capturedCount: number;
  /** 客户端本地时间戳（ms）。 */
  clientTs: number;
}

/** 云端聚合后对外（中台）展示的设备视图。 */
export interface DeviceView extends HeartbeatPayload {
  /** 云端记录的最近一次心跳到达时间（ms）。 */
  lastSeen: number;
  /** 由 lastSeen 与超时阈值推导出的实时在线判断。 */
  online: boolean;
}
