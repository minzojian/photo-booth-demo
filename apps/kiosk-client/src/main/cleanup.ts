import { readdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { AppSettings } from './settings.js';

/** 清理超过保留期限的照片目录（{userData}/photos/{YYYY-MM-DD}/...） */
export function cleanupOldPhotos(photosDir: string, settings: AppSettings): number {
  if (!existsSync(photosDir)) return 0;

  const now = Date.now();
  const maxAge = settings.retentionDays * 24 * 3600 * 1000;
  let removed = 0;

  try {
    const entries = readdirSync(photosDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      // 目录名为 YYYY-MM-DD 格式
      const m = entry.name.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!m) continue;
      const dirDate = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
      if (now - dirDate.getTime() > maxAge) {
        const dirPath = join(photosDir, entry.name);
        rmSync(dirPath, { recursive: true, force: true });
        removed++;
        console.log('[cleanup] 已清理过期目录:', entry.name);
      }
    }
  } catch (e) {
    console.error('[cleanup] 清理出错:', (e as Error).message);
  }

  return removed;
}

/** 按拍摄日期格式化目录名 */
export function dateDirName(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
