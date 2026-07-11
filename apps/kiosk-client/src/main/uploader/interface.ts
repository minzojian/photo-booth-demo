import type { Task } from '../db.js';

/** 上传凭证（服务端 /sts 返回，与 cloud-server StorageProvider 对齐） */
export interface UploadCredentials {
  platform: string;
  bucket: string;
  region: string;
  keyPrefix: string;
  /** CDN 访问基址，拼接 clientPhotoId.png 得到完整公网 URL */
  publicBase: string;
  credentials: {
    tmpSecretId: string;
    tmpSecretKey: string;
    sessionToken: string;
  };
  startTime: number;
  expiredTime: number;
}

/** 平台上传器接口。新增平台只需实现此接口并注册到 uploaders 表。 */
export interface Uploader {
  /** 上传成功后返回对象存储 key */
  upload(task: Task, cred: UploadCredentials, onProgress?: () => void): Promise<string>;
}
