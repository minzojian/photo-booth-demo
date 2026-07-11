#!/usr/bin/env bash
# 一键启动大头贴自助终端三端（在你自己的终端里跑，避免被 agent 会话的进程清理误杀）
# 用法: bash scripts/dev-all.sh   (Ctrl-C 停止全部)
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

echo "▶ 大头贴自助终端 — 启动三端"
echo "  根目录: $ROOT"

# 确保依赖就绪（首次）
if [ ! -d node_modules ]; then echo "› 安装依赖..."; pnpm install; fi

# 确保服务端 DB 就绪
if [ ! -f apps/cloud-server/prisma/dev.db ]; then
  echo "› 初始化数据库 + 种子(admin/admin123)..."
  ( cd apps/cloud-server && pnpm exec prisma generate && pnpm exec prisma db push --skip-generate && pnpm exec tsx src/seed.ts )
fi

pids=()
cleanup() { echo; echo "■ 停止所有服务..."; for p in "${pids[@]:-}"; do kill "$p" 2>/dev/null || true; done; exit 0; }
trap cleanup INT TERM

echo "› [1/3] 云服务端 :4000"
( cd apps/cloud-server && ./node_modules/.bin/tsx src/index.ts ) & pids+=($!)

# 等服务端就绪
for i in $(seq 1 30); do
  if curl -s -o /dev/null http://localhost:4000/health 2>/dev/null; then break; fi
  sleep 0.5
done
echo "  ✓ 服务端就绪 (http://localhost:4000)"

echo "› [2/3] 管理中台 :8000  (登录 admin / admin123)"
( cd apps/admin-dashboard && ./node_modules/.bin/max dev ) & pids+=($!)

echo "› [3/3] 前台 Electron  (首次需先: cd apps/kiosk-client && pnpm rebuild:native)"
( cd apps/kiosk-client && KIOSK_DEVICE_ID=kiosk-sh-001 ./node_modules/.bin/electron-vite dev ) & pids+=($!)

echo
echo "════════════════════════════════════════════"
echo "  服务端 REST/WS : http://localhost:4000"
echo "  管理中台       : http://localhost:8000  (admin/admin123)"
echo "  前台           : Electron 窗口 (设备 kiosk-sh-001)"
echo "  Ctrl-C 停止全部"
echo "════════════════════════════════════════════"
wait
