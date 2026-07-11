#!/usr/bin/env bash
# =============================================================================
# docker-build-push.sh — 构建并推送 cloud-server Docker 镜像到腾讯云 CCR
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLOUD_DIR="$ROOT/apps/cloud-server"

# ── 从 .env 读取 ──────────────────────────────────────────────────────────
if [[ -f "$CLOUD_DIR/.env" ]]; then
  set -a; source "$CLOUD_DIR/.env"; set +a
fi

# ── 配置 ───────────────────────────────────────────────────────────────────
REGISTRY="ccr.ccs.tencentyun.com"
NAMESPACE="${TENCENT_NAMESPACE:-applications}"
IMAGE="photo-booth-server"
TAG="${1:-$(date +%Y%m%d-%H%M%S)}"
NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmmirror.com}"

FULL_IMAGE="$REGISTRY/$NAMESPACE/$IMAGE:$TAG"

cd "$ROOT"

echo "=============================================="
echo "  Docker Build & Push"
echo "  Image: $FULL_IMAGE"
echo "  NPM Registry: $NPM_REGISTRY"
echo "=============================================="
echo ""

# ── 构建 ──────────────────────────────────────────────────────────────────
echo "🔨 构建镜像（linux/amd64）..."
docker build \
  --platform linux/amd64 \
  --provenance=false \
  --sbom=false \
  --build-arg "NPM_REGISTRY=$NPM_REGISTRY" \
  -f "$CLOUD_DIR/Dockerfile" \
  -t "$IMAGE:$TAG" \
  .
echo ""

# ── 打标签 ────────────────────────────────────────────────────────────────
echo "🏷️  打标签..."
docker tag "$IMAGE:$TAG" "$FULL_IMAGE"
docker tag "$IMAGE:$TAG" "$REGISTRY/$NAMESPACE/$IMAGE:latest"
echo ""

# ── 推送 ──────────────────────────────────────────────────────────────────
echo "📤 推送镜像..."
docker push "$FULL_IMAGE"
docker push "$REGISTRY/$NAMESPACE/$IMAGE:latest"
echo ""

echo "✅ 完成！"
echo "  镜像: $FULL_IMAGE"
echo "  latest: $REGISTRY/$NAMESPACE/$IMAGE:latest"
echo ""
echo "💡 TKE 滚动更新:"
echo "   kubectl set image deployment/photo-booth-server photo-booth-server=$FULL_IMAGE"
