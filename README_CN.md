# 📸 大头贴自助终端 — Photo Booth

[English](README.md) | 中文文档

三端 pnpm monorepo：Electron 前台拍照合成 → COS/S3 直传 → 管理后台查看订单。

## 项目结构

```
photo_booth_demo/
├── apps/
│   ├── kiosk-client/        # 前台终端 (Electron + React + SQLite)
│   │   ├── src/main/         #   主进程：拍照落盘、上传队列、系统状态、OTA 更新
│   │   │   └── uploader/     #     平台上传器 (interface / cos / s3)
│   │   ├── src/renderer/     #   渲染进程：大头贴 UI、Canvas 合成、贴纸编辑、二维码
│   │   ├── src/preload/      #   IPC 安全桥接
│   │   └── resources/templates/ #   模板资源：{1,2,4}/1.json + 1.webp
│   ├── admin-dashboard/      # 中台管理 (Ant Design Pro)
│   │   └── src/pages/        #   login / devices / orders / admins
│   └── cloud-server/         # 云端服务 (Fastify + Drizzle ORM + Socket.IO)
│       ├── src/routes/       #   auth / devices / photos / sts / adminUsers / releases
│       ├── src/db/           #   Drizzle schema 定义
│       ├── src/realtime/     #   Socket.IO 设备网关
│       ├── src/storage/      #   存储抽象 (provider 接口 + tencent-cos + aws-s3)
│       └── Dockerfile        #   Docker 镜像定义
├── packages/shared/          # 共享 TS 类型 (device / protocol / upload)
└── docs/PLAN.md
```

> **注意**：中台的 `base` / `publicPath` 在 `.umirc.ts` 中按环境切换：开发环境为 `/`，生产环境硬编码为 `/projects/photo_booth/admin/`。若 `KEY_PREFIX` 变更，需同步修改 `.umirc.ts`。

## ✨ 亮点功能

### 📸 核心拍照体验
- **多模板支持**：1 张 / 2 张 / 4 张拍照模板，可扩展 JSON 配置
- **Canvas 实时合成**：照片 cover 裁剪 + 相框叠加 + 拖拽贴纸装饰
- **倒计时 + 闪光模拟**：专业拍照体验，逐张确认后进入下一张
- **打印优先，上传异步**：不阻塞用户，扫码下载按需触发

### 🔄 自动增量更新 (OTA)
- **electron-updater 差分更新**：通过 `.blockmap` 仅下载变更块，节省带宽
- **版本管理**：中台「发布管理」页统一上传、注册、上线/下线
- **多平台独立**：macOS / Windows / Linux × arm64 / x64 独立管理
- **零停机安装**：macOS 自动下载 → 重启安装（需一致签名证书）

### 🖥️ 远程设备控制
- **实时心跳监控**：5s 间隔上报，云端自动判定在线/离线
- **远程指令下发**：LOCK / UNLOCK / REBOOT / SHUTDOWN，带审计日志
- **中台实时看板**：设备状态、待上传队列、累计拍摄数一目了然

### 🌐 多语言国际化
- **中英双语**：中台 + 前台均支持 zh-CN / en-US 切换
- **Umi 国际化方案**：`@umijs/max` locale 插件，浏览器语言自动检测

### 📦 存储平台抽象
- **同构接口**：服务端（STS 凭证签发） + 前台（直传）共用接口定义
- **多平台**：腾讯云 COS + AWS S3 已实现，新平台只需加一个文件
- **断点续传**：COS `sliceUploadFile` / S3 `@aws-sdk/lib-storage` 内置

### 🗄️ 轻量 ORM（Drizzle）
- **零运行时开销**：纯 TypeScript schema + mysql2 驱动，无 native engine
- **无代码生成**：告别 `prisma generate`，schema 即代码

## 系统截图

### 管理中台

| 设备管理 | 发布管理 |
|----------|----------|
| ![设备管理](docs/jpg/1_zh.jpg) | ![发布管理](docs/jpg/3_zh.jpg) |

| 订单列表 |
|----------|
| ![订单列表](docs/jpg/2_zh.jpg) |

### 前台终端

| 拍照界面 | 模板选择 |
|----------|----------|
| ![拍照](docs/jpg/client_1_en.jpg) | ![模板](docs/jpg/client_2_en.jpg) |

| 贴纸编辑 | 结果预览 | 管理面板 |
|----------|----------|----------|
| ![贴纸](docs/jpg/client_3_en.jpg) | ![结果](docs/jpg/client_4_en.jpg) | ![管理](docs/jpg/client_6_en.jpg) |

