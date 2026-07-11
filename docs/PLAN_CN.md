# 大头贴自助终端 — 架构参考

[English](PLAN.md) | 中文版

> 定位：聚焦版 Demo，不做全量 SaaS。

## 已实现

- **前台** (Electron): 模板大头贴拍照 → Canvas 合成 → 打印 → 结果页 → 按需上传 COS/S3（扫码下载） → 管理面板（任务/系统/本地存储/OTA）
- **中台** (Ant Design Pro): 管理员登录 → 设备管理 → 照片订单（CDN 预览链接） → 发布管理
- **服务端** (Fastify): 设备 CRUD、指令下发、照片订单、管理员认证、存储平台抽象（COS/S3）、Socket.IO 实时网关
- **国际化**: 中/英文切换，自动检测系统/浏览器语言，手动切换
- **Docker**: cloud-server 多阶段构建 Dockerfile，腾讯云 CCR 推送脚本
- **CI/CD**: GitHub Actions 工作流（腾讯云 CCR & AWS ECR）

## 存储平台抽象

```
服务端 StorageProvider                   前台 Uploader
┌──────────────────────┐            ┌──────────────────────┐
│ provider.ts (接口)    │            │ interface.ts (接口)   │
│ tencent-cos.ts (COS)  │ ──STS──▶  │ cos.ts (COS SDK)     │
│ aws-s3.ts (S3)        │            │ s3.ts (S3 SDK)       │
└──────────────────────┘            └──────────────────────┘
```

- 两端各定义同构接口，按 `platform` 字段分发
- 新增平台只需在两端各加一个实现文件
- COS secret 只在服务端，前台拿 STS 临时密钥

## 上传架构

```
前台 ──① POST /sts ──▶ 服务端 StorageProvider 签发凭证
前台 ──② 平台 SDK 直传（内置分片续传）
         COS: sliceUploadFile | S3: @aws-sdk/lib-storage
前台 ──③ POST /photos (cosKey + publicUrl) ──▶ 创建订单
```

- 上传由用户按需触发（结果页「生成二维码下载」按钮），非自动
- 不走本地文件上传，全部通过 COS/S3 直传

## 前台 SQLite 状态机

`upload_task`: `pending → uploading → completed/failed`
- 拍照落 pending → 用户触发上传 → 完成后删本地文件、保留记录
- 崩溃/断网重启 → 扫描续传

## 本地存储清理

`photos/{日期}/{订单号}/` 目录结构，管理面板可设保留天数（7/14/30 天），定时清理（启动时 + 每 6 小时）。

## 国际化

- **前台**: `zh`/`en` 存于 `AppSettings.language`，默认通过 Electron `app.getLocale()` 自动检测。右下角国旗按钮（🇨🇳/🇺🇸）手动切换。
- **中台**: UmiJS `locale` 插件，`baseNavigator: true` 自动检测浏览器语言，`useLocalStorage: true` 记住选择。顶部栏 🌐 下拉切换。

## 窗口模式

生产环境 `kiosk: true` 锁定系统；开发环境 `fullscreen` / `KIOSK_WINDOWED` 窗口化。

## 数据模型 (Prisma / MySQL)

| 模型 | 关键字段 |
|---|---|
| `Device` | id, name, location, status, appVersion, lastSeen |
| `Photo` | id, deviceId, filename, size, sha256, cosKey, publicUrl, status |
| `CommandLog` | deviceId, type, payload, issuedBy, ackedAt |
| `AdminUser` | username, passwordHash, role |
| `Release` | version, platform, arch, filename, size, sha512, cosKey, blockmapCosKey |

## Docker 部署

```bash
# 构建
docker build -f apps/cloud-server/Dockerfile -t photo-booth-server .

# 推送到腾讯云 CCR
bash scripts/docker-build-push.sh v1.0.0

# 运行
docker run --env-file apps/cloud-server/.env -p 4000:4000 photo-booth-server
```

## CI/CD

| 工作流 | 目标平台 |
|---|---|
| `.github/workflows/docker-publish-tencent.yml` | 腾讯云 CCR |
| `.github/workflows/docker-publish-aws.yml` | AWS ECR（amd64 + arm64） |

## 不在范围

多租户计费、AI、OTA 灰度发布。
