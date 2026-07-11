#!/usr/bin/env bash
# =============================================================================
# deploy-to-cos.sh — 构建并部署 admin-dashboard 到腾讯云 COS
#                  Build & deploy admin dashboard to Tencent Cloud COS
# =============================================================================
# 用法 / Usage:
#   bash scripts/deploy-to-cos.sh                # 构建 + 上传
#   bash scripts/deploy-to-cos.sh --skip-build   # 仅上传（跳过构建）
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ADMIN_DIR="$ROOT/apps/admin-dashboard"
CLOUD_DIR="$ROOT/apps/cloud-server"
SKIP_BUILD=false

[[ "${1:-}" == "--skip-build" ]] && SKIP_BUILD=true

# ── 加载环境变量 / Load env ────────────────────────────────────────────────
if [[ -f "$CLOUD_DIR/.env" ]]; then
  set -a; source "$CLOUD_DIR/.env"; set +a
fi

BUCKET="${COS_BUCKET:-}"
REGION="${COS_REGION:-ap-chengdu}"
COS_SECRET_ID="${COS_SECRET_ID:-}"
COS_SECRET_KEY="${COS_SECRET_KEY:-}"
COS_PREFIX="${KEY_PREFIX:-}admin"

if [[ -z "$BUCKET" || -z "$COS_SECRET_ID" ]]; then
  echo "❌ 缺少 COS 配置 / Missing COS config"
  echo "   请在 apps/cloud-server/.env 中设置 COS_BUCKET, COS_SECRET_ID, COS_SECRET_KEY"
  exit 1
fi

echo "=============================================="
echo "  Deploy: admin-dashboard → COS"
echo "  Bucket:  $BUCKET"
echo "  Region:  $REGION"
echo "  Prefix:  $COS_PREFIX"
echo "=============================================="
echo ""

# ── 构建 / Build ──────────────────────────────────────────────────────────
if [[ "$SKIP_BUILD" == false ]]; then
  echo "🔨 构建 admin-dashboard ..."
  cd "$ADMIN_DIR"
  API_SERVER="${API_SERVER:-https://indie.lunastudio.cn/photo_booth/api}" pnpm run build 2>&1
  cd "$ROOT"
  echo "✅ 构建完成"
fi

DIST_DIR="$ADMIN_DIR/dist"
if [[ ! -d "$DIST_DIR" ]]; then
  echo "❌ 找不到构建产物: $DIST_DIR"
  exit 1
fi

# ── 上传 / Upload ─────────────────────────────────────────────────────────
echo "📤 上传到 COS..."
# cos-nodejs-sdk-v5 安装在 kiosk-client，通过 NODE_PATH 让内联脚本找到它
NODE_PATH="$ROOT/apps/kiosk-client/node_modules" node -e "
const COS = require('cos-nodejs-sdk-v5');
const fs = require('fs');
const path = require('path');

const cos = new COS({ SecretId: '$COS_SECRET_ID', SecretKey: '$COS_SECRET_KEY' });

function walk(dir, prefix) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const key = prefix + '/' + entry.name;
    if (entry.isDirectory()) {
      walk(fullPath, key);
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      const mimeMap = {
        '.html': 'text/html; charset=utf-8',
        '.css':  'text/css; charset=utf-8',
        '.js':   'application/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.png':  'image/png',
        '.jpg':  'image/jpeg',
        '.svg':  'image/svg+xml',
        '.ico':  'image/x-icon',
        '.woff': 'font/woff',
        '.woff2':'font/woff2',
      };
      const ct = mimeMap[ext] || 'application/octet-stream';
      cos.putObject({
        Bucket: '$BUCKET', Region: '$REGION', Key: key,
        Body: fs.createReadStream(fullPath), ContentType: ct
      }, (err) => {
        if (err) { console.error('  ✗ ' + key + ' ' + err.message); process.exitCode = 1; }
        else console.log('  ✓ ' + key);
      });
    }
  }
}
walk('$DIST_DIR', '$COS_PREFIX');
"

echo ""
echo "✅ 完成！"
echo "   访问: https://${BUCKET}.cos.${REGION}.myqcloud.com/${COS_PREFIX}/index.html"
