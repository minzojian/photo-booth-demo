import { config } from '../config.js';
import type { StorageProvider, UploadCredentials } from './provider.js';

/**
 * AWS S3 存储平台实现。
 * 通过 AWS STS 签发限定路径的临时凭证，前台用 S3 SDK 直传。
 *
 * 使用前需安装依赖：
 *   pnpm --filter @lunastudio/cloud-server add @aws-sdk/client-sts
 *
 * 切换到 S3：在 index.ts 中将 `new TencentCOSProvider()` 替换为 `new S3Provider()`。
 */
export class S3Provider implements StorageProvider {
  readonly platform = 'aws-s3';

  async getUploadCredentials(deviceId: string): Promise<UploadCredentials> {
    return this.issueCredentials(`photos/${deviceId}/`, deviceId);
  }

  async getAdminUploadCredentials(scope: string): Promise<UploadCredentials> {
    return this.issueCredentials(`${scope}/`, 'admin');
  }

  private async issueCredentials(subPath: string, requesterId: string): Promise<UploadCredentials> {
    const keyPrefix = config.keyPrefix + subPath;

    // AWS STS GetFederationToken 获取临时凭证
    const { STSClient, GetFederationTokenCommand } = await import('@aws-sdk/client-sts');
    const client = new STSClient({
      region: config.s3.region,
      credentials: {
        accessKeyId: config.s3.accessKeyId,
        secretAccessKey: config.s3.secretAccessKey,
      },
    });

    const policy = JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: [
            's3:PutObject',
            's3:AbortMultipartUpload',
          ],
          Resource: `arn:aws:s3:::${config.s3.bucket}/${keyPrefix}*`,
        },
      ],
    });

    const cmd = new GetFederationTokenCommand({
      Name: `photo-booth-${requesterId}`,
      Policy: policy,
      DurationSeconds: config.stsDurationSeconds,
    });

    const result = await client.send(cmd);
    const creds = result.Credentials!;

    return {
      platform: this.platform,
      bucket: config.s3.bucket,
      region: config.s3.region,
      keyPrefix,
      publicBase: (config.cdnBase || '') + keyPrefix,
      credentials: {
        tmpSecretId: creds.AccessKeyId!,
        tmpSecretKey: creds.SecretAccessKey!,
        sessionToken: creds.SessionToken!,
      },
      startTime: Math.floor(Date.now() / 1000),
      expiredTime: Math.floor(creds.Expiration!.getTime() / 1000),
    };
  }
}
