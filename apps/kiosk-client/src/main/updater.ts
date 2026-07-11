import electronUpdater from 'electron-updater';
import type { BrowserWindow } from 'electron';
import { app } from 'electron';

const { autoUpdater } = electronUpdater;

type WinGetter = () => BrowserWindow | null;
type UpdaterOptions = {
  autoInstallOnAppQuit?: boolean;
  serverUrl?: string;
  differentialEnabled?: boolean;
};

/**
 * electron-updater 的 GenericProvider.getBlockMapFiles() 用字符串替换版本号来拼接旧版 blockmap URL。
 * 当文件名包含版本专属 hash 后缀时（如 arm64-mac-c35d02a7），这种拼接会得到错误 URL。
 * 这里 monkey-patch 该方法，对旧版本 blockmap 通过服务端 API 查询正确地址。
 */
function patchBlockMapResolution(serverUrl: string): void {
  if (!serverUrl) return;
  try {
    // Provider 是 electron-updater 内部类，未从主入口导出，需直接引用子路径
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Provider = require('electron-updater/out/providers/Provider').Provider as new (...args: any[]) => any;
    if (!Provider) return;
    const orig = Provider.prototype.getBlockMapFiles;
    Provider.prototype.getBlockMapFiles = async function (this: any, ...args: any[]) {
      const [oldUrl, newUrl] = await orig.apply(this, args) as URL[];
      try {
        const oldVersion: string = args[1];
        const platform = process.platform;
        const arch = process.arch;
        const apiUrl = `${serverUrl}/updates/blockmap/${oldVersion}?platform=${platform}&arch=${arch}`;
        const resp = await fetch(apiUrl);
        if (resp.ok) {
          const { url } = await resp.json() as { url: string };
          console.log('[updater][blockmap] resolved old blockmap via API:', url);
          return [new URL(url), newUrl];
        }
      } catch (e) {
        console.warn('[updater][blockmap] API lookup failed, fallback to default:', (e as Error).message);
      }
      return [oldUrl, newUrl];
    };
    console.log('[updater][blockmap] patched Provider.getBlockMapFiles (server:', serverUrl, ')');
  } catch (e) {
    console.warn('[updater][blockmap] failed to patch Provider:', (e as Error).message);
  }
}

/** 初始化 electron-updater：不自动下载，事件转发给渲染层。 */
export function initUpdater(getWin: WinGetter, options?: UpdaterOptions): void {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = options?.autoInstallOnAppQuit ?? true;
  // dev 模式也允许走 dev-app-update.yml 检查（便于联调）
  if (!app.isPackaged) autoUpdater.forceDevUpdateConfig = true;

  // 腾讯云 COS/CDN 不支持多 Range 请求，强制使用单 Range 差分下载器。
  // 注意：generic provider 的 providerFactory 会用 app-update.yml 中的 useMultipleRangeRequest 覆盖 runtimeOptions，
  // 因此必须在发布配置 (package.json build.publish) 中也显式设置 useMultipleRangeRequest: false。
  (autoUpdater as any).isUseMultipleRangeRequest = false;
  const origCreateProviderRuntimeOptions = autoUpdater.createProviderRuntimeOptions.bind(autoUpdater);
  autoUpdater.createProviderRuntimeOptions = () => ({
    ...origCreateProviderRuntimeOptions(),
    isUseMultipleRangeRequest: false,
  });

  // 仅在可安装更新的稳定签名模式下启用差分；ad-hoc/dev 自动降级为全量下载。
  const disableDifferential = options?.differentialEnabled === false;
  (autoUpdater as any).disableDifferentialDownload = disableDifferential;

  // 修正 hash 后缀文件名导致的旧版 blockmap URL 拼接错误
  if (!disableDifferential) {
    patchBlockMapResolution(options?.serverUrl ?? '');
  }

  const send = (data: unknown) => {
    const d = data as Record<string, unknown>;
    if (d.type !== 'progress') console.log('[updater] event:', d.type, d.version ?? '');
    const win = getWin();
    if (!win || win.isDestroyed()) return;
    const wc = win.webContents;
    if (!wc || wc.isDestroyed()) return;
    try {
      wc.send('update:event', data);
    } catch (e) {
      const msg = (e as Error).message || String(e);
      if (!/destroyed|closed/i.test(msg)) {
        console.warn('[updater] send update:event failed:', msg);
      }
    }
  };

  const stringifyArgs = (args: unknown[]): string => args.map((v) => {
    if (typeof v === 'string') return v;
    if (v instanceof Error) return v.stack || v.message;
    try { return JSON.stringify(v); } catch { return String(v); }
  }).join(' ');

  const maybeDiag = (level: 'info' | 'warn' | 'error' | 'debug', args: unknown[]) => {
    const text = stringifyArgs(args);
    const key = /Full:\s|To download:\s|Differential download|Cannot download differentially|Download block maps|Unable to locate previous update\.zip|Update has already been downloaded|Accept-Ranges/i;
    if (key.test(text)) {
      send({ type: 'diag', level, message: text });
    }
  };

  // 开启内部日志，且把关键差分信息桥接到渲染层。
  autoUpdater.logger = {
    info: (...args: unknown[]) => { console.log('[updater][info]', ...args); maybeDiag('info', args); },
    warn: (...args: unknown[]) => { console.warn('[updater][warn]', ...args); maybeDiag('warn', args); },
    error: (...args: unknown[]) => { console.error('[updater][error]', ...args); maybeDiag('error', args); },
    debug: (...args: unknown[]) => { console.debug('[updater][debug]', ...args); maybeDiag('debug', args); },
  } as unknown as typeof console;

  autoUpdater.on('checking-for-update', () => send({ type: 'checking' }));
  autoUpdater.on('update-available', (i) => send({ type: 'available', version: i.version, totalSize: i.files?.[0]?.size }));
  autoUpdater.on('update-not-available', (i) => send({ type: 'none', version: i.version }));
  autoUpdater.on('error', (e) => send({ type: 'error', message: String((e as Error).message || e) }));
  autoUpdater.on('download-progress', (p) =>
    send({ type: 'progress', percent: Math.round(p.percent), transferred: p.transferred, total: p.total, bytesPerSecond: Math.round(p.bytesPerSecond) }));
  autoUpdater.on('update-downloaded', (i) => send({ type: 'downloaded', version: i.version }));
}

export async function checkForUpdates(): Promise<{ version?: string; available: boolean; error?: string }> {
  try {
    const r = await autoUpdater.checkForUpdates();
    const latest = r?.updateInfo?.version;
    const current = app.getVersion();
    return { version: latest, available: !!latest && latest !== current };
  } catch (e) {
    return { available: false, error: String((e as Error).message || e) };
  }
}
export async function downloadUpdate(): Promise<void> { await autoUpdater.downloadUpdate(); }
export function quitAndInstall(): void { autoUpdater.quitAndInstall(false, true); }
