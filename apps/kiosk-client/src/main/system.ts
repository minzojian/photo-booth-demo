import os from 'node:os';
import { statfs } from 'node:fs/promises';
import { app } from 'electron';

export interface SystemStatus {
  deviceId: string;
  appVersion: string;
  platform: string;
  arch: string;
  uptimeSec: number;
  cpu: { model: string; cores: number; loadAvg1: number };
  memory: { totalMB: number; freeMB: number; usedPct: number };
  disk: { totalGB: number; freeGB: number; usedPct: number } | null;
}

/** 读取真实硬件/系统状态（磁盘用 fs.statfs，内存/CPU 用 os）。 */
export async function getSystemStatus(deviceId: string): Promise<SystemStatus> {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  let disk: SystemStatus['disk'] = null;
  try {
    const st = await statfs(app.getPath('userData'));
    const total = st.blocks * st.bsize;
    const free = st.bavail * st.bsize;
    disk = {
      totalGB: +(total / 1e9).toFixed(1),
      freeGB: +(free / 1e9).toFixed(1),
      usedPct: total ? Math.round((1 - free / total) * 100) : 0,
    };
  } catch {
    disk = null;
  }
  const cpus = os.cpus();
  return {
    deviceId,
    appVersion: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    uptimeSec: Math.round(process.uptime()),
    cpu: { model: cpus[0]?.model ?? 'unknown', cores: cpus.length, loadAvg1: +(os.loadavg()[0] ?? 0).toFixed(2) },
    memory: {
      totalMB: Math.round(totalMem / 1048576),
      freeMB: Math.round(freeMem / 1048576),
      usedPct: Math.round((1 - freeMem / totalMem) * 100),
    },
    disk,
  };
}
