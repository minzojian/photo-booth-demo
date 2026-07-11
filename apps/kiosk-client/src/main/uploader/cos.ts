import type { Uploader, UploadCredentials } from './interface.js';
import type { Task } from '../db.js';

/** 腾讯云 COS 上传器（sliceUploadFile 分片续传） */
export class TencentCOSUploader implements Uploader {
  async upload(task: Task, cred: UploadCredentials, onProgress?: () => void): Promise<string> {
    const mod = await import('cos-nodejs-sdk-v5');
    const COS = (mod as unknown as { default: new (o: unknown) => { sliceUploadFile: (opts: unknown, cb: (err: Error | null) => void) => void } }).default;
    const client = new COS({
      getAuthorization: (_opts: unknown, cb: (c: unknown) => void) =>
        cb({
          TmpSecretId: cred.credentials.tmpSecretId,
          TmpSecretKey: cred.credentials.tmpSecretKey,
          SecurityToken: cred.credentials.sessionToken,
          StartTime: cred.startTime,
          ExpiredTime: cred.expiredTime,
        }),
    });
    const Key = cred.keyPrefix + task.clientPhotoId + '.png';
    await new Promise<void>((resolve, reject) => {
      client.sliceUploadFile(
        {
          Bucket: cred.bucket,
          Region: cred.region,
          Key,
          FilePath: task.localPath,
          onProgress: (_p: { loaded: number }) => { if (onProgress) onProgress(); },
        },
        (err: Error | null) => (err ? reject(err) : resolve()),
      );
    });
    return Key;
  }
}
