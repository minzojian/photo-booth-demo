const { execFileSync, spawnSync } = require('node:child_process');
const path = require('node:path');

function inspectSignature(appPath) {
  const r = spawnSync('codesign', ['-dvv', appPath], { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`codesign inspect failed: ${r.stderr || r.stdout || 'unknown error'}`);
  }
  return `${r.stdout || ''}\n${r.stderr || ''}`;
}

exports.default = async function afterPack(context) {
  if (process.platform !== 'darwin') return;

  const autoDiscoveryDisabled = String(process.env.CSC_IDENTITY_AUTO_DISCOVERY || '').toLowerCase() === 'false';
  if (autoDiscoveryDisabled) {
    console.log('[after-pack] CSC_IDENTITY_AUTO_DISCOVERY=false, skip local identity re-sign');
    return;
  }

  const appName = context.packager.appInfo.productFilename + '.app';
  const appPath = path.join(context.appOutDir, appName);

  let out = inspectSignature(appPath);
  if (/Signature=adhoc/i.test(out)) {
    const identity = process.env.CSC_NAME || process.env.KIOSK_SIGN_IDENTITY || 'PhotoBooth Local Code Signing';
    execFileSync('codesign', ['--force', '--sign', identity, appPath], { stdio: 'inherit' });
    out = inspectSignature(appPath);
    if (/Signature=adhoc/i.test(out)) {
      throw new Error(
        `mac build is still ad-hoc after re-sign with identity "${identity}". Ensure this identity exists and is trusted.`,
      );
    }
  }
};
