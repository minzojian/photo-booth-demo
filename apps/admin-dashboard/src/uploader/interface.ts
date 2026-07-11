/** 上传凭证（cloud-server /sts/admin 返回） */
export interface UploadCredentials {
  platform: string;
  bucket: string;
  region: string;
  keyPrefix: string;
  publicBase: string;
  credentials: {
    tmpSecretId: string;
    tmpSecretKey: string;
    sessionToken: string;
  };
  startTime: number;
  expiredTime: number;
}

/** 平台上传器接口 */
export interface Uploader {
  /** 上传文件到对象存储，返回对象 key */
  upload(file: File, cred: UploadCredentials, onProgress?: (pct: number) => void): Promise<string>;
}
