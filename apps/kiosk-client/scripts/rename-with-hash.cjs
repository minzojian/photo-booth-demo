const { renameSync, readFileSync, writeFileSync, readdirSync, unlinkSync, existsSync } = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const PRODUCT = 'PhotoBoothKiosk';
const RELEASE_DIR = path.join(__dirname, '..', 'release');

/** 找到 app-builder 原生二进制路径，用于生成 blockmap */
function findAppBuilder() {
  // 优先直接 require（hoisted / flat node_modules）
  try {
    return require.resolve('app-builder-bin');
  } catch { /* fallback to pnpm virtual store */ }
  // pnpm 严格模式：在 .pnpm 虚拟仓库中查找
  const candidates = [
    path.join(__dirname, '..', '..', '..', 'node_modules', '.pnpm'),
  ];
  for (const base of candidates) {
    if (!existsSync(base)) continue;
    const dirs = readdirSync(base);
    const binDir = dirs.find((d) => d.startsWith('app-builder-bin@'));
    if (!binDir) continue;
    const p = path.join(base, binDir, 'node_modules', 'app-builder-bin');
    if (!existsSync(p)) continue;
    try {
      return require.resolve(p);
    } catch { continue; }
  }
  return null;
}

/** 调用原生 app-builder 生成 blockmap（与 electron-builder 格式完全一致） */
function generateBlockmapNative(zipPath, blockmapPath) {
  if (existsSync(blockmapPath)) return;
  const appBuilderIndex = findAppBuilder();
  if (!appBuilderIndex) {
    console.warn('[rename-with-hash] app-builder binary not found, skip blockmap');
    return;
  }
  // app-builder-lib 的 executeAppBuilderAsJson 内部逻辑：
  // 根据平台选择 binary，调用 `blockmap --input <file> --output <output>`
  const binDir = path.dirname(appBuilderIndex);
  const platform = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : 'linux';
  const nodeArch = process.arch; // x64, arm64, ia32
  const binaryName = platform === 'win' ? 'app-builder.exe' : 'app-builder';
  // Windows: win/x64/app-builder.exe, macOS: mac/app-builder_amd64
  const archDir = platform === 'win' || platform === 'linux' ? nodeArch : '';
  const archSuffix = platform === 'mac' ? `_${nodeArch === 'x64' ? 'amd64' : nodeArch}` : '';
  const binaryPath = archDir
    ? path.join(binDir, platform, archDir, binaryName)
    : path.join(binDir, platform, `${binaryName}${archSuffix}`);
  if (!existsSync(binaryPath)) {
    console.warn('[rename-with-hash] app-builder binary not found for', platform, nodeArch);
    return;
  }
  const result = spawnSync(binaryPath, ['blockmap', '--input', zipPath, '--output', blockmapPath], { stdio: 'pipe', encoding: 'utf8' });
  if (result.status !== 0) {
    console.warn('[rename-with-hash] app-builder blockmap failed:', result.stderr || result.stdout);
    return;
  }
  console.log('[rename-with-hash] blockmap generated:', path.basename(blockmapPath));
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

  // 如果 electron-builder 没生成 blockmap（如 Windows zip 目标），用原生 app-builder 生成
  if (!existsSync(newBlockmap)) {
    try { generateBlockmapNative(newZipPath, newBlockmap); } catch (e) { console.warn('[rename-with-hash] blockmap generation failed:', e.message); }
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


