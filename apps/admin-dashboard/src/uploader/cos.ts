import type { Uploader, UploadCredentials } from './interface';

/**
 * 腾讯云 COS 浏览器端上传器（cos-js-sdk-v5）。
 * 使用 STS 临时凭证直接上传到 COS，不经过 cloud-server。
 */
export class TencentCOSUploader implements Uploader {
  async upload(file: File, cred: UploadCredentials, onProgress?: (pct: number) => void): Promise<string> {
    const COS = (await import('cos-js-sdk-v5')).default;
    const client = new COS({
      getAuthorization: (_opts: unknown, cb: (c: Record<string, unknown>) => void) =>
        cb({
          TmpSecretId: cred.credentials.tmpSecretId,
          TmpSecretKey: cred.credentials.tmpSecretKey,
          SecurityToken: cred.credentials.sessionToken,
          StartTime: cred.startTime,
          ExpiredTime: cred.expiredTime,
        }),
    });

    const Key = cred.keyPrefix + file.name;

    await new Promise<void>((resolve, reject) => {
      client.putObject(
        {
          Bucket: cred.bucket,
          Region: cred.region,
          Key,
          Body: file,
          onProgress: (p: { percent: number }) => {
            if (onProgress) onProgress(Math.round(p.percent * 100));
          },
        },
        (err: Error | null) => (err ? reject(err) : resolve()),
      );
    });

    return Key;
  }
}
