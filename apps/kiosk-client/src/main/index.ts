import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { app, BrowserWindow, ipcMain, globalShortcut } from 'electron';
import { join } from 'node:path';
import { TaskStore } from './db.js';
import { UploadManager } from './uploader/index.js';
import { Realtime } from './realtime.js';
import { getSystemStatus } from './system.js';
import { initUpdater, checkForUpdates, downloadUpdate, quitAndInstall } from './updater.js';
import { loadSettings, saveSettings, type AppSettings } from './settings.js';
import { cleanupOldPhotos, dateDirName } from './cleanup.js';

// dev: localhost；生产: nginx → cloud-server TKE
const SERVER = app.isPackaged
  ? 'https://indie.lunastudio.cn/photo_booth/api'
  : (process.env.KIOSK_SERVER || 'http://127.0.0.1:4000');
const ADMIN_PIN = process.env.KIOSK_ADMIN_PIN || '8888';
const WINDOWED = !!process.env.KIOSK_WINDOWED; // dev 用:窗口化,不锁全屏

let win: BrowserWindow | null = null;
let store: TaskStore;
let manager: UploadManager;
let realtime: Realtime;
let deviceId = 'kiosk-sh-001';

function canInstallUpdates(): boolean {
  if (!app.isPackaged) return false;
  if (process.platform !== 'darwin') return true;

  // macOS 下 ad-hoc 签名会把 designated requirement 退化为 cdhash，跨版本升级会被 ShipIt 拒绝。
  // 允许“非 ad-hoc”的本地自签名证书，用于不购买开发者账号的本地 OTA 验证。
  const r = spawnSync('codesign', ['-dvv', process.execPath], { encoding: 'utf8' });
  const out = `${r.stdout || ''}\n${r.stderr || ''}`;
  const isAdhoc = /Signature=adhoc/i.test(out);
  return !isAdhoc;
}

function resolveDeviceId(): string {
  const p = join(app.getPath('userData'), 'device.json');
  if (existsSync(p)) {
    try { return (JSON.parse(readFileSync(p, 'utf8')) as { deviceId: string }).deviceId; } catch { /* ignore */ }
  }
  const id = process.env.KIOSK_DEVICE_ID || 'kiosk-sh-001';
  writeFileSync(p, JSON.stringify({ deviceId: id }));
  return id;
}

