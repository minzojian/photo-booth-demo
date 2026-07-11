import { unlink } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import type { TaskStore, Task } from '../db.js';
import type { Uploader, UploadCredentials } from './interface.js';
import { TencentCOSUploader } from './cos.js';
import { S3Uploader } from './s3.js';

export type { Uploader, UploadCredentials } from './interface.js';

// ── 平台注册表 ──

const uploaders: Record<string, Uploader> = {
  'tencent-cos': new TencentCOSUploader(),
  'aws-s3': new S3Uploader(),
};

// ── HTTP 请求（Electron 主进程用原生 http，避免 fetch 兼容问题）──

function httpPost(url: string, body: unknown): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = JSON.stringify(body);
    const req = httpRequest(
      {
        hostname: u.hostname,
        port: Number(u.port) || 80,
        path: u.pathname,
        method: 'POST',
        family: 4, // 强制 IPv4，避免 localhost 双栈解析 AggregateError
        headers: { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(payload)) },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk: Buffer) => (raw += chunk.toString()));
        res.on('end', () => {
          console.log('[httpPost]', url, '→', res.statusCode);
          try {
            resolve({ status: res.statusCode ?? 500, data: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode ?? 500, data: raw });
          }
        });
      },
    );
    req.on('error', (err) => {
      console.error('[httpPost] 请求失败, url:', url, '错误:', (err as Error & { code?: string }).code, (err as Error).message);
      reject(err);
    });
    req.write(payload);
    req.end();
  });
}

async function requestSts(server: string, deviceId: string): Promise<UploadCredentials> {
  const { status, data } = await httpPost(server + '/sts', { deviceId });
  if (status !== 200) throw new Error('sts_failed_' + status);
  return data as UploadCredentials;
}

// ── 单任务处理 ──

export async function processTask(
  server: string,
  deviceId: string,
  task: Task,
  store: TaskStore,
  onProgress?: () => void,
): Promise<void> {
  try {
    const cred = await requestSts(server, deviceId);
    const uploader = uploaders[cred.platform];
    if (!uploader) throw new Error('unknown_platform_' + cred.platform);

    store.update(task.id, { status: 'uploading', error: null });
    const cosKey = await uploader.upload(task, cred, onProgress);
    const publicUrl = cred.publicBase + task.clientPhotoId + '.png';
    const { status: orderStatus } = await httpPost(server + '/photos', {
      clientPhotoId: task.clientPhotoId,
      deviceId,
      filename: task.filename,
      size: task.size,
      sha256: task.sha256,
      contentType: task.contentType,
      capturedAt: task.capturedAt,
      cosKey,
      publicUrl,
    });
    if (orderStatus !== 200 && orderStatus !== 201) throw new Error('order_failed_' + orderStatus);
    store.update(task.id, { status: 'completed', cosKey, uploadedBytes: task.size, completedAt: Date.now(), error: null });
    await unlink(task.localPath).catch(() => undefined);
    onProgress?.();
  } catch (e) {
    const err = e as Error & { errors?: Error[] };
    console.error('[processTask] 上传失败, taskId:', task.id);
    console.error('[processTask] 错误类型:', err.constructor?.name, '消息:', err.message);
    if (err.errors) console.error('[processTask] 子错误:', err.errors.map(e2 => e2.message));
    if (err.stack) console.error('[processTask] 堆栈:', err.stack.split('\n').slice(0, 4).join('\n'));
    store.update(task.id, { status: 'failed', error: String(err.message || e) });
    onProgress?.();
  }
}

/** 上传管理器：串行处理队列 + 启动时续传未完成任务。 */
export class UploadManager {
  private running = false;
  constructor(
    private server: string,
    private deviceId: string,
    private store: TaskStore,
    private onChange?: () => void,
  ) {}

  async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      let list = this.store.unfinished();
      while (list.length > 0) {
        for (const t of list) {
          await processTask(this.server, this.deviceId, t, this.store, this.onChange);
        }
        list = this.store.unfinished().filter((t) => t.status !== 'failed');
      }
    } finally {
      this.running = false;
    }
  }

  /** 上传单条任务，供「扫码下载」按需触发 */
  async pumpOne(taskId: string): Promise<void> {
    const task = this.store.get(taskId);
    if (!task) throw new Error('task_not_found');
    if (task.status === 'completed') return;
    await processTask(this.server, this.deviceId, task, this.store, this.onChange);
    const updated = this.store.get(taskId);
    if (updated?.status === 'failed') {
      throw new Error(updated.error || 'upload_failed');
    }
  }
}
