import path from 'node:path';

// Node 20.12+/24 内置读取 .env，无需 dotenv 依赖。
try {
  process.loadEnvFile(path.resolve(process.cwd(), '.env'));
} catch {
  // 没有 .env 就用进程环境变量 / 默认值——demo 可零配置启动。
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  keyPrefix: process.env.KEY_PREFIX ?? 'projects/photo_booth/',
  stsDurationSeconds: Number(process.env.STS_DURATION ?? 1800),
  cos: {
    secretId: process.env.COS_SECRET_ID ?? '',
    secretKey: process.env.COS_SECRET_KEY ?? '',
    bucket: process.env.COS_BUCKET ?? '',
    region: process.env.COS_REGION ?? '',
  },
  s3: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
    bucket: process.env.S3_BUCKET ?? '',
    region: process.env.S3_REGION ?? '',
  },
  cdnBase: process.env.CDN_BASE || '',
};
