/**
 * 远程指令协议。
 *
 * 云端 → 客户端下发指令，客户端执行后回 ACK。
 * 所有指令都带唯一 commandId，实现"至少一次下发 + 幂等执行 + 可审计"。
 *
 * 注意：本 Demo 前台收到 LOCK/SHUTDOWN 等指令时只弹提示，不真的锁屏/关机。
 */

export type CommandType =
  | 'LOCK' // 锁机：前台弹出"已被管理员锁定"提示遮罩
  | 'UNLOCK' // 解锁：移除锁定提示
  | 'REBOOT' // 重启：前台提示"收到重启指令"
  | 'SHUTDOWN'; // 关机：前台提示"收到关机指令"

/** 指令信封。 */
export interface RemoteCommand<T = unknown> {
  commandId: string;
  type: CommandType;
  /** 目标设备。 */
  deviceId: string;
  /** 指令参数（预留）。 */
  payload?: T;
  /** 下发时间（ms）。 */
  issuedAt: number;
  /** 谁下发的（审计用）。 */
  issuedBy?: string;
}

/** 客户端执行后回给云端的确认。 */
export interface CommandAck {
  commandId: string;
  deviceId: string;
  /** 是否成功执行（这里=前台已弹出提示）。 */
  ok: boolean;
  message?: string;
  ackedAt: number;
}
