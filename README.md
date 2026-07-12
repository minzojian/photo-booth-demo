# 📸 Photo Booth — Self-Service Photo Kiosk

[中文文档](README_CN.md) | English

A three-tier pnpm monorepo: Electron kiosk captures & composites photos → direct COS/S3 upload → admin dashboard to review orders.

## Project Structure

```
photo_booth_demo/
├── apps/
│   ├── kiosk-client/        # Kiosk frontend (Electron + React + SQLite)
│   │   ├── src/main/         #   Main process: capture, upload queue, system status, OTA updates
│   │   │   └── uploader/     #     Platform uploaders (interface / cos / s3)
│   │   ├── src/renderer/     #   Renderer: booth UI, Canvas compositing, sticker editor, QR code
│   │   ├── src/preload/      #   IPC bridge (contextBridge)
│   │   └── resources/templates/ #   Template assets: {1,2,4}/1.json + 1.webp
│   ├── admin-dashboard/      # Admin panel (Ant Design Pro)
│   │   └── src/pages/        #   login / devices / orders / admins
│   └── cloud-server/         # Cloud backend (Fastify + Drizzle ORM + Socket.IO)
│       ├── src/routes/       #   auth / devices / photos / sts / adminUsers / releases
│       ├── src/db/           #   Drizzle schema
│       ├── src/realtime/     #   Socket.IO device gateway
│       ├── src/storage/      #   Storage abstraction (provider interface + tencent-cos + aws-s3)
│       └── Dockerfile        #   Docker image definition
├── packages/shared/          # Shared TypeScript types (device / protocol / upload)
└── docs/PLAN.md
```

> **Note**: The admin dashboard's `base` / `publicPath` is environment-aware in `.umirc.ts`: `/` in dev, hardcoded to `/projects/photo_booth/admin/` in production. If `KEY_PREFIX` changes, update `.umirc.ts`.

## ✨ Key Features

### 📸 Photo Booth Core
- **Multi-template**: 1 / 2 / 4 shot templates, extensible JSON config
- **Canvas compositing**: Cover-crop photos + frame overlay + drag-and-drop stickers
- **Countdown + flash simulation**: Professional kiosk experience
- **Print first, upload later**: Non-blocking flow, QR scan-to-download on demand

### 🔄 Auto OTA Updates
- **Delta updates via electron-updater**: `.blockmap` diff downloads only changed blocks
- **Release management**: Centralized upload, registration, enable/disable via admin panel
- **Multi-platform**: macOS / Windows / Linux × arm64 / x64 independently managed

### 🖥️ Remote Device Control
- **Real-time heartbeat**: 5s intervals, cloud auto-detects online/offline
- **Remote commands**: LOCK / UNLOCK / REBOOT / SHUTDOWN with audit logging
- **Live dashboard**: Device status, pending uploads, capture counts at a glance

### 🌐 i18n
- **zh-CN / en-US**: Both admin and kiosk support bilingual switching
- **Auto-detection**: Browser language detection via Umi locale plugin

### 📦 Storage Abstraction
- **Isomorphic interface**: Server (STS credentials) + client (direct upload) share interface definitions
- **Multi-provider**: Tencent COS + AWS S3 implemented; new providers = one file each
- **Resumable upload**: COS `sliceUploadFile` / S3 `@aws-sdk/lib-storage` with chunked resume

### 🗄️ Lightweight ORM (Drizzle)
- **Zero runtime overhead**: Pure TypeScript schema + mysql2 driver, no native engine
- **No code generation**: No more `prisma generate` — schema is code

## Screenshots

### Admin Dashboard

| Device Management | Release Management |
|----------|----------|
| ![Devices](docs/jpg/1_zh.jpg) | ![Releases](docs/jpg/3_zh.jpg) |

| Orders |
|----------|
| ![Orders](docs/jpg/2_zh.jpg) |

### Kiosk Terminal

| Capture | Template Select |
|----------|----------|
| ![Capture](docs/jpg/client_1_en.jpg) | ![Template](docs/jpg/client_2_en.jpg) |

| Sticker Editor | Preview | Admin Panel |
|----------|----------|----------|
| ![Stickers](docs/jpg/client_3_en.jpg) | ![Preview](docs/jpg/client_4_en.jpg) | ![Admin](docs/jpg/client_6_en.jpg) |

