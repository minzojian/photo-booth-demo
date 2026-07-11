# Photo Booth — Architecture Reference

[中文版](PLAN_CN.md) | English

> Scope: Focused demo — not a full SaaS platform.

## What's Implemented

- **Kiosk** (Electron): Template photo booth → Canvas composite → Print → Result page → On-demand COS/S3 upload (QR download) → Admin panel (tasks/system/storage/OTA)
- **Admin** (Ant Design Pro): Admin login → Device management → Photo orders (CDN preview links) → Release management
- **Server** (Fastify): Device CRUD, remote commands, photo orders, admin auth, storage abstraction (COS/S3), Socket.IO real-time gateway
- **i18n**: Chinese/English with auto-detect (system locale) + manual toggle; admin dashboard uses UmiJS locale plugin
- **Docker**: Multi-stage Dockerfile for cloud-server; push scripts for Tencent Cloud CCR
- **CI/CD**: GitHub Actions workflows for Tencent CCR & AWS ECR

## Storage Platform Abstraction

```
Server StorageProvider                 Kiosk Uploader
┌──────────────────────┐          ┌──────────────────────┐
│ provider.ts (interface)│         │ interface.ts (interface)│
│ tencent-cos.ts (COS)   │──STS──▶ │ cos.ts (COS SDK)      │
│ aws-s3.ts (S3)         │         │ s3.ts (S3 SDK)        │
└──────────────────────┘          └──────────────────────┘
```

- Isomorphic interfaces on both ends, dispatched by `platform`
- Add a new platform: one implementation file each side
- COS secrets server-side only; kiosk receives STS temp credentials

## Upload Architecture

```
Kiosk ──① POST /sts ──▶ Server StorageProvider issues credentials
Kiosk ──② Platform SDK direct upload (built-in chunked resume)
        COS: sliceUploadFile | S3: @aws-sdk/lib-storage
Kiosk ──③ POST /photos (cosKey + publicUrl) ──▶ Create order
```

- Upload triggered on demand ("Generate QR to Download" button), not automatic
- No local file upload — all uploads go through COS/S3

## Kiosk SQLite State Machine

`upload_task`: `pending → uploading → completed/failed`
- Photo saved → pending → user triggers upload → delete local file, keep record
- Crash/offline restart → scan & resume

## Local Storage Cleanup

`photos/{date}/{orderId}/` directory structure. Retention configurable in admin panel (7/14/30 days). Auto-cleanup on startup + every 6 hours.

## i18n (Internationalization)

- **Kiosk**: `zh`/`en` stored in `AppSettings.language`. Default auto-detected via Electron's `app.getLocale()`. Language flags (🇨🇳/🇺🇸) at bottom-right corner.
- **Admin**: UmiJS `locale` plugin with `baseNavigator: true` (auto-detect browser language) + `useLocalStorage: true`. Toggle via 🌐 dropdown in top bar.

## Window Mode

Production: `kiosk: true` locks the system. Development: `fullscreen` / `KIOSK_WINDOWED` for windowed mode.

## Data Model (Prisma / MySQL)

| Model | Key Fields |
|---|---|
| `Device` | id, name, location, status, appVersion, lastSeen |
| `Photo` | id, deviceId, filename, size, sha256, cosKey, publicUrl, status |
| `CommandLog` | deviceId, type, payload, issuedBy, ackedAt |
| `AdminUser` | username, passwordHash, role |
| `Release` | version, platform, arch, filename, size, sha512, cosKey, blockmapCosKey |

## Docker Deployment

```bash
# Build
docker build -f apps/cloud-server/Dockerfile -t photo-booth-server .

# Push to Tencent Cloud CCR
bash scripts/docker-build-push.sh v1.0.0

# Run
docker run --env-file apps/cloud-server/.env -p 4000:4000 photo-booth-server
```

## CI/CD

| Workflow | Target |
|---|---|
| `.github/workflows/docker-publish-tencent.yml` | Tencent Cloud CCR |
| `.github/workflows/docker-publish-aws.yml` | AWS ECR (amd64 + arm64) |

## Out of Scope

Multi-tenancy billing, AI features, OTA canary releases.
