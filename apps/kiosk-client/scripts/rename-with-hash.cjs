const { renameSync, readFileSync, writeFileSync, readdirSync, unlinkSync, existsSync } = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PRODUCT = 'PhotoBoothKiosk';
const RELEASE_DIR = path.join(__dirname, '..', 'release');
const BLOCK_SIZE = 64 * 1024; // 64 KB per block

/** 为文件生成 electron-updater blockmap（SHA-512 per 64KB chunk → base64） */
function generateBlockmap(filePath, blockmapPath) {
  if (existsSync(blockmapPath)) return; // already exists
  const buf = readFileSync(filePath);
  const blocks = [];
  for (let offset = 0; offset < buf.length; offset += BLOCK_SIZE) {
    const end = Math.min(offset + BLOCK_SIZE, buf.length);
    const chunk = buf.subarray(offset, end);
    const hash = crypto.createHash('sha512').update(chunk).digest('base64');
    blocks.push({ size: end - offset, sha512: hash });
  }
  writeFileSync(blockmapPath, JSON.stringify(blocks));
  console.log('[rename-with-hash] blockmap generated:', path.basename(blockmapPath), `(${blocks.length} blocks)`);
}

function parseVersionFromName(name) {
  const m = name.match(/-(\d+\.\d+\.\d+)-/);
  return m ? m[1] : '';
}

function parsePathFromYml(ymlPath) {
  if (!existsSync(ymlPath)) return '';
  const content = readFileSync(ymlPath, 'utf8');
  const m = content.match(/^path:\s+(.+)$/m);
  return m ? m[1].trim() : '';
}

function cleanupSameVersionArtifacts(outDir, version, archOs, keepNames) {
  const keep = new Set(keepNames);
  const prefix = `${PRODUCT}-${version}-${archOs}`;
  const files = readdirSync(outDir);
  for (const f of files) {
    const isZip = f.endsWith('.zip') && !f.endsWith('.zip.blockmap');
    const isExe = f.endsWith('.exe') && !f.endsWith('.exe.blockmap');
    const isBlockmap = f.endsWith('.zip.blockmap') || f.endsWith('.exe.blockmap');
    if (!isZip && !isExe && !isBlockmap) continue;
    if (!f.startsWith(prefix)) continue;
    if (keep.has(f)) continue;
    try {
      unlinkSync(path.join(outDir, f));
      console.log('[rename-with-hash] removed stale artifact:', f);
    } catch {
      // ignore individual cleanup failures
    }
  }
}

function renameZip(zipPath, options = {}) {
  const pruneSameVersion = !!options.pruneSameVersion;
  const outDir = path.dirname(zipPath);
  const base = path.basename(zipPath);

  // PhotoBoothKiosk-1.0.2-arm64-mac.zip → PhotoBoothKiosk-1.0.2-arm64-mac-{hash}.zip
  // PhotoBoothKiosk-1.0.2-win-x64.exe  → PhotoBoothKiosk-1.0.2-win-x64-{hash}.exe
  const m = base.match(/-(?<version>\d+\.\d+\.\d+)-(?<archOs>.+)\.(zip|exe)$/);
  if (!m) { console.log('[rename-with-hash] skip (cannot parse version):', base); return; }

  const ext = path.extname(zipPath); // .zip or .exe

  const hash = crypto.createHash('md5').update(readFileSync(zipPath)).digest('hex').slice(0, 8);
  const newBase = `${PRODUCT}-${m.groups.version}-${m.groups.archOs}-${hash}${ext}`;
  const newZipPath = path.join(outDir, newBase);
  const newBlockmapBase = `${newBase}.blockmap`;
  if (base === newBase) { console.log('[rename-with-hash] skip (already renamed):', base); return; }

  if (pruneSameVersion) {
    cleanupSameVersionArtifacts(outDir, m.groups.version, m.groups.archOs, [base, `${base}.blockmap`, newBase, newBlockmapBase]);
  }

  renameSync(zipPath, newZipPath);
  console.log('[rename-with-hash]', base, '→', newBase);

  const oldBlockmap = zipPath + '.blockmap';
  const newBlockmap = newZipPath + '.blockmap';
  try { renameSync(oldBlockmap, newBlockmap); console.log('[rename-with-hash] blockmap renamed'); } catch { /* no blockmap */ }

  // 如果 electron-builder 没生成 blockmap（如 Windows zip 目标），自己生成
  if (!existsSync(newBlockmap)) {
    try { generateBlockmap(newZipPath, newBlockmap); } catch (e) { console.warn('[rename-with-hash] blockmap generation failed:', e.message); }
  }

  for (const ymlName of ['latest-mac.yml', 'latest.yml']) {
    const ymlFile = path.join(outDir, ymlName);
    try {
      let content = readFileSync(ymlFile, 'utf8');
      if (content.includes(base)) {
        content = content.replace(new RegExp(base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), newBase);
        writeFileSync(ymlFile, content);
        console.log('[rename-with-hash] updated', ymlName);
      }
    } catch { /* file doesn't exist */ }
  }
}

function pickCliTargets(versionArg) {
  const files = readdirSync(RELEASE_DIR);
  const unhashed = files.filter((f) =>
    f.startsWith(PRODUCT)
    && (f.endsWith('.zip') || f.endsWith('.exe'))
    && !f.endsWith('.zip.blockmap')
    && !f.endsWith('.exe.blockmap')
    && !/-\w{8}\.(zip|exe)$/.test(f),
  );

  if (versionArg) {
    return unhashed.filter((f) => parseVersionFromName(f) === versionArg);
  }

  // 默认只处理当前 yml 指向的目标，避免误处理历史遗留的未重命名文件。
  const ymlCandidates = ['latest-mac.yml', 'latest.yml'];
  for (const ymlName of ymlCandidates) {
    const ymlPath = path.join(RELEASE_DIR, ymlName);
    const p = parsePathFromYml(ymlPath);
    if (!p) continue;
    const base = path.basename(p);
    if (unhashed.includes(base)) return [base];
  }

  return unhashed;
}

// 直接调用模式（npm script 串联）
if (require.main === module) {
  const versionArgIndex = process.argv.indexOf('--version');
  const versionArg = versionArgIndex >= 0 ? process.argv[versionArgIndex + 1] : '';
  const targets = pickCliTargets(versionArg);
  if (targets.length === 0) {
    console.log('[rename-with-hash] skip: no target zip found');
  }
  for (const f of targets) renameZip(path.join(RELEASE_DIR, f), { pruneSameVersion: true });
} else {
  // electron-builder hook 模式
  exports.default = async function renameWithHash(buildResult) {
    const artifactPaths = (buildResult.artifactPaths || []).filter(p =>
      (p.endsWith('.zip') || p.endsWith('.exe')) &&
      !p.endsWith('.zip.blockmap') &&
      !p.endsWith('.exe.blockmap')
    );
    for (const p of artifactPaths) renameZip(p);
  };
}


