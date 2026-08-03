# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
