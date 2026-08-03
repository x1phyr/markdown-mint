# MarkdownMint

[![CI](https://github.com/x1phyr/markdown-mint/actions/workflows/ci.yml/badge.svg)](https://github.com/x1phyr/markdown-mint/actions/workflows/ci.yml)
[![Deploy Pages](https://github.com/x1phyr/markdown-mint/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/x1phyr/markdown-mint/actions/workflows/deploy-pages.yml)

在线预览：[x1phyr.github.io/markdown-mint](https://x1phyr.github.io/markdown-mint/)

> Turn finished Markdown into carefully designed PDF and standalone HTML documents.
>
> 将写好的 Markdown 铸造成适合交付、发布与归档的精美 PDF 和独立 HTML 文档。

MarkdownMint 是一个主题驱动的文档生成器。它不试图成为 Markdown 编辑器，而是专注于最后一公里：解析已经完成的 Markdown，应用专业排版主题，并稳定地导出最终成品。

项目当前为 **v1.0.0-rc.1 候选版**，尚未宣告稳定版；公开 API、主题协议和目录结构在 v1.0.0 前仍可能调整。

## v1.0 目标

- 上传或粘贴单个 Markdown 文档
- 支持 GFM、代码块、表格、图片、脚注、KaTeX 和 Mermaid
- 提供 Technical Mint、Minimal Report、Editorial Serif 三套首发主题
- 导出分页稳定的 PDF 和可离线打开的单文件 HTML
- 预先生成主题样张；用户只在点击生成时渲染完整文档
- 对不受信任输入进行资源限制、HTML 清理和隔离渲染
- 提供中文与英文排版、A4/Letter、封面、目录和页码

完整范围见 [产品定义](docs/product.md) 与 [v1.0 路线图](docs/roadmap-v1.md)。

## 仓库结构

```text
markdown-mint/
├── apps/
│   ├── web/                 # Nuxt Web 应用与主题展示站
│   └── renderer/            # 隔离的文档生成服务
├── packages/
│   ├── compiler/            # Markdown → 语义 HTML
│   ├── document-schema/     # 跨边界请求/结果协议
│   ├── html-exporter/       # 单文件 HTML 输出
│   ├── theme-sdk/           # 主题 Manifest 和作者协议
│   ├── theme-runtime/       # 主题装配与运行时
│   ├── themes/              # 官方主题
│   └── shared/              # 小型共享类型与工具
├── fixtures/                # 渲染、兼容性和压力测试文档
└── docs/                    # 产品、架构、路线图与协作规范
```

## 本地开发

要求：

- Node.js 22.22.2（通过 `.nvmrc` 与 workspace engine 固定）
- pnpm 11.18.0（通过 Corepack）

```bash
corepack enable
pnpm install
pnpm dev
```

常用命令：

| 命令                                                     | 用途                               |
| -------------------------------------------------------- | ---------------------------------- |
| `pnpm dev`                                               | 启动 Web 应用                      |
| `pnpm dev:renderer`                                      | 启动本地渲染器健康端点             |
| `pnpm build`                                             | 构建全部应用和包                   |
| `pnpm build:pages`                                       | 构建 GitHub Pages 静态站           |
| `pnpm test`                                              | 运行单元测试                       |
| `pnpm test:e2e:web`                                      | 运行已构建 Web 的浏览器 smoke      |
| `pnpm --filter @markdown-mint/renderer smoke:pressure`   | 运行 20 页 P95 与 100 页压力 smoke |
| `pnpm --filter @markdown-mint/renderer smoke:pdf:visual` | 校验固定 Chromium PDF 逐页视觉基线 |
| `pnpm typecheck`                                         | 运行全部 TypeScript 检查           |
| `pnpm lint`                                              | 运行 ESLint                        |
| `pnpm check`                                             | 执行提交前完整质量门禁             |

## 项目文档

- [产品定义与 v1.0 边界](docs/product.md)
- [系统架构](docs/architecture.md)
- [v1.0 开发路线图](docs/roadmap-v1.md)
- [主题开发规范](docs/theme-authoring.md)
- [开源软件工作流](docs/opensource-workflow.md)
- [部署与运维](docs/deployment.md)
- [格式参考](docs/format-reference.md)
- [隐私说明](docs/privacy.md)
- [服务条款（预发布草案）](docs/terms.md)
- [迁移说明](docs/migrations.md)
- [运维与发布演练](docs/operations-drill.md)
- [故障排查](docs/troubleshooting.md)
- [Beta 反馈模板](docs/beta-feedback.md)
- [威胁模型](docs/threat-model.md)
- [发布就绪清单](docs/release-readiness.md)
- [第三方许可清单](docs/third-party-licenses.md)
- [贡献指南](CONTRIBUTING.md)
- [安全策略](SECURITY.md)
- [治理模型](GOVERNANCE.md)

## 参与贡献

请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。非小型修复应先通过 Issue 对齐问题、范围和验收标准，再提交 Pull Request。

安全问题不要创建公开 Issue，请按 [SECURITY.md](SECURITY.md) 私下报告。

## License

Copyright 2026 MarkdownMint contributors.

Licensed under the [Apache License 2.0](LICENSE).
