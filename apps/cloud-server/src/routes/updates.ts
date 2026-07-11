import type { FastifyInstance } from 'fastify';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db.js';
import { releases } from '../db/schema.js';
import { config } from '../config.js';

/** 平台 → electron-updater yml 文件名 */
const PLATFORM_YML: Record<string, string> = {
  darwin: 'latest-mac.yml',
  win32: 'latest.yml',
  linux: 'latest-linux.yml',
};

/** 简单 semver 比较：返回正数表示 a > b */
function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

async function buildYml(platform: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(releases)
    .where(and(eq(releases.platform, platform), eq(releases.enabled, true)));
  if (rows.length === 0) return null;

  // 按语义版本号取最大版本
  rows.sort((a, b) => compareSemver(b.version, a.version));
  const latestVersion = rows[0].version;
  const sameVersion = rows.filter((r) => r.version === latestVersion);

  const baseUrl = config.cdnBase || `https://${config.cos.bucket}.cos.${config.cos.region}.myqcloud.com/`;

  const lines: string[] = [`version: ${latestVersion}`];

  if (sameVersion.length === 1) {
    const r = sameVersion[0];
    const url = baseUrl + r.cosKey;
    lines.push('files:', `  - url: ${url}`, `    sha512: ${r.sha512}`, `    size: ${r.size}`);
    lines.push(`path: ${url.split('/').pop()}`);
    lines.push(`sha512: ${r.sha512}`);
  } else {
    for (const r of sameVersion) {
      const url = baseUrl + r.cosKey;
      lines.push(`${r.arch}:`, `  url: ${url}`, `  sha512: ${r.sha512}`, `  size: ${r.size}`);
    }
    const first = sameVersion[0];
    const firstUrl = baseUrl + first.cosKey;
    lines.push(`path: ${firstUrl.split('/').pop()}`);
    lines.push(`sha512: ${first.sha512}`);
  }

  lines.push(`releaseDate: '${sameVersion[0].createdAt.toISOString()}'`);

  return lines.join('\n') + '\n';
}

export async function updateRoutes(app: FastifyInstance): Promise<void> {
  app.get('/updates/latest-mac.yml', async (_req, reply) => {
    const yml = await buildYml('darwin');
    if (!yml) return reply.code(404).send('no release');
    return reply.type('text/yaml').send(yml);
  });

  app.get('/updates/latest.yml', async (_req, reply) => {
    const yml = await buildYml('win32');
    if (!yml) return reply.code(404).send('no release');
    return reply.type('text/yaml').send(yml);
  });

  app.get('/updates/latest-linux.yml', async (_req, reply) => {
    const yml = await buildYml('linux');
    if (!yml) return reply.code(404).send('no release');
    return reply.type('text/yaml').send(yml);
  });

  app.get('/updates/blockmap/:version', async (req, reply) => {
    const { version } = req.params as { version: string };
    const { platform, arch } = req.query as { platform?: string; arch?: string };

    const conditions = [eq(releases.version, version), eq(releases.enabled, true)];
    if (platform) conditions.push(eq(releases.platform, platform));
    if (arch) conditions.push(eq(releases.arch, arch));

    const rows = await db.select().from(releases).where(and(...conditions)).orderBy(desc(releases.createdAt)).limit(1);
    const record = rows[0];
    if (!record || !record.blockmapCosKey) {
      return reply.code(404).send({ error: 'blockmap not found' });
    }
    const baseUrl = config.cdnBase || `https://${config.cos.bucket}.cos.${config.cos.region}.myqcloud.com/`;
    return reply.send({ url: baseUrl + record.blockmapCosKey });
  });
}
