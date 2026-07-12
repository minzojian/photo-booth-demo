export interface KioskTask {
  id: string; clientPhotoId: string; filename: string; size: number;
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  uploadedBytes: number; cosKey: string | null; error: string | null;
  createdAt: number; completedAt: number | null;
}
export interface RemoteCommandView { commandId: string; type: 'LOCK'|'UNLOCK'|'REBOOT'|'SHUTDOWN'; issuedBy?: string; }
export interface SystemStatus {
  deviceId: string; appVersion: string; platform: string; arch: string; uptimeSec: number;
  cpu: { model: string; cores: number; loadAvg1: number };
  memory: { totalMB: number; freeMB: number; usedPct: number };
  disk: { totalGB: number; freeGB: number; usedPct: number } | null;
}
export type UpdateEvent =
  | { type: 'checking' }
  | { type: 'available'; version: string; totalSize?: number }
  | { type: 'none'; version: string }
  | { type: 'error'; message: string }
  | { type: 'progress'; percent: number; transferred: number; total: number; bytesPerSecond: number }
  | { type: 'downloaded'; version: string }
  | { type: 'diag'; level: 'info' | 'warn' | 'error' | 'debug'; message: string };

export interface AppSettings {
  retentionDays: number;
  autoUpdateEnabled: boolean;
  language: 'zh' | 'en';
}

export interface PrinterInfo {
  name: string;
  displayName: string;
  description: string;
  status: number; // 0=idle, 1=active, 2=unavailable
  isDefault: boolean;
}

declare global {
  interface Window {
    kiosk: {
      getDeviceId(): Promise<string>;
      getVersion(): Promise<string>;
      listTemplateDirs(): Promise<{dir:string;files:string[]}[]>;
      readTemplateFile(filePath: string): Promise<{ok:boolean;type?:'json'|'image';data?:unknown;error?:string}>;
      saveCapture(png: ArrayBuffer, meta: { filename: string; contentType: string; capturedAt: number }): Promise<{ taskId: string; clientPhotoId: string }>;
      uploadCapture(taskId: string): Promise<{ ok: boolean; cosKey: string | null; error?: string }>;
      getSettings(): Promise<AppSettings>;
      setSettings(s: Partial<AppSettings>): Promise<AppSettings>;
      reportActivity(): void;
      listTasks(): Promise<KioskTask[]>;
      systemStatus(): Promise<SystemStatus>;
      verifyAdmin(pin: string): Promise<boolean>;
      isPackaged(): Promise<boolean>;
      isUpdateInstallSupported(): Promise<boolean>;
      quit(): Promise<void>;
      update: {
        check(): Promise<{ version?: string; available: boolean; error?: string }>;
        download(): Promise<void>;
        install(): Promise<void>;
        onEvent(cb: (e: UpdateEvent) => void): void;
      };
      onCommand(cb: (cmd: RemoteCommandView) => void): void;
      onTasksChanged(cb: () => void): void;
      onAdminHotkey(cb: () => void): void;
      listPrinters(): Promise<PrinterInfo[]>;
      testPrint(): Promise<void>;
    };
  }
}
export {};
