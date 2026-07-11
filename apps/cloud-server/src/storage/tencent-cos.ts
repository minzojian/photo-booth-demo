import STS from 'qcloud-cos-sts';
import { config } from '../config.js';
import type { StorageProvider, UploadCredentials } from './provider.js';

function appIdOf(bucket: string): string {
  const parts = bucket.split('-');
  return parts[parts.length - 1] ?? '';
}

/**
 * 腾讯云 COS 存储平台实现。
 * 签发限定路径的 STS 临时密钥，前台用 COS SDK sliceUploadFile 直传。
 */
export class TencentCOSProvider implements StorageProvider {
  readonly platform = 'tencent-cos';

  async getUploadCredentials(deviceId: string): Promise<UploadCredentials> {
    return this.issueCredentials(`photos/${deviceId}/`);
  }

  async getAdminUploadCredentials(scope: string): Promise<UploadCredentials> {
    return this.issueCredentials(`${scope}/`);
  }

  private async issueCredentials(subPath: string): Promise<UploadCredentials> {
    const keyPrefix = config.keyPrefix + subPath;
    const appId = appIdOf(config.cos.bucket);
    const resource = `qcs::cos:${config.cos.region}:uid/${appId}:${config.cos.bucket}/${keyPrefix}*`;
    const policy = {
      version: '2.0',
      statement: [
        {
          action: [
            'name/cos:PutObject',
            'name/cos:PostObject',
            'name/cos:InitiateMultipartUpload',
            'name/cos:ListMultipartUploads',
            'name/cos:ListParts',
            'name/cos:UploadPart',
            'name/cos:CompleteMultipartUpload',
            'name/cos:AbortMultipartUpload',
          ],
          effect: 'allow' as const,
          resource: [resource],
        },
      ],
    };

    const data = await new Promise<{
      credentials: { tmpSecretId: string; tmpSecretKey: string; sessionToken: string };
      startTime: number;
      expiredTime: number;
    }>((resolve, reject) => {
      STS.getCredential(
        {
          secretId: config.cos.secretId,
          secretKey: config.cos.secretKey,
          durationSeconds: config.stsDurationSeconds,
          policy,
        },
        (err, d) => (err ? reject(err) : resolve(d)),
      );
    });

    return {
      platform: this.platform,
      bucket: config.cos.bucket,
      region: config.cos.region,
      keyPrefix,
      publicBase: (config.cdnBase || '') + keyPrefix,
      credentials: {
        tmpSecretId: data.credentials.tmpSecretId,
        tmpSecretKey: data.credentials.tmpSecretKey,
        sessionToken: data.credentials.sessionToken,
      },
      startTime: data.startTime,
      expiredTime: data.expiredTime,
    };
  }
}
