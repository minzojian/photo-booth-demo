import { TencentCOSUploader } from './cos';
// S3 暂未启用：取消注释下一行 + 安装 @aws-sdk/client-s3 @aws-sdk/lib-storage 即可切换
// import { S3Uploader } from './s3';

export type { Uploader, UploadCredentials } from './interface';

const uploaders: Record<string, Uploader> = {
  'tencent-cos': new TencentCOSUploader(),
  // 'aws-s3': new S3Uploader(),
};

/** 根据 STS 返回的 platform 选择上传器 */
export function getUploader(platform: string): Uploader {
  const u = uploaders[platform];
  if (!u) throw new Error(`unsupported platform: ${platform}`);
  return u;
}
