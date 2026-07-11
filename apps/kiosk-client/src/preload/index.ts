import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('kiosk', {
  getDeviceId: () => ipcRenderer.invoke('device:id'),
  getVersion: () => ipcRenderer.invoke('app:version'),
  listTemplateDirs: () => ipcRenderer.invoke('templates:list'),
  readTemplateFile: (filePath: string) => ipcRenderer.invoke('templates:readFile', filePath),
  saveCapture: (png: ArrayBuffer, meta: { filename: string; contentType: string; capturedAt: number }) =>
    ipcRenderer.invoke('capture:save', png, meta),
  uploadCapture: (taskId: string) => ipcRenderer.invoke('capture:upload', taskId),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (s: unknown) => ipcRenderer.invoke('settings:set', s),
  reportActivity: () => ipcRenderer.send('activity:report'),
  listTasks: () => ipcRenderer.invoke('tasks:list'),
  systemStatus: () => ipcRenderer.invoke('system:status'),
  verifyAdmin: (pin: string) => ipcRenderer.invoke('admin:verify', pin),
  isPackaged: () => ipcRenderer.invoke('app:isPackaged'),
  isUpdateInstallSupported: () => ipcRenderer.invoke('app:updateInstallSupported'),
  quit: () => ipcRenderer.invoke('app:quit'),
  update: {
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
    onEvent: (cb: (e: unknown) => void) => ipcRenderer.on('update:event', (_e, d) => cb(d)),
  },
  onCommand: (cb: (cmd: unknown) => void) => ipcRenderer.on('kiosk:command', (_e, cmd) => cb(cmd)),
  onTasksChanged: (cb: () => void) => ipcRenderer.on('kiosk:tasks-changed', () => cb()),
  onAdminHotkey: (cb: () => void) => ipcRenderer.on('kiosk:admin-hotkey', () => cb()),
});
