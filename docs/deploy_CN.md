# 部署与 OTA 指南

本文档是打包、签名、OTA 发布与测试验证的唯一权威来源。

## 适用范围

- 发布产物统一通过管理中台「发布管理」页面上传。
- 不使用存储仓库内的上传脚本作为生产发布流程。
- 进行 OTA 验证时，确保基线版本与目标版本的签名策略一致。

## 前置条件

- Node.js 20+
- 仓库根目录已完成 `pnpm install`
- cloud-server 服务可访问
- 管理中台可访问且能登录
- `apps/cloud-server/.env` 中的 COS 配置已正确填写

## 构建目标

- macOS：zip，arm64
- Windows：zip，x64

构建目标配置位于 [apps/kiosk-client/package.json](../apps/kiosk-client/package.json)。

## Kiosk 打包与签名

以下命令均在 [apps/kiosk-client](../apps/kiosk-client) 目录下执行。

### 1) 一次性本地签名身份创建（macOS）

		pnpm run sign:create-local
		pnpm run sign:list

该步骤创建并导入本地自签名证书，用于可重复的本地 OTA 验证。

脚本参考：[apps/kiosk-client/scripts/create-local-signing-cert.sh](../apps/kiosk-client/scripts/create-local-signing-cert.sh)

### 2) 构建模式

- 默认签名构建：

			pnpm run dist

- 完整构建（带 native rebuild）：

			pnpm run dist:full

- Ad-hoc 构建（仅用于检查/下载调试，不支持自动安装）：

			pnpm run dist:adhoc

说明：

- `dist` 与 `dist:full` 通过 `CSC_NAME` 使用本地签名身份。
- `dist:adhoc` 与 `dist:full:adhoc` 强制使用 ad-hoc 签名。
- Hash 重命名由 [apps/kiosk-client/scripts/rename-with-hash.cjs](../apps/kiosk-client/scripts/rename-with-hash.cjs) 按版本精确执行，同名版本旧产物会被自动清理。

### 3) 当前 macOS 本地稳定性设置

当前本地 Mac 包在 [apps/kiosk-client/package.json](../apps/kiosk-client/package.json) 中通过 `mac.hardenedRuntime=false` 关闭了 hardened runtime。

原因：

- 本地自签名证书没有 Team ID。
- 开启 hardened runtime 时，dyld 库校验可能因 Team ID 不匹配而启动闪退。

生产环境建议：

- 使用 Apple Developer Team 签名身份。
- 重新启用 hardened runtime 与公证（notarization）。

## OTA 机制

- 前台通过 `/updates/latest-mac.yml` 或 `/updates/latest.yml` 检查更新元数据。
- 服务端根据已启用的发布记录动态生成 latest yml。
- 更新可用性首先基于远程元数据判断，而非仅依赖本地 `update.zip` 是否存在。
- 本地更新缓存（ShipIt 目录）在复用同一版本号时仍可能影响下载与安装行为。

代码参考：

- 更新器初始化与运行时行为：[apps/kiosk-client/src/main/updater.ts](../apps/kiosk-client/src/main/updater.ts)
- 安装能力判定与调度：[apps/kiosk-client/src/main/index.ts](../apps/kiosk-client/src/main/index.ts)
- 更新接口：[apps/cloud-server/src/routes/updates.ts](../apps/cloud-server/src/routes/updates.ts)

## 版本与产物规则

- 每次变更内容前必须递增版本号。
- 避免用同一版本号发布不同二进制内容。
- 每个版本号 + 平台 + 架构下只保留一份活跃产物。

[apps/kiosk-client/release](../apps/kiosk-client/release) 中的产物包括：

- `PhotoBoothKiosk-<version>-<arch>-<os>-<hash>.zip`
- `PhotoBoothKiosk-<version>-<arch>-<os>-<hash>.zip.blockmap`
- `latest-mac.yml` 或 `latest.yml`

## 通过管理中台手动发布

1. 登录管理中台。
2. 进入「发布管理」。
3. 创建新发布记录，填写版本、平台、架构、更新日志。
4. 上传 zip 产物。
5. 上传 blockmap 产物（如有）。
6. 提交发布记录。
7. 先保持目标版本禁用状态，测试通过后再启用。

实现参考：

- 界面：[apps/admin-dashboard/src/pages/releases.tsx](../apps/admin-dashboard/src/pages/releases.tsx)
- 发布接口：[apps/cloud-server/src/routes/releases.ts](../apps/cloud-server/src/routes/releases.ts)

## macOS 测试流程

1. 从基线版本 zip 中解压安装基线 App。
2. 确保该平台和架构下只有一个启用的目标版本记录。
3. 检查更新、下载、安装。
4. 重启后确认版本号已切换。

复用同一版本号后重新测试前，建议清缓存：

		rm -rf ~/Library/Caches/com.photo-booth.kiosk.ShipIt

若不确认缓存范围，可在 `~/Library/Caches` 下搜索 kiosk 相关目录，仅删除属于该应用的缓存。

## Windows 测试计划（推断，尚未实际验证）

本项目尚未完成 Windows 端到端 OTA 验证。建议首次测试按以下步骤：

1. 在 Windows 机器上构建 Windows 产物（`pnpm run dist`）。
2. 发布基线 1.0.0 win32-x64 发布记录，并安装基线 App。
3. 发布目标 1.0.1 win32-x64 发布记录（含 blockmap）。
4. 从 kiosk 管理面板触发更新检查与下载。
5. 验证安装与重启是否成功。
6. 检查重启后版本号及核心拍照流程。

Windows 重测前建议清缓存：

		Stop-Process -Name PhotoBoothKiosk -Force -ErrorAction SilentlyContinue
		Get-ChildItem "$env:LOCALAPPDATA" -Directory |
			Where-Object { $_.Name -match 'kiosk.*updater|updater.*kiosk' } |
			Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

需重点关注的风险：

- Windows 上 Electron 自动安装通常以 NSIS 目标最稳定。
- 本项目当前 Windows 目标为 zip，在确认自动安装前，应先验证 zip 目标下的安装行为。
- 若 Windows zip 自动安装不稳定，增加 NSIS 目标后再验证。

## 常见问题排查

- 更新检查成功但安装失败：
	- 确认基线版本与目标版本签名方式一致。
	- 确认平台与架构字段与实际运行环境匹配。
	- 确认每个 version-platform-arch 下仅有一份启用的产物。

- 客户端检测不到更新：
	- 确认发布记录已启用。
	- 确认目标版本号大于当前版本号。
	- 确认 latest yml 指向正确的产物。

- 未使用差分更新：
	- 确认 blockmap 已上传。
	- 确认 yml 元数据与发布记录一致。