function createWindow(): void {
  const isProd = app.isPackaged;
  const useKiosk = isProd && process.platform === 'win32';
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    // Windows 生产环境保留 kiosk；macOS 生产环境改为 fullscreen，避免 kiosk 行为问题。
    kiosk: useKiosk,
    fullscreen: isProd ? !useKiosk : !WINDOWED,
    frame: isProd ? false : WINDOWED,
    autoHideMenuBar: true,
    backgroundColor: '#0b0b12',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  // 触屏终端硬化:禁缩放、禁新窗口、禁导航
  win.webContents.setVisualZoomLevelLimits(1, 1).catch(() => undefined);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.once('ready-to-show', () => win?.show());

  // 生产环境也允许打开 DevTools，用 Cmd+Shift+I / Ctrl+Shift+I 调出
  globalShortcut.register('CommandOrControl+Shift+I', () => {
    if (win && !win.isDestroyed()) win.webContents.toggleDevTools();
  });

  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else win.loadFile(join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(async () => {
  deviceId = resolveDeviceId();
  const dataDir = app.getPath('userData');
  const filesDir = join(dataDir, 'photos');
  await mkdir(filesDir, { recursive: true });
  store = new TaskStore(join(dataDir, 'tasks.db'));

  const notify = () => win?.webContents.send('kiosk:tasks-changed');
  manager = new UploadManager(SERVER, deviceId, store, notify);
  realtime = new Realtime(SERVER, deviceId, {
    getPending: () => store.pendingCount(),
    onCommand: (cmd) => win?.webContents.send('kiosk:command', cmd),
  }, app.getVersion());

  // —— IPC ——
  const updateInstallSupported = canInstallUpdates();
  ipcMain.handle('device:id', () => deviceId);
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('tasks:list', () => store.all());
  ipcMain.handle('system:status', () => getSystemStatus(deviceId));
  ipcMain.handle('admin:verify', (_e, pin: string) => pin === ADMIN_PIN);
  ipcMain.handle('app:quit', () => app.quit());
  ipcMain.handle('app:isPackaged', () => app.isPackaged);
  ipcMain.handle('app:updateInstallSupported', () => updateInstallSupported);
  ipcMain.handle('update:check', () => checkForUpdates());
  ipcMain.handle('update:download', () => downloadUpdate());
  ipcMain.handle('update:install', () => {
    if (!updateInstallSupported) {
      win?.webContents.send('update:event', {
        type: 'error',
        message: '当前包不支持自动安装（开发模式或 macOS ad-hoc 签名）。',
      });
      return;
    }
    quitAndInstall();
  });

  // 用户活动上报（渲染层点击/触摸时调用，用于空闲检测）
  let lastActivityTime = Date.now();
  ipcMain.on('activity:report', () => { lastActivityTime = Date.now(); });

  ipcMain.handle('templates:list', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    // dev: process.cwd() = apps/kiosk-client; prod: app.getAppPath()
    const root = app.isPackaged ? app.getAppPath() : process.cwd();
    const tmplDir = path.join(root, 'resources', 'templates');
    const result = [];
    try {
      const entries = await fs.readdir(tmplDir, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        const files = await fs.readdir(path.join(tmplDir, e.name));
        result.push({ dir: e.name, files });
      }
    } catch (err) { console.error('[templates]', (err as Error).message); }
    return result;
  });

  // 读模板资源文件（绕过 Vite dev server 路径映射问题）
  ipcMain.handle('templates:readFile', async (_e, filePath: string) => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const root = app.isPackaged ? app.getAppPath() : process.cwd();
    const full = path.join(root, 'resources', 'templates', filePath);
    const ext = path.extname(full).toLowerCase();
    try {
      if (ext === '.json') {
        const text = await fs.readFile(full, 'utf8');
        return { ok: true, type: 'json', data: JSON.parse(text) };
      } else {
        const buf = await fs.readFile(full);
        const b64 = 'data:image/webp;base64,' + buf.toString('base64');
        return { ok: true, type: 'image', data: b64 };
      }
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

  ipcMain.handle('capture:save', async (_e, png: ArrayBuffer, meta: { filename: string; contentType: string; capturedAt: number }) => {
    const clientPhotoId = randomUUID();
    const taskId = randomUUID();
    const dateDir = dateDirName(meta.capturedAt);
    const taskDir = join(filesDir, dateDir, taskId);
    await mkdir(taskDir, { recursive: true });
    const localPath = join(taskDir, clientPhotoId + '.png');
    const buf = Buffer.from(png);
    await writeFile(localPath, buf);
    const sha256 = createHash('sha256').update(buf).digest('hex');
    store.insert({ id: taskId, clientPhotoId, localPath, filename: meta.filename, size: buf.length, sha256, contentType: meta.contentType, capturedAt: meta.capturedAt, createdAt: Date.now() });
    notify();
    return { taskId, clientPhotoId, localPath };
  });

  ipcMain.handle('capture:upload', async (_e, taskId: string) => {
    console.log('[capture:upload] 收到上传请求, taskId:', taskId)
    try {
      await manager.pumpOne(taskId);
      const task = store.get(taskId);
      console.log('[capture:upload] 上传完成, cosKey:', task?.cosKey)
      return { ok: true, cosKey: task?.cosKey ?? null };
    } catch (e) {
      console.error('[capture:upload] 上传失败:', e)
      return { ok: false, error: (e as Error).message };
    }
  });

  // 本地设置
  const settingsPath = join(dataDir, 'settings.json');
  let settings = loadSettings(settingsPath);

  // 首次启动时自动检测系统语言
  if (!settings.language || settings.language === 'zh') {
    // 如果 settings.json 里没存过 language（旧版本升级），按系统语言自动设置
    const sysLang = app.getLocale();
    settings.language = sysLang.startsWith('zh') ? 'zh' : 'en';
    saveSettings(settingsPath, settings);
  }

  ipcMain.handle('settings:get', () => settings);
  ipcMain.handle('settings:set', (_e, s: AppSettings) => {
    settings = { ...settings, ...s };
    saveSettings(settingsPath, settings);
    return settings;
  });

  // 打印机状态检测 — macOS lpstat + 直连 TCP / Windows PowerShell
  const getDetailedStatus = (printerName: string): string => {
    if (process.platform === 'darwin') {
      try {
        const lpstat = (args: string[]) => {
          const r = spawnSync('lpstat', args, { encoding: 'utf8', timeout: 3000 })
          return (r.stdout || '') + (r.stderr || '')
        }
        const full = lpstat(['-p', printerName]) + lpstat(['-a', printerName])
        console.log('[cups]', printerName, '→', full.trim().replace(/\n/g, ' | '))
        // 中英文关键词匹配
        if (/disabled|禁用|rejecting|拒绝|not accepting|不接受/i.test(full)) return 'unavailable'
        if (/processing|打印中|printing|活跃/i.test(full)) return 'active'

        // 直连 TCP 检测（跳过 dnssd:// Bonjour 地址）
        const dm = lpstat(['-v', printerName]).match(/(?:socket|ipp|ipps|lpd):\/\/([\w.-]+)(?::(\d+))?/i)
        if (dm) {
          const nc = spawnSync('nc', ['-z', '-w', '2', dm[1], String(parseInt(dm[2] || '631'))], { timeout: 3000 })
          if (nc.status !== 0) return 'unavailable'
        }
        return 'idle'
      } catch { return 'idle' }
    }
    if (process.platform === 'win32') {
      try {
        const n = printerName.replace(/"/g, '`"')
        const r = spawnSync('powershell', ['-NoProfile', '-Command', `(Get-Printer -Name "${n}").PrinterStatus`], { encoding: 'utf8', timeout: 5000 })
        const s = (r.stdout || '').trim()
        console.log('[win-printer]', printerName, '→', s || '(no output)')
        if (!s || /Offline|Error|NotAvailable|Paused/i.test(s)) return 'unavailable'
        if (/Printing|Busy|Processing/i.test(s)) return 'active'
        return 'idle'
      } catch { return 'idle' }
    }
    return 'idle'
  }

  // macOS CUPS IPP 查询耗材（墨水/碳粉）
  const getSupplies = (printerName: string): Promise<{ inkLevels: { name: string; pct: number }[] } | null> => {
    return new Promise((resolve) => {
      if (process.platform !== 'darwin') return resolve(null)
      const printerUri = `ipp://localhost/printers/${encodeURIComponent(printerName)}`
      const attrs: [number, string, string][] = [
        [0x47, 'attributes-charset', 'utf-8'],
        [0x48, 'attributes-natural-language', 'en-us'],
        [0x45, 'printer-uri', printerUri],
        [0x44, 'requested-attributes', 'marker-levels'],
      ]
      const bodyParts: Buffer[] = []
      bodyParts.push(Buffer.from([0x02, 0x00, 0x00, 0x0B, 0x00, 0x00, 0x00, 0x01]))
      bodyParts.push(Buffer.from([0x01]))
      for (const [tag, name, value] of attrs) {
        const nameB = Buffer.from(name, 'utf8')
        const valB = Buffer.from(value, 'utf8')
        bodyParts.push(Buffer.from([tag, 0x00, nameB.length]))
        bodyParts.push(nameB)
        bodyParts.push(Buffer.from([0x00, valB.length]))
        bodyParts.push(valB)
      }
      bodyParts.push(Buffer.from([0x03]))
      const body = Buffer.concat(bodyParts)

      const req = httpRequest({ hostname: '127.0.0.1', port: 631, path: `/printers/${encodeURIComponent(printerName)}`, method: 'POST', headers: { 'Content-Type': 'application/ipp', 'Content-Length': String(body.length) }, timeout: 3000 }, (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          try {
            const data = Buffer.concat(chunks)
            const ink: { name: string; pct: number }[] = []
            const markerIdx = data.indexOf('marker-levels')
            if (markerIdx >= 0) {
              let pos = markerIdx + 'marker-levels'.length
              while (pos < data.length - 6) {
                if (data[pos] === 0x21 || data[pos] === 0x23) {
                  const nameLen = data.readUInt16BE(pos + 1)
                  pos += 3 + nameLen
                  const valLen = data.readUInt16BE(pos)
                  pos += 2
                  if (valLen === 4) {
                    ink.push({ name: `Ink ${ink.length + 1}`, pct: Math.min(100, Math.max(0, data.readInt32BE(pos))) })
                    pos += 4
                  } else { pos += valLen }
                } else { pos++ }
                if (ink.length >= 8) break
              }
            }
            resolve(ink.length > 0 ? { inkLevels: ink } : null)
          } catch { resolve(null) }
        })
      })
      req.on('error', () => resolve(null))
      req.on('timeout', () => { req.destroy(); resolve(null) })
      req.write(body)
      req.end()
    })
  }

  ipcMain.handle('printer:list', () => {
    return (win?.webContents.getPrintersAsync() ?? []).then(async (raw) => {
      return Promise.all(raw.map(async (p) => {
        const detailedStatus = getDetailedStatus(p.name)
        const supplies = await getSupplies(p.name)
        return { ...p, detailedStatus, supplies }
      }))
    })
  })
  ipcMain.handle('printer:test', () => {
    win?.webContents.print({ silent: false, printBackground: true }, () => {})
  });
  ipcMain.handle('printer:select', (_e, name: string) => {
    settings.printerName = name
    saveSettings(settingsPath, settings)
  });
  // 静默打印文件到选定打印机（macOS lp / Windows Start-Process Print）
  ipcMain.handle('printer:printFile', async (_e, filePath: string, printerName: string) => {
    if (process.platform === 'darwin') {
      return new Promise<{ ok: boolean; error?: string }>((resolve) => {
        const child = spawnSync('lp', ['-d', printerName, filePath], { encoding: 'utf8', timeout: 30000 })
        resolve({ ok: child.status === 0, error: child.stderr || undefined })
      })
    }
    if (process.platform === 'win32') {
      return new Promise<{ ok: boolean; error?: string }>((resolve) => {
        const child = spawnSync('powershell', ['-NoProfile', '-Command', `Start-Process -FilePath "${filePath}" -Verb Print`], { encoding: 'utf8', timeout: 30000 })
        resolve({ ok: child.status === 0, error: child.stderr || undefined })
      })
    }
    return { ok: false, error: 'unsupported platform' }
  });

  // 定时清理过期照片（启动时 + 每 6 小时）
  const runCleanup = () => {
    const count = cleanupOldPhotos(filesDir, settings);
    if (count > 0) notify();
  };
  runCleanup();
  setInterval(runCleanup, 6 * 3600 * 1000);

  createWindow();
  initUpdater(() => win, {
    autoInstallOnAppQuit: updateInstallSupported,
    differentialEnabled: updateInstallSupported,
    serverUrl: SERVER,
  });
  realtime.start();
  void manager.pump();

  // ===== 智能静默升级 =====
  // 策略:到达升级窗口 → 检查更新 → 下载 → 等待空闲 → 安装重启
  let updateDownloaded = false;
  let updateDownloadedVersion = '';

  const isInUpdateWindow = (): boolean => {
    const h = new Date().getHours();
    return h >= 0 && h < 8; // 硬编码:凌晨 0:00-8:00
  };

  const isIdleEnough = (): boolean => {
    return (Date.now() - lastActivityTime) > 5 * 60_000; // 硬编码 5 分钟
  };

  const tryAutoInstall = () => {
    if (!updateDownloaded) return;
    if (!settings.autoUpdateEnabled) return;
    if (!updateInstallSupported) return;
    if (!isInUpdateWindow()) return;
    if (!isIdleEnough()) return;
    console.log(`[auto-update] 条件满足:凌晨0-8时,空闲>5分钟,安装 v${updateDownloadedVersion} 并重启`);
    quitAndInstall();
  };

  const scheduleAutoCheck = () => {
    // 每分钟检查一次（轻量级，只在已下载后才判断安装时机）
    setInterval(() => {
      if (settings.autoUpdateEnabled && isInUpdateWindow() && !updateDownloaded) {
        // 到达窗口期 + 还未下载:触发一次检查
        checkForUpdates().then((result) => {
          if (result.available && result.version) {
            console.log('[auto-update] 窗口期内发现版本', result.version, ',自动下载中...');
            downloadUpdate().then(() => {
              updateDownloaded = true;
              updateDownloadedVersion = result.version!;
              console.log('[auto-update] 下载完成,等待空闲后安装');
            }).catch((e) => console.error('[auto-update] 下载失败:', (e as Error).message));
          }
        }).catch(() => { /* 网络异常静默 */ });
      }
      tryAutoInstall();
    }, 60_000);

    // 首次也检查
    if (settings.autoUpdateEnabled) {
      checkForUpdates().then((result) => {
        if (result.available && result.version) {
          console.log('[auto-update] 启动时发现版本', result.version, ',自动下载中...');
          downloadUpdate().then(() => {
            updateDownloaded = true;
            updateDownloadedVersion = result.version!;
            console.log('[auto-update] 下载完成,等待空闲后安装');
          }).catch((e) => console.error('[auto-update] 下载失败:', (e as Error).message));
        }
      }).catch(() => { /* 静默 */ });
    }
  };
  scheduleAutoCheck();


  // 键盘呼出管理面板(带键盘时);触屏走渲染层角落连点
  globalShortcut.register('CommandOrControl+Shift+A', () => win?.webContents.send('kiosk:admin-hotkey'));

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
