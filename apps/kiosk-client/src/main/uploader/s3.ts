import type { Uploader, UploadCredentials } from './interface.js';
import type { Task } from '../db.js';

/** AWS S3 上传器（@aws-sdk/lib-storage 分片续传） */
export class S3Uploader implements Uploader {
  async upload(task: Task, cred: UploadCredentials, onProgress?: () => void): Promise<string> {
    const { S3Client } = await import('@aws-sdk/client-s3');
    const { Upload } = await import('@aws-sdk/lib-storage');
    const { readFileSync } = await import('node:fs');

    const client = new S3Client({
      region: cred.region,
      credentials: {
        accessKeyId: cred.credentials.tmpSecretId,
        secretAccessKey: cred.credentials.tmpSecretKey,
        sessionToken: cred.credentials.sessionToken,
      },
    });
    const Key = cred.keyPrefix + task.clientPhotoId + '.png';

    const upload = new Upload({
      client,
      params: {
        Bucket: cred.bucket,
        Key,
        Body: readFileSync(task.localPath),
        ContentType: 'image/png',
      },
    });

    if (onProgress) {
      upload.on('httpUploadProgress', () => onProgress());
    }
    await upload.done();
    return Key;
  }
}