| 扫码下载照片 |
|-------------|
| ![扫码下载](docs/jpg/client_5_en.jpg) |

| 增量更新 |
|----------|
| ![增量更新](docs/jpg/client_7_en.jpg) |

## 测试下载

| 平台 | 架构 | 版本 | 下载 |
|------|------|------|------|
| macOS | ARM64 (Apple Silicon) | 1.0.0 | [PhotoBoothKiosk-1.0.0-arm64-mac.zip](https://static.lunastudio.cn/projects/photo_booth/updates/PhotoBoothKiosk-1.0.0-arm64-mac-f52ff069.zip) |

## 核心技术

| 端 | 技术栈 |
|---|---|
| **前台** | Electron 33 + electron-vite + React 18 + better-sqlite3 + socket.io-client + COS SDK + S3 SDK |
| **中台** | Ant Design Pro (UmiJS 4) |
| **服务端** | Fastify 5 + Drizzle ORM (MySQL) + Socket.IO + qcloud-cos-sts + JWT |

## 核心流程

### 拍摄 → 合成 → 打印 → 扫码下载

```
选择模板(1/2/4张) → 逐张拍摄(倒计时→闪光→定格，用户确认后下一张)
  → 进入后期编辑 → 贴纸装饰
  → composeWithTemplate() Canvas 合成
     (模板背景图 + 照片 cover 填充到 frame + 相框层 + 贴纸)
  → 打印 → 结果页
  → 用户点「生成二维码下载」→ 触发上传到 COS/S3
  → 上传完成后显示二维码 → 扫码查看照片
```

- 打印优先，上传按需触发，不影响终端正常使用
- 二维码指向 CDN 公网地址

### 存储平台抽象

服务端和前台各自定义同构接口，按 `platform` 字段分发：

```
服务端 StorageProvider（签发凭证）          前台 Uploader（直传）
┌─────────────────────────┐          ┌─────────────────────────┐
│ provider.ts (接口)       │          │ interface.ts (接口)      │
│ tencent-cos.ts (COS STS) │ ──STS──▶ │ cos.ts (sliceUploadFile)│
│ aws-s3.ts (S3 STS)       │          │ s3.ts (@aws-sdk)        │
└─────────────────────────┘          └─────────────────────────┘
```

新增平台只需在两端各加一个实现文件，无需改动核心流程。

> **管理端 uploader**：`apps/admin-dashboard/src/uploader/` 与此同构。
> 当前启用 `tencent-cos`，S3 已实现但注释（`s3.ts`），启用时取消 `index.ts` 注释即可。
> 浏览器端用 `cos-js-sdk-v5` / `@aws-sdk/client-s3` + `@aws-sdk/lib-storage`。

### 上传架构

```
前台 ──① POST /sts ──▶ 服务端 StorageProvider ──签发 STS 临时凭证──▶ 前台
         (限定 ${KEY_PREFIX}photos/{deviceId}/*)
前台 ──② 平台 SDK 直传（内置分片续传）
         COS: sliceUploadFile | S3: @aws-sdk/lib-storage
前台 ──③ POST /photos (cosKey + publicUrl) ──▶ 创建订单，中台可见 + CDN 预览
```

## 部署与发布

发布流程（打包、签名、OTA、以及通过中台手动上传）已迁移到：

- [docs/deploy_CN.md](docs/deploy_CN.md)

README 仅保留入口，避免发布步骤在多处重复导致歧义。

### 模板系统

`apps/kiosk-client/resources/templates/{张数}/` 下每个模板 = JSON + 图片：

- **JSON**: `name`、`shotCount`、`frames[]`（每张照片在背景图上的 0~1 比例坐标）
- **WebP**: 带相框装饰的模板背景图

合成时：先依次画各照片到对应 frame（cover 裁剪不变形），再画模板相框层，最后画贴纸。输出尺寸 = 模板图片原始尺寸。

### 本地存储与清理

照片存于 `{userData}/photos/{日期}/{订单号}/` 目录。管理面板「本地存储」可设保留天数：

- **7 天**（默认）/ 14 天 / 1 个月
- 启动时 + 每 6 小时自动清理过期目录
- 设置持久化到 `settings.json`

### 前台 SQLite 状态机

`upload_task` 表 (`pending` → `uploading` → `completed`/`failed`)：
- 拍照即落 `pending` → 上传中持久化断点
- 上传由用户按需触发（扫码下载按钮），非自动
- 崩溃/断网重启 → 自动扫描续传
- 成功后删本地文件、保留任务记录

## 数据模型 (MySQL — Drizzle ORM)

| 表 | 字段 |
|---|---|
| `AdminUser` | username, passwordHash, role |
| `Device` | id, name, location, status, appVersion, lastSeen |
| `Photo` | id, deviceId, filename, size, sha256, cosKey, publicUrl, status |
| `CommandLog` | deviceId, type, issuedBy, ackedAt |
| `Release` | version, platform, arch, filename, size, sha512, cosKey, blockmapCosKey |

## 快速开始

```bash
pnpm install

# 1) 服务端 (:4000)
cd apps/cloud-server
cp .env.example .env
# 编辑 .env：填入 MySQL DATABASE_URL 和 COS 凭证
pnpm db:push      # 同步 schema 到数据库
pnpm db:setup     # 种子数据 (admin/admin123)
pnpm dev

# 2) 中台 (:8000) —— admin / admin123
cd apps/admin-dashboard && pnpm dev

# 3) 前台 (Electron)
cd apps/kiosk-client
pnpm rebuild:native    # 首次：为 Electron ABI 重编 better-sqlite3
pnpm dev

# 前台管理面板：启动后在拍照界面输入 PIN 码即可进入
# 默认 PIN: 8888（可通过 KIOSK_ADMIN_PIN 环境变量修改）
# 管理面板可查看版本号、调整 API 地址、检查 OTA 更新
# 窗口化开发模式（不锁全屏）：
KIOSK_WINDOWED=1 pnpm dev
```

## 环境变量 (cloud-server)

完整变量列表见 [`.env.example`](apps/cloud-server/.env.example)。

```env
DATABASE_URL=mysql://root:pass1234@127.0.0.1:3306/photo_booth
# 腾讯云 COS
COS_SECRET_ID=
COS_SECRET_KEY=
COS_BUCKET=
COS_REGION=ap-chengdu
# AWS S3（备选平台）
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_BUCKET=
S3_REGION=
# 上传目录前缀（末尾需带 /）
KEY_PREFIX=projects/photo_booth/
# STS 临时凭证有效期（秒）
STS_DURATION=1800
CDN_BASE=
JWT_SECRET=
```

## Docker 部署

### 构建镜像

```bash
docker build -f apps/cloud-server/Dockerfile -t photo-booth-server .
```

### 运行容器

```bash
docker run --env-file apps/cloud-server/.env -p 4000:4000 photo-booth-server
```

## API 速览

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| POST | `/auth/login` | - | 登录取 JWT |
| GET/POST | `/admin/users` | JWT | 管理员管理 |
| GET/POST | `/devices` | JWT | 设备管理 |
| POST | `/devices/:id/commands` | JWT | 下发 LOCK/UNLOCK |
| GET | `/photos` | JWT | 订单列表 (含 `previewUrl`) |
| POST | `/photos` | - | 前台创建订单 |
| POST | `/sts` | - | 签发上传凭证（照片） |
| POST | `/sts/admin` | JWT | 签发上传凭证（管理端，如升级包） |
| GET/POST/DELETE | `/releases` | JWT | 升级包发布管理 |
| GET | `/updates/latest-mac.yml` | - | macOS 升级检测 yml（动态生成） |
| GET | `/updates/latest.yml` | - | Windows 升级检测 yml |
| GET | `/updates/latest-linux.yml` | - | Linux 升级检测 yml |
| GET | `/health` | - | 健康检查 |
| WS | socket.io | - | register/heartbeat/command_ack ↔ command |

## 验证状态

- `packages/shared`、`cloud-server`、`admin-dashboard`、`kiosk-client`：**typecheck 全通过**。
- `admin-dashboard`、`kiosk-client`：**生产构建通过**。
- cloud-server：curl 覆盖 auth(401/400)、设备增删、指令下发、订单、STS、管理员。
- **断点续传实测**：mock 引擎中断@50% → HEAD 对齐 → 409 防重放 → 续传 → sha256 校验 → 落订单。
- **前台上传实测**（`processTask`）：模拟崩溃@250KB → 重启续传至 700KB → 删本地文件 → 订单在中台可见。
- **指令实测**（`Realtime`）：前台上线(心跳/待传数)→ 管理员发 LOCK → 前台收到 → ACK 回执入日志。

## 不在本 demo 范围

多租户计费、AI、OTA 灰度（已从初始脚手架移除）。

## 项目合作

对本项目感兴趣？加我微信：

![微信](docs/jpg/wechat.jpg)
