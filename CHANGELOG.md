# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

暂无未发布变更。

## [1.0.0] - 2026-08-04

### Security

- Upgraded Nuxt from `4.4.7` to `4.5.1` and refreshed workspace overrides (`unctx@3.0.0`, `@nuxt/cli@3.37.0`) so the security release installs cleanly.

### Fixed

- Export HTTP requests now accept local image assets as base64 strings (matching persistence serialization), so the browser and JSON API can deliver binary assets end-to-end.
- Renderer admission control bounds concurrent and queued export jobs (`RENDERER_MAX_CONCURRENT`, `RENDERER_MAX_QUEUED`) and returns `503 capacity` when overloaded.
- Export timeouts and cancellations abort in-flight compilation and PDF rendering via `AbortSignal` instead of only flipping cooperative flags.
- Idempotency keys are bound to a request fingerprint; reusing a key with a different body returns `409 idempotency-conflict`.

### Changed

- `document-schema` remains the shared server-side wire contract for export requests and job payloads; the Web client encodes assets locally and avoids importing Zod so Nitro SSR does not collide with Zod's internal `process` helper.
- Web workflow modules split draft persistence, renderer client, i18n, and export helpers out of `app.vue`, and drafts now restore locale plus feature toggles.
- Oversized export bodies return HTTP `413`; production-like deployments can fail closed on unsafe CORS/signing via `RENDERER_ENFORCE_SAFE_CONFIG`.
- Stable release gates rely on automation and deploy evidence; five independent human signoff rows are no longer release blockers.
- Deferred Dependabot major bumps for TypeScript 6 and `@types/node` 26 until after `v1.0.0` (Node runtime remains `22.22.2`).

## [1.0.0-rc.1] - 2026-08-03

### Added

- Node.js 运行时统一固定为 22.22.2，并同步 `.nvmrc`、根 workspace engine 与 Renderer 容器基镜像，避免低于锁定依赖 engine 要求的运行时不兼容。
- External Vivliostyle PDF backend adapter with isolated workspaces, paged-media margin boxes, artifact validation, and progressive thumbnails; the AGPL CLI remains opt-in and is not bundled.
- Renderer trace IDs, structured JSON stage events, request correlation headers, and task workspace cleanup.
- Standalone HTML now inlines validated local image assets as data URLs, so downloaded documents remain usable offline.
- Optional `RENDERER_DATA_DIR` file storage with atomic task/artifact writes, restart recovery, idempotency restoration, and fail-closed checksum validation; the Compose deployment includes a dedicated data volume.
- Complex theme fixture PDF smoke and fixed Linux 144 DPI visual baselines now run the shared acceptance document with a controlled local image asset across all three launch themes in CI and Release.
- Renderer images now emit and verify a runtime manifest containing Playwright/Chromium revisions, executable SHA256 values, font package versions, and retained third-party notices.
- Renderer storage now has a manifest-checked tar backup/restore tool with path, symlink, duplicate-entry, and checksum validation; CI and Release run its recovery smoke.
- CI and Release now run the renderer unit suite inside the production image with no network, a read-only rootfs, `noexec` `/tmp`, read-only fixtures, and an explicitly executable temporary test directory.
- Added an RC release-signoff template covering automated evidence, cross-platform print review, owner approvals, rollback, and the 72-hour observation window.
- Initial pnpm monorepo with Web, renderer, compiler, schema, theme, and exporter boundaries.
- v1.0 product definition, architecture, roadmap, and open-source workflow.
- CI, security, contribution, governance, and release foundations.
- GitHub Pages static build, deployment workflow, and deployment runbook.
