# Deployment and OTA Guide

This document is the source of truth for packaging, signing, OTA publishing, and test validation.

## Scope

- Upload release artifacts manually in the admin dashboard Release Management page.
- Do not use repository upload scripts as production workflow.
- Keep signing strategy consistent across the baseline and target versions for OTA validation.

## Prerequisites

- Node.js 20+
- pnpm dependencies installed at repository root
- Cloud server reachable
- Admin dashboard reachable and login available
- COS configuration valid in apps/cloud-server/.env

## Build Targets

- macOS: zip, arm64
- Windows: zip, x64

Target configuration lives in [apps/kiosk-client/package.json](../apps/kiosk-client/package.json).

## Kiosk Packaging and Signing

Run commands in [apps/kiosk-client](../apps/kiosk-client).

### 1) One-time local signing identity setup on macOS

		pnpm run sign:create-local
		pnpm run sign:list

This creates and imports a local self-signed identity for repeatable local OTA validation.

Script reference: [apps/kiosk-client/scripts/create-local-signing-cert.sh](../apps/kiosk-client/scripts/create-local-signing-cert.sh)

### 2) Build modes

- Default signed build:

			pnpm run dist

- Full build with rebuild:

			pnpm run dist:full

- Ad-hoc build for check and download debugging only:

			pnpm run dist:adhoc

Notes:

- dist and dist:full use CSC_NAME with local signing identity.
- dist:adhoc and dist:full:adhoc force ad-hoc signing.
- Hash renaming is deterministic and version-targeted by [apps/kiosk-client/scripts/rename-with-hash.cjs](../apps/kiosk-client/scripts/rename-with-hash.cjs).

### 3) Current mac local stability setting

Current local mac package disables hardened runtime in [apps/kiosk-client/package.json](../apps/kiosk-client/package.json) via mac.hardenedRuntime=false.

Reason:

- Local self-signed identity has no Team ID.
- With hardened runtime enabled, dyld library validation may fail at launch with Team ID mismatch symptoms.

Production recommendation:

- Use Apple Developer Team signing identity.
- Re-enable hardened runtime and notarization.

## OTA Mechanism

- Kiosk checks update metadata from /updates/latest-mac.yml or /updates/latest.yml.
- Server dynamically generates latest yml from enabled release records.
- Update availability is determined by remote metadata first, not only by local update.zip existence.
- Local updater cache can still affect download and install behavior if same version number is reused.

Code reference:

- Updater init and runtime behavior: [apps/kiosk-client/src/main/updater.ts](../apps/kiosk-client/src/main/updater.ts)
- Install capability and scheduler: [apps/kiosk-client/src/main/index.ts](../apps/kiosk-client/src/main/index.ts)
- Update endpoints: [apps/cloud-server/src/routes/updates.ts](../apps/cloud-server/src/routes/updates.ts)

## Version and Artifact Rules

- Always bump version before publishing changed content.
- Avoid reusing the same version number for different binaries.
- Keep exactly one active artifact pair per version and platform-arch.

Artifacts in [apps/kiosk-client/release](../apps/kiosk-client/release):

- PhotoBoothKiosk-version-arch-os-hash.zip
- PhotoBoothKiosk-version-arch-os-hash.zip.blockmap
- latest-mac.yml or latest.yml

## Manual Release Publish via Admin

1. Log in to admin dashboard.
2. Open Release Management.
3. Create release record and fill version, platform, arch, release notes.
4. Upload zip artifact.
5. Upload blockmap artifact if available.
6. Submit release record.
7. Keep target version disabled until test passes, then enable.

Implementation reference:

- UI: [apps/admin-dashboard/src/pages/releases.tsx](../apps/admin-dashboard/src/pages/releases.tsx)
- Release API: [apps/cloud-server/src/routes/releases.ts](../apps/cloud-server/src/routes/releases.ts)

## macOS Test Flow

1. Install baseline app from baseline zip.
2. Ensure only one enabled target release exists for that platform and arch.
3. Check update, download, then install.
4. Confirm version after restart.

Recommended cleanup before retest when same version was reused:

		rm -rf ~/Library/Caches/com.photo-booth.kiosk.ShipIt

If uncertain, inspect updater-like cache folders under ~/Library/Caches and clear only kiosk-related ones.

## Windows Test Plan (inferred, not yet validated in this repo)

This project has not completed end-to-end Windows OTA validation yet. Suggested first-pass plan:

1. Build Windows artifacts on a Windows machine.
2. Publish baseline 1.0.0 win32-x64 release and install baseline app.
3. Publish target 1.0.1 win32-x64 release with blockmap.
4. Trigger update check and download from kiosk admin panel.
5. Validate whether install and restart complete successfully.
6. Verify post-restart version and core camera flow.

Recommended cache cleanup before retest on Windows:

		Stop-Process -Name PhotoBoothKiosk -Force -ErrorAction SilentlyContinue
		Get-ChildItem "$env:LOCALAPPDATA" -Directory |
			Where-Object { $_.Name -match 'kiosk.*updater|updater.*kiosk' } |
			Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

Important risk to verify:

- Electron auto-install on Windows is typically strongest with NSIS targets.
- This repo currently targets zip for Windows, so install behavior should be tested first before promising full automatic install.

If Windows auto-install is unstable with zip, add NSIS target and validate again.

## Troubleshooting

- Update check works but install fails:
	- Confirm signing mode is consistent between baseline and target versions.
	- Confirm platform and arch fields match actual runtime.
	- Confirm only one enabled artifact per version-platform-arch.

- Client does not detect update:
	- Confirm release is enabled.
	- Confirm target version is greater than current version.
	- Confirm latest yml points to intended artifact.

- Differential update not applied:
	- Confirm blockmap uploaded.
	- Confirm yml metadata and release record are consistent.
