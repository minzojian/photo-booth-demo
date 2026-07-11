import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

export interface AppSettings {
  /** 本地照片保留天数，到期自动清理 */
  retentionDays: number;
  /** 是否启用自动静默升级 */
  autoUpdateEnabled: boolean;
  /** 界面语言: 'zh' 中文, 'en' 英文 */
  language: 'zh' | 'en';
}

const DEFAULTS: AppSettings = {
  retentionDays: 7,
  autoUpdateEnabled: false,
  language: 'zh',
};

export function loadSettings(filePath: string): AppSettings {
  try {
    if (existsSync(filePath)) {
      const raw = JSON.parse(readFileSync(filePath, 'utf8'));
      return { ...DEFAULTS, ...raw };
    }
  } catch { /* ignore */ }
  return { ...DEFAULTS };
}

export function saveSettings(filePath: string, settings: AppSettings): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, JSON.stringify(settings, null, 2));
}
