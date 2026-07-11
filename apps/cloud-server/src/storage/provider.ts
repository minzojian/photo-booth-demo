/**
 * 存储平台抽象接口。
 * 上层（STS 路由）不关心具体平台，只调用 getUploadCredentials。
 * 新增平台只需实现此接口并在 index.ts 中切换 provider 实例。
 */

export interface UploadCredentials {
  platform: string;
  bucket: string;
  region: string;
  /** 对象键前缀，如 projects/photo_booth/photos/{deviceId}/ */
  keyPrefix: string;
  /** CDN 访问基址，前台拼接 clientPhotoId.png 即得完整公网 URL */
  publicBase: string;
  credentials: {
    tmpSecretId: string;
    tmpSecretKey: string;
    sessionToken: string;
  };
  startTime: number;
  expiredTime: number;
}

export interface StorageProvider {
  readonly platform: string;
  /** 为指定设备签发照片上传凭证 */
  getUploadCredentials(deviceId: string): Promise<UploadCredentials>;
  /** 为管理员签发上传凭证（如发布升级包），scope 如 "updates" */
  getAdminUploadCredentials(scope: string): Promise<UploadCredentials>;
}