| Scan to Download |
|------------------|
| ![Scan](docs/jpg/client_5_en.jpg) |

| Incremental Update |
|--------------------|
| ![Incremental Update](docs/jpg/client_7_en.jpg) |

## Download (Test Builds)

| Platform | Arch | Version | Download |
|----------|------|---------|----------|
| macOS | ARM64 (Apple Silicon) | 1.0.0 | [PhotoBoothKiosk-1.0.0-arm64-mac.zip](https://static.lunastudio.cn/projects/photo_booth/updates/PhotoBoothKiosk-1.0.0-arm64-mac-30bba76a.zip) |
| Windows | x64 (Intel/AMD) | 1.0.0 | [PhotoBoothKiosk-1.0.0-win.zip](https://static.lunastudio.cn/projects/photo_booth/updates/PhotoBoothKiosk-1.0.0-win-80cb814f.zip) |

## Tech Stack

| Tier | Stack |
|---|---|
| **Kiosk** | Electron 33 + electron-vite + React 18 + better-sqlite3 + socket.io-client + COS SDK + S3 SDK |
| **Admin** | Ant Design Pro (UmiJS 4) |
| **Server** | Fastify 5 + Drizzle ORM (MySQL) + Socket.IO + qcloud-cos-sts + JWT |

## Core Flow

### Shoot → Composite → Print → Scan to Download

```
Select template (1/2/4 shots) → Shoot each photo (countdown → flash → freeze, user confirms)
  → Post-editing → sticker decoration
  → composeWithTemplate() Canvas compositing
     (template background + photo cover-fitted to frame + frame layer + stickers)
  → Print → Result page
  → User taps "Generate QR to Download" → triggers upload to COS/S3
  → QR code displayed → scan to view photo
```

- Print first; upload on demand — kiosk stays responsive
- QR code points to CDN public URL

### Storage Platform Abstraction

Server and kiosk each define isomorphic interfaces, dispatched by `platform` field:

```
Server StorageProvider (credential issuer)    Kiosk Uploader (direct upload)
┌─────────────────────────┐          ┌─────────────────────────┐
│ provider.ts (interface)  │          │ interface.ts (interface) │
│ tencent-cos.ts (COS STS) │ ──STS──▶ │ cos.ts (sliceUploadFile) │
│ aws-s3.ts (S3 STS)       │          │ s3.ts (@aws-sdk)         │
└─────────────────────────┘          └─────────────────────────┘
```

Adding a new platform requires only one implementation file on each side — no core flow changes.

> **Admin uploader**: `apps/admin-dashboard/src/uploader/` is isomorphic.
> Currently active: `tencent-cos`. S3 is implemented but commented out (`s3.ts`) — uncomment in `index.ts` to switch.

### Upload Architecture

```
Kiosk ──① POST /sts ──▶ Server StorageProvider ──issues STS temp credentials──▶ Kiosk
        (scoped to ${KEY_PREFIX}photos/{deviceId}/*)
Kiosk ──② Platform SDK direct upload (built-in chunked resume)
        COS: sliceUploadFile | S3: @aws-sdk/lib-storage
Kiosk ──③ POST /photos (cosKey + publicUrl) ──▶ Creates order, visible in admin + CDN preview
```

## Deployment & Release

Release workflow (packaging, signing, OTA, and admin manual upload) has moved to:

- [docs/deploy.md](docs/deploy.md)

README keeps only a summary to avoid stale or conflicting release steps.

### Template System

Each template under `apps/kiosk-client/resources/templates/{shotCount}/` = JSON + image:

- **JSON**: `name`, `shotCount`, `frames[]` (0~1 proportional coordinates on background)
- **WebP**: decorated template background with frame overlay

Compositing: draw each photo → cover-fill frame → template overlay → stickers. Output size = template image original dimensions.

### Local Storage & Cleanup

Photos stored under `{userData}/photos/{date}/{orderId}/`. Retention configurable in admin:

- **7 days** (default) / 14 days / 1 month
- Auto-clean on startup + every 6 hours
- Settings persisted to `settings.json`

### Kiosk SQLite State Machine

`upload_task` table (`pending` → `uploading` → `completed`/`failed`):
- Photo captured → `pending` → upload progress persisted
- Upload triggered on demand (QR download button), not automatic
- Crash/offline restart → auto-scan & resume
- On success: delete local file, retain task record

## Data Model (MySQL)

| Table | Fields |
|---|---|
| `AdminUser` | username, passwordHash, role |
| `Device` | id, name, location, status, appVersion, lastSeen |
| `Photo` | id, deviceId, filename, size, sha256, cosKey, publicUrl, status |
| `CommandLog` | deviceId, type, issuedBy, ackedAt |
| `Release` | version, platform, arch, filename, size, sha512, cosKey, blockmapCosKey |

## Quick Start

```bash
pnpm install

# 1) Server (:4000)
cd apps/cloud-server
cp .env.example .env
# Edit .env: fill in MySQL DATABASE_URL and COS credentials
pnpm db:push      # Sync schema to database
pnpm db:setup     # Seed data (admin/admin123)
pnpm dev

# 2) Admin (:8000) — admin / admin123
cd apps/admin-dashboard && pnpm dev

# 3) Kiosk (Electron)
cd apps/kiosk-client
pnpm rebuild:native    # First time: rebuild better-sqlite3 for Electron ABI
pnpm dev

# Admin panel: press Cmd+Shift+A (macOS) / Ctrl+Shift+A (Windows) or tap the
# top-right corner 5 times within 3s on the capture screen to open PIN prompt.
# Default PIN: 8888 (override via KIOSK_ADMIN_PIN env var).
# Or start in windowed mode for development:
KIOSK_WINDOWED=1 pnpm dev
```

## Environment Variables (cloud-server)

See [`.env.example`](apps/cloud-server/.env.example) for all available variables.

```env
DATABASE_URL=mysql://root:pass1234@127.0.0.1:3306/photo_booth
# Tencent Cloud COS
COS_SECRET_ID=
COS_SECRET_KEY=
COS_BUCKET=
COS_REGION=ap-chengdu
# AWS S3 (alternative)
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_BUCKET=
S3_REGION=
# Object key prefix (must end with /)
KEY_PREFIX=projects/photo_booth/
# STS credential duration (seconds)
STS_DURATION=1800
CDN_BASE=
JWT_SECRET=
```

## Docker Deployment

### Build Image

```bash
docker build -f apps/cloud-server/Dockerfile -t photo-booth-server .
```

### Run Container

```bash
docker run --env-file apps/cloud-server/.env -p 4000:4000 photo-booth-server
```

## API Overview

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/login` | - | Login, get JWT |
| GET/POST | `/admin/users` | JWT | Admin user management |
| GET/POST | `/devices` | JWT | Device management |
| POST | `/devices/:id/commands` | JWT | Send LOCK/UNLOCK command |
| GET | `/photos` | JWT | Order list (with `previewUrl`) |
| POST | `/photos` | - | Kiosk creates order |
| POST | `/sts` | - | Issue upload credentials (photos) |
| POST | `/sts/admin` | JWT | Issue upload credentials (admin, e.g. releases) |
| GET/POST/DELETE | `/releases` | JWT | Release management |
| GET | `/updates/latest-mac.yml` | - | macOS update check (dynamic) |
| GET | `/updates/latest.yml` | - | Windows update check |
| GET | `/updates/latest-linux.yml` | - | Linux update check |
| GET | `/health` | - | Health check |
| WS | socket.io | - | register/heartbeat/command_ack ↔ command |

## Verified

- `packages/shared`, `cloud-server`, `admin-dashboard`, `kiosk-client`: **typecheck passes**.
- `admin-dashboard`, `kiosk-client`: **production builds pass**.
- cloud-server: curl coverage for auth (401/400), device CRUD, commands, orders, STS, admin.
- **Resumable upload tested**: mock engine interrupt @50% → HEAD align → 409 replay protection → resume → sha256 verify → create order.
- **Kiosk upload tested** (`processTask`): simulated crash @250KB → restart resume to 700KB → delete local file → order visible in admin.
- **Command tested** (`Realtime`): kiosk online (heartbeat/pending count) → admin sends LOCK → kiosk receives → ACK logged.

## Out of Scope

Multi-tenancy billing, AI features, OTA canary (removed from initial scaffolding). Print functionality includes printer detection and test-print hooks; actual thermal/inkjet printer integration is deployment-level implementation.

## Collaborate

Interested in this project? Add me on WeChat:minzojian   
or   
email: minzojian@hotmail.com

![WeChat](docs/jpg/wechat.jpg)
