# =============================================================================
# Photo Booth Cloud Server — Docker Image
# 纯 npm，无 pnpm，无 workspace，无 lockfile——干净清爽。
# =============================================================================
FROM node:24-alpine
WORKDIR /app
ARG NPM_REGISTRY=https://registry.npmjs.org

# ── 复制 package.json + 本地 shared 包 ─────────────────────────────────────
COPY apps/cloud-server/package.json ./
COPY packages/shared/ ./packages/shared/

# workspace:* → file:（npm 原生支持本地依赖）
RUN sed -i 's|workspace:\*|file:./packages/shared|' package.json

# ── 安装（纯 npm，不会拉到前台包）─────────────────────────────────────────
RUN npm config set registry "$NPM_REGISTRY" && npm install

# ── 源码 + 编译 ────────────────────────────────────────────────────────────
COPY apps/cloud-server/tsconfig.json ./
COPY tsconfig.base.json ./
COPY apps/cloud-server/src/ ./src/

# 修正 extends 路径
RUN sed -i 's|"../../tsconfig.base.json"|"./tsconfig.base.json"|' tsconfig.json

RUN npx tsc

# 删掉源码减小镜像体积（保留 packages/shared，npm file: 依赖需要）
RUN rm -rf src packages/shared/src tsconfig.json tsconfig.base.json

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "dist/index.js"]
