<div align="center">

# MarkdownMint

### 把写好的 Markdown，铸造成可以交付的文档

将 Markdown 稳定地导出为精美 PDF 与可离线打开的单文件 HTML。

[![CI](https://github.com/x1phyr/markdown-mint/actions/workflows/ci.yml/badge.svg)](https://github.com/x1phyr/markdown-mint/actions/workflows/ci.yml)
[![Release](https://img.shields.io/badge/status-v1.0.0-green.svg)](CHANGELOG.md)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

</div>

> MarkdownMint 不是另一个 Markdown 编辑器。
> 它专注于写作完成后的最后一公里：解析内容、应用主题、生成最终成品。

## 为什么是 MarkdownMint？

把内容和呈现分开，让文档交付变得可重复、可维护：

| 你提供                 | MarkdownMint 负责                   | 你得到               |
| ---------------------- | ----------------------------------- | -------------------- |
| 一份 Markdown          | 解析、排版与主题装配                | 专业 PDF             |
| 图片、表格、代码与公式 | 隔离渲染与资源处理                  | 单文件 HTML          |
| 同一份内容             | A4 / Letter、中英文排版、封面与目录 | 可归档、可分享的文档 |

## 当前能力

- **完整 Markdown 体验**：GFM、代码块、表格、图片、脚注、KaTeX 与 Mermaid
- **主题驱动排版**：Technical Mint、Minimal Report、Editorial Serif 三套官方主题
- **稳定导出**：分页稳定的 PDF，以及无需额外资源的 standalone HTML
- **文档级配置**：中文 / 英文、A4 / Letter、封面、目录与页码
- **更安全的渲染链路**：HTML 清理、资源限制与隔离的 Renderer 服务
- **更快的预览体验**：主题样张预先生成，完整文档只在点击生成时渲染

## 预览与部署

项目的部署目标是 [Render](docs/deployment.md)，由两个服务组成：

```text
┌──────────────┐       HTTPS        ┌──────────────────┐
│  Web / Nuxt  │ ─────────────────▶ │ Renderer / Chrome │
│  用户交互    │ ◀───────────────── │ PDF + HTML 生成  │
└──────────────┘                    └──────────────────┘
```

根目录的 [`render.yaml`](render.yaml) 已包含 Blueprint 配置。完整的部署步骤、环境变量和生产注意事项，见 [部署与运维](docs/deployment.md)。

## 快速开始

环境要求：Node.js `22.22.2`、pnpm `11.18.0`。版本已由 [`.nvmrc`](.nvmrc) 和 workspace engine 固定。

```bash
corepack enable
pnpm install --frozen-lockfile
```

启动本地 Web 与 Renderer（分别在两个终端执行）：

```bash
pnpm dev:renderer
pnpm dev:web
```

打开 Web 后即可开始体验。只查看页面时可以只启动 Web；要完整验证 PDF / HTML 导出，两项服务都需要运行。

### Docker Renderer

如果希望使用和生产更接近的 Chromium 环境：

```bash
pnpm docker:renderer:up
curl --fail http://127.0.0.1:4310/health
pnpm docker:renderer:down
```

## 常用命令

| 命令                | 用途                       |
| ------------------- | -------------------------- |
| `pnpm dev`          | 启动 Web 应用              |
| `pnpm build`        | 构建全部应用和包           |
| `pnpm test`         | 运行单元测试               |
| `pnpm test:e2e:web` | 运行 Web 浏览器 smoke 测试 |
| `pnpm typecheck`    | 运行 TypeScript 检查       |
| `pnpm lint`         | 运行 ESLint                |
| `pnpm check`        | 执行提交前完整质量门禁     |

## 仓库结构

```text
markdown-mint/
├── apps/
│   ├── web/                 # Nuxt Web 应用与主题展示站
│   └── renderer/            # 隔离的 PDF / HTML 生成服务
├── packages/
│   ├── compiler/            # Markdown → 语义 HTML
│   ├── document-schema/     # 跨边界请求 / 结果协议
│   ├── html-exporter/       # 单文件 HTML 输出
│   ├── theme-sdk/           # 主题 Manifest 与作者协议
│   ├── theme-runtime/       # 主题装配与运行时
│   ├── themes/              # 官方主题
│   └── shared/               # 共享类型与工具
├── fixtures/                # 渲染、兼容性与压力测试文档
└── docs/                    # 产品、架构、路线图与协作规范
```

## 文档导航

- [产品定义与 v1.0 边界](docs/product.md) · [系统架构](docs/architecture.md) · [v1.0 路线图](docs/roadmap-v1.md)
- [主题开发规范](docs/theme-authoring.md) · [格式参考](docs/format-reference.md) · [迁移说明](docs/migrations.md)
- [部署与运维](docs/deployment.md) · [故障排查](docs/troubleshooting.md) · [发布就绪清单](docs/release-readiness.md)
- [隐私说明](docs/privacy.md) · [安全策略](SECURITY.md) · [威胁模型](docs/threat-model.md)
- [贡献指南](CONTRIBUTING.md) · [治理模型](GOVERNANCE.md) · [第三方许可清单](docs/third-party-licenses.md)

## 项目状态

当前版本为 **v1.0.0**。公开 API、主题协议与目录结构按语义化版本演进；破坏性变更会进入新的主版本并附迁移说明。产品范围与后续计划见 [产品定义](docs/product.md) 和 [v1.0 路线图](docs/roadmap-v1.md)。

## 参与贡献

欢迎提交 Issue 和 Pull Request。开始之前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)；非小型修复建议先通过 Issue 对齐问题、范围和验收标准。

安全问题请不要创建公开 Issue，请按 [SECURITY.md](SECURITY.md) 私下报告。

## License

Copyright 2026 MarkdownMint contributors.

Licensed under the [Apache License 2.0](LICENSE).
