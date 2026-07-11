import type { Uploader, UploadCredentials } from './interface';

/**
 * AWS S3 浏览器端上传器（@aws-sdk/client-s3 + @aws-sdk/lib-storage）。
 * 使用 STS 临时凭证直接上传到 S3，不经过 cloud-server。
 */
export class S3Uploader implements Uploader {
  async upload(file: File, cred: UploadCredentials, onProgress?: (pct: number) => void): Promise<string> {
    const { S3Client } = await import('@aws-sdk/client-s3');
    const { Upload } = await import('@aws-sdk/lib-storage');

    const client = new S3Client({
      region: cred.region,
      credentials: {
        accessKeyId: cred.credentials.tmpSecretId,
        secretAccessKey: cred.credentials.tmpSecretKey,
        sessionToken: cred.credentials.sessionToken,
      },
    });

    const Key = cred.keyPrefix + file.name;

    const upload = new Upload({
      client,
      params: {
        Bucket: cred.bucket,
        Key,
        Body: file,
        ContentType: file.type || 'application/octet-stream',
      },
    });

    if (onProgress) {
      upload.on('httpUploadProgress', (p: { loaded?: number; total?: number }) => {
        if (p.total) onProgress(Math.round(((p.loaded ?? 0) / p.total) * 100));
      });
    }

    await upload.done();
    return Key;
  }
}
