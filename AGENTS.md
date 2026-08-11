# MarkdownMint Agent 指南

本文档是仓库级开发约定，适用于在项目中工作的 Agent 和贡献者。更具体的规则以目标目录中的文档、代码和测试为准；涉及安全、发布或架构的变更，还要检查 `SECURITY.md`、`docs/` 和 `CONTRIBUTING.md`。

## 项目概览

MarkdownMint 是一个 pnpm workspace 单仓库，将 Markdown 转换为 PDF 和独立 HTML。项目没有数据库，主要组成如下：

- `apps/web`：Nuxt 4 Web UI，负责导入、主题、配置、生成和结果页；默认开发端口 `3000`。
- `apps/renderer`：隔离的 Node HTTP 渲染服务；默认地址 `http://127.0.0.1:4310`，健康检查为 `/health`。
- `packages/compiler`：Markdown 解析、规范化、诊断和语义 HTML 编译。
- `packages/document-schema`：跨进程及持久化边界的数据协议和校验。
- `packages/theme-sdk`、`packages/theme-runtime`、`packages/themes`：主题接口、运行时和官方主题。
- `packages/html-exporter`：自包含 HTML 打包。
- `fixtures`：功能、兼容性和 PDF 视觉基线输入；`scripts`：E2E 与 renderer smoke 脚本；`docs`：架构、部署和运维文档。

核心原则是“一套内容模型，两种输出”：PDF 与 HTML 必须消费同一个编译结果。浏览器端不承担完整排版；Markdown、HTML、SVG、URL、远程资源、字体和渲染产物都必须视为不可信输入。

## 开发环境

### Node.js、nvm 与 pnpm

- 必须使用 `nvm` 管理项目 Node.js 版本。
- 根目录 `.nvmrc` 当前指定 `22.22.2`，`package.json` 的 `engines` 要求 Node `>=22.22.2`。
- 开始工作或运行项目命令前，在仓库根目录执行 `nvm use`；未安装时先执行 `nvm install`，再执行 `nvm use`。
- 禁止切换或修改全局默认 Node 版本。不要执行 `nvm alias default`，也不要通过系统包管理器替换全局 Node；不要把当前 shell 的全局 Node 版本当作项目配置。
- 如果非 login shell 中 `node --version` 不是 `v22.22.2`，优先重新执行 `nvm use`，不要修改全局配置。
- 必须使用 pnpm `11.18.0`，由 `package.json` 的 `packageManager` 和 Corepack 管理。可先执行 `corepack enable`。
- 依赖变更必须同步提交 `pnpm-lock.yaml`；干净环境使用 `pnpm install --frozen-lockfile`。

推荐初始化：

```bash
nvm use
corepack enable
pnpm install --frozen-lockfile
```

### 运行服务

两个开发服务应分别在长期运行的 shell（例如 tmux）中启动：

```bash
pnpm dev:renderer
pnpm dev:web
```

完整导出流程需要先启动 renderer；若 renderer 未运行，Web 会提示不可连接。PDF 导出还需要 Playwright Chromium 及 `fonts-liberation`、`fonts-wqy-zenhei`。若出现浏览器缺失，可执行：

```bash
pnpm --filter @markdown-mint/renderer exec playwright install --with-deps chromium
```

## 常用命令

在仓库根目录执行：

```bash
pnpm dev                 # 启动 Web
pnpm dev:renderer        # 启动 Renderer
pnpm build               # 构建全部 workspace 项目
pnpm lint                # ESLint
pnpm typecheck           # 全部 TypeScript 检查
pnpm test                # Vitest 单元测试
pnpm test:coverage       # 覆盖率测试
pnpm test:e2e:web        # Web 端到端 smoke
pnpm format              # Prettier 格式化
pnpm format:check        # 检查格式
pnpm check               # lint + typecheck + test + format:check
```

Renderer 的 `smoke:pdf`、`smoke:pressure` 等脚本位于 `apps/renderer`，通常需要先完成对应 workspace build。提交前运行 `pnpm check` 和 `pnpm build`，并按变更范围补跑 E2E、smoke 或视觉检查。

## 编码与架构约束

- 使用 TypeScript strict；不要引入未说明的 `any`。
- 外部输入必须在进入任务队列或跨边界传递前通过 schema 校验。
- 编译器负责内容结构，不负责主题视觉、HTTP 或任务管理；HTML exporter 不负责 PDF 分页。
- PDF 和 HTML 复用同一份语义编译结果，不建立两套内容编译管线。
- 主题必须通过 Manifest、能力声明、变量和分层 CSS 工作，不要复制模板绕过主题运行时。
- 只有至少两个边界实际需要时，才把代码放入 `packages/shared`。
- 用户可见行为、配置、错误、限制和协议变化必须同步更新文档；破坏性协议变化需要迁移说明和架构决策记录。
- 固定 Node、pnpm、Chromium、字体、主题和 fixture 版本；不要把时间戳或随机 ID 写入基准产物。

## 安全要求

- 默认不透传原始 HTML；HTML 和 SVG 使用允许列表清理。
- 远程资源只允许合规 HTTP(S)，阻止私网、回环、链路本地地址及重定向后的受限地址，防止 SSRF。
- 对资源数量、文件大小、总大小、像素数、解析时间和渲染时间设置硬限制。
- 防范 XSS、SVG/Mermaid 注入、路径穿越、压缩炸弹、无限布局、浏览器漏洞和产物泄露。
- 不在日志中记录文档正文、令牌、带查询参数的远程 URL 或产物内容。
- Renderer 任务使用独立临时目录和随机 ID；不要让渲染进程访问应用凭据、宿主文件系统或任意内网地址。
- 新增远程资源、用户字体、账户系统或权限边界前，先更新 `docs/threat-model.md` 并补充测试。
- 不提交密钥、真实用户文档、未脱敏日志或许可证不明确的素材。

## 测试与视觉变更

- 缺陷修复应添加一个在修复前失败的测试或 fixture。
- 主题变更至少验证中文、英文、PDF、HTML 和极端 fixture。
- PDF fixture 结合结构检查、像素 diff 和人工抽样验收；不要只凭单元测试判断排版正确。
- 视觉基线变化必须说明原因并审查生成的 PDF/PNG，不要为让 CI 通过而盲目更新基线。
- 默认生产 PDF 后端是固定版本的 Playwright Chromium。Vivliostyle 仅在显式配置并完成审计时启用，不能把 Chromium smoke 结果当作跨引擎保证。

## 修改与协作流程

- 开始前检查 `git status`，保留用户已有改动；不要重置、覆盖或删除无关文件。
- 遵循 `CONTRIBUTING.md`：大型功能、协议、安全边界和跨包重构先进行设计讨论。
- 变更保持单一目的，优先小范围、可审查的提交；提交信息使用 Conventional Commits。
- 分支名可使用 `feat/<issue>-<name>`、`fix/<issue>-<name>` 等形式。
- PR 应说明关联 Issue、实现范围、测试结果和风险；涉及视觉、性能或安全变化时附相应证据。
- 不要在没有明确需求时提交、推送、发布或修改外部系统。

## 文档入口

- `README.md`：安装、快速开始和常用命令。
- `CONTRIBUTING.md`：贡献流程与代码要求。
- `docs/architecture.md`：系统边界、内容管线、安全模型和包职责。
- `docs/theme-authoring.md`：主题开发规范。
- `docs/deployment.md`：部署、环境变量和生产运维。
- `docs/troubleshooting.md`：常见故障排查。
- `docs/threat-model.md`：威胁模型与安全控制。
- `docs/release-readiness.md`、`docs/release-signoff.md`：发布检查与签署记录。
