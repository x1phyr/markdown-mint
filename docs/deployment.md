# 部署与运维

MarkdownMint 的展示站通过 GitHub Actions 部署到 GitHub Pages。`main` 每次更新都会先执行独立的 CI，再由 Pages 工作流重新安装锁定依赖、生成 Nuxt 静态站并发布构建产物。

当前生产地址：<https://x1phyr.github.io/markdown-mint/>

当前候选 Renderer 镜像：`ghcr.io/x1phyr/markdown-mint-renderer:v1.0.0-rc.1`。正式部署时应把
`RENDERER_IMAGE` 固定为 Release 资产中记录的完整 digest，而不是跟随可变 tag。

## 部署链路

1. Pull Request 运行 `CI / quality` 和 `CI / build`；
2. 变更合并到 `main`；
3. `.github/workflows/deploy-pages.yml` 先构建 Web 依赖 workspace，再运行 `pnpm build:pages`；
4. Nuxt 使用 `github_pages` preset 预渲染站点；
5. `apps/web/.output/public` 上传为 Pages artifact；
6. GitHub 将 artifact 发布到 `github-pages` environment。

Pages 工作流从 `actions/configure-pages` 读取 `base_path`。因此项目页使用 `/markdown-mint/`，以后切换到自定义域名时则自动使用 `/`，不需要修改源码中的部署路径。

## 本地验证

普通生产构建：

```bash
pnpm build
```

模拟当前 GitHub 项目页：

```bash
NUXT_APP_BASE_URL=/markdown-mint/ pnpm build:pages
```

静态产物位于 `apps/web/.output/public`。提交部署相关变更前还应运行：

```bash
pnpm check
```

## Web 与 Renderer 连接

Web 三步流程通过 `NUXT_PUBLIC_RENDERER_URL` 指向 Renderer API。开发环境默认使用
`http://127.0.0.1:4310`，可以分别运行 `pnpm dev:renderer` 和 `pnpm dev:web`；独立部署时应将该
变量设置为 Renderer 的 HTTPS 地址，并在 Renderer 侧用 `RENDERER_CORS_ORIGIN` 限制允许的站点
来源。Renderer 默认允许跨域预检只是为了本地开发，生产环境不应保留 `*`。

生产 Renderer 还必须设置 `RENDERER_DOWNLOAD_SIGNING_SECRET`（至少 32 个随机字符），并可用
`RENDERER_DOWNLOAD_SIGNING_TTL_SECONDS` 调整短期链接有效期（默认 300 秒）。任务状态响应会在产物可用
时返回 `downloads.artifactUrl` 和可选的 `downloads.thumbnailUrl`；Web 使用这些链接下载，缺少、篡改或
过期签名会返回 `403 download_signature_invalid`。本地未设置密钥时保留无签名路径，便于开发；不要在生产
环境依赖该兼容模式。

生产 Renderer 还应设置 `RENDERER_DATA_DIR`，指向由部署环境加密、限权和备份的持久卷。该目录采用
`jobs/`、`artifacts/` 和 `thumbnails/` 三个子目录：任务 JSON 以原子替换保存，上传资源以 base64
保存在任务记录中，PDF/HTML 与首页 PNG 使用独立文件并在恢复时校验 sha256。容器重启后会恢复幂等键、
已完成产物和提交时尚未完成的任务；存储记录损坏或产物缺失时会拒绝恢复该记录，不会暴露不完整下载。
`RENDERER_RETENTION_MS` 到期时会删除这三类持久记录，生产备份策略应同时设置备份保留期。

## PDF 运行时

Node.js 运行时固定为 22.22.2，并由 `.nvmrc`、根 `package.json` 的 engine 和 Renderer Docker 基镜像共同约束；本地、CI 与容器应使用同一版本，避免低于锁定依赖 engine 要求的运行时差异。

Renderer 使用 `playwright@1.62.1` 的 Chromium 分页适配器。Docker 镜像在构建时安装与该版本
匹配的 Chromium；本地首次运行需要执行：

```bash
PLAYWRIGHT_BROWSERS_PATH=/private/tmp/markdown-mint-playwright \
  pnpm --filter @markdown-mint/renderer exec playwright install chromium
```

也可以用 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 指定经过审计的固定 Chromium。浏览器不可用时，
PDF 任务返回 `pdf-backend-unavailable`，不会静默生成最小 fallback PDF。`PLAYWRIGHT_NO_SANDBOX=1`
只允许在已经以非 root 用户运行、具备额外容器隔离的受控环境中使用。

构建后可运行可重复的长文分页 smoke：

```bash
PDF_SMOKE_OUTPUT=/tmp/markdown-mint-smoke.pdf \
PDF_SMOKE_THUMBNAIL_OUTPUT=/tmp/markdown-mint-smoke-thumbnail.png \
  pnpm --filter @markdown-mint/renderer smoke:pdf
pdfinfo /tmp/markdown-mint-smoke.pdf | rg '^(Pages|Page size|PDF version):'

PDF_VISUAL_INPUT=/tmp/markdown-mint-smoke.pdf \
  pnpm --filter @markdown-mint/renderer smoke:pdf:visual
```

运行发布前的 20 页 P95 与 100 页压力验收：

```bash
pnpm --filter @markdown-mint/renderer smoke:pressure
PDF_COMPLEX_SMOKE_THEME=technical-mint \
  pnpm --filter @markdown-mint/renderer smoke:pdf:complex
```

该命令默认执行 5 次 20 页基准（P95 不超过 15 秒）和 1 次 100 页 fixture；通过或返回明确
`timeout` 错误均会打印结构化结果，其他失败会使命令退出非零。

`smoke:pdf:complex` 直接使用 `fixtures/p5-themes.md`，注入测试用本地图片，并要求真实 PDF 至少两页、
首页 PNG 非空。CI/Release 会对三套首发主题执行它，并用对应的
`p8-pdf-complex-visual-baseline-*.json` 运行 `smoke:pdf:visual` 逐页校验 144 DPI 图像。该基线是固定
Linux 运行时的自动化证据，仍不替代跨平台人工打印验收。

要验证另外两套首发主题，可将 smoke 命令前加上 `PDF_SMOKE_THEME=minimal-report` 或
`PDF_SMOKE_THEME=editorial-serif`，并指定对应的 `PDF_VISUAL_BASELINE` 文件。

PDF 任务成功后，`artifact.thumbnail` 会描述同一 Chromium 打印页面的首页 PNG 预览，实际图片
通过 `GET /v1/exports/:id/thumbnail` 获取。缩略图和 PDF 共享任务的保留期、删除和幂等生命周期；
Web 结果页和主题详情页会在可用时展示它，但缩略图失败不会阻断 PDF 下载。

HTML 任务会把通过资源校验的本地上传图片直接内联为 `data:` URL；下载的单文件 HTML 不依赖
`assets/` 目录或外部网络。缺失、超限或不安全的图片仍会保留可见占位符和结构化诊断，不会静默
生成一个看似完整但缺图的文件。

### 可选 Vivliostyle 后端

仓库提供不把 AGPL 依赖打包进应用的外部 CLI 适配器。只有在完成许可证评审、固定 CLI/浏览器/字体
版本并准备对应视觉基线后，才应在受控环境显式启用：

```bash
PDF_BACKEND=vivliostyle \
VIVLIOSTYLE_BIN=/opt/vivliostyle/bin/vivliostyle \
VIVLIOSTYLE_BROWSER_EXECUTABLE=/opt/chromium/chrome \
  pnpm --filter @markdown-mint/renderer smoke:pdf
```

适配器使用 `vivliostyle build --single-doc --no-enable-static-serve`，把资源内联到临时工作区，
并在返回前检查退出码、PDF 页数和产物大小。默认 `PDF_BACKEND` 为空时仍使用固定 Chromium；
Vivliostyle CLI 不在 `pnpm-lock.yaml` 或生产镜像中，详见第三方许可清单。

### Renderer 容器本地验收

镜像构建时会安装与锁定 Playwright 版本匹配的 Chromium，并以非 root `node` 用户运行。容器内将
`HOST=0.0.0.0`，本地开发进程仍默认只监听 `127.0.0.1`；生产部署应同时设置明确的
`RENDERER_CORS_ORIGIN`、反向代理 TLS 和外部任务/产物保留策略。

每个任务会创建独立临时工作区；任务进入终态前会清理该目录，外部 PDF 后端也必须在自己的工作区
内读写文件。Renderer 按 `RENDERER_RETENTION_MS` 保留成功、失败和取消任务，并由后台 sweep（默认
`RENDERER_RETENTION_SWEEP_MS=60000`）自动清理 PDF、HTML 和缩略图；过期任务返回 `expired`，不能再下载。
Renderer API 响应包含 `x-request-id` 与任务 `traceId`，阶段日志以 JSON 行记录阶段、耗时、尝试次数和
标准错误码，不记录 Markdown 正文、令牌或远程资源查询参数。

镜像在构建阶段将 pnpm 11.18.0 预缓存到固定的 `COREPACK_HOME`，生产启动和受限测试不依赖运行时联网下载包。要复现 CI 的离线单元测试门禁，可执行：

```bash
docker run --rm \
  --network none \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=512m \
  --tmpfs /exec-tmp:rw,exec,nosuid,nodev,size=64m \
  --volume "$PWD/fixtures:/app/fixtures:ro" \
  --env VIVLIOSTYLE_TEST_EXEC_DIR=/exec-tmp \
  --entrypoint pnpm \
  markdown-mint-renderer:ci test
```

生产容器应使用 [deploy/renderer-compose.yml](../deploy/renderer-compose.yml) 中的安全基线：只读根
文件系统、仅给 `/tmp` 和数据卷可写层、`cap_drop: ALL`、`no-new-privileges`、非 root `node` 用户、
进程/内存/CPU 上限、显式 CORS 来源和必需的下载签名密钥。不要为了让 Chromium 工作而去掉这些限制；
必要的浏览器临时文件必须写入 `/tmp`。

候选镜像部署前先注入生产环境变量，再执行：

```bash
export RENDERER_IMAGE=ghcr.io/x1phyr/markdown-mint-renderer@sha256:<release-digest>
export RENDERER_CORS_ORIGIN=https://<your-web-origin>
export RENDERER_DOWNLOAD_SIGNING_SECRET='<至少 32 个随机字符>'
docker compose --file deploy/renderer-compose.yml pull
docker compose --file deploy/renderer-compose.yml up --detach
```

本仓库没有托管 Renderer 的生产主机；上面的命令是部署方在具备持久卷、TLS 反向代理、密钥托管和
备份权限的主机上执行的最后一步。

```bash
docker build --file apps/renderer/Dockerfile --tag markdown-mint-renderer:ci .
docker run --rm \
  --read-only --tmpfs /tmp:rw,noexec,nosuid,nodev,size=512m \
  --cap-drop=ALL --security-opt=no-new-privileges \
  --memory=1g --cpus=2 --pids-limit=256 \
  --publish 127.0.0.1:4310:4310 \
  --volume markdown-mint-renderer-data:/var/lib/markdown-mint \
  -e RENDERER_CORS_ORIGIN=http://127.0.0.1:3000 \
  -e RENDERER_DATA_DIR=/var/lib/markdown-mint \
  -e RENDERER_DOWNLOAD_SIGNING_SECRET="$RENDERER_DOWNLOAD_SIGNING_SECRET" \
  markdown-mint-renderer:ci
curl --fail http://127.0.0.1:4310/health
RENDERER_BASE_URL=http://127.0.0.1:4310 node scripts/renderer-api-smoke.mjs
```

备份应在停止写入或使用文件系统快照后，整体复制数据卷；不要只备份 `artifacts/`，因为恢复幂等和
重试需要同一份 `jobs/` 元数据。仓库提供的脚本会只收集 `jobs/`、`artifacts/`、`thumbnails/`，生成
带文件大小和 SHA256 清单的 gzip tar，并在恢复前拒绝路径穿越、重复项、软链接和校验不匹配：

```bash
mkdir -p backups
docker run --rm \
  --volume markdown-mint-renderer-data:/var/lib/markdown-mint:ro \
  --volume "$PWD/backups:/backup" \
  markdown-mint-renderer:ci \
  node apps/renderer/scripts/storage-backup.mjs create \
  --data-dir /var/lib/markdown-mint \
  --output /backup/renderer-data-$(date -u +%Y%m%dT%H%M%SZ).tgz

docker run --rm \
  --volume "$PWD/backups:/backup:ro" \
  markdown-mint-renderer:ci \
  node apps/renderer/scripts/storage-backup.mjs verify \
  --archive /backup/renderer-data-<timestamp>.tgz
```

恢复前先停止 Renderer，校验备份清单和镜像版本，再将归档恢复回同一数据卷；目标非空时必须显式使用
`--force`，脚本仍会拒绝删除数据卷中的未知项：

```bash
docker run --rm \
  --volume markdown-mint-renderer-data:/var/lib/markdown-mint \
  --volume "$PWD/backups:/backup:ro" \
  markdown-mint-renderer:ci \
  node apps/renderer/scripts/storage-backup.mjs restore \
  --archive /backup/renderer-data-<timestamp>.tgz \
  --data-dir /var/lib/markdown-mint \
  --force
```

恢复后运行 `/health`、`renderer-api-smoke.mjs`，并验证一个已知幂等键的任务状态与下载校验和。
备份归档包含用户提交正文和上传资源，必须遵循与生产数据相同的加密、访问控制和删除策略。

CI 还会用 Trivy 扫描该镜像的 `CRITICAL,HIGH` OS 与 library 漏洞；镜像构建和容器 API smoke
现在会同时验证真实 PDF/缩略图、请求追踪和签名下载；通过不替代该 hosted CI 门禁。

Web 生产构建的浏览器 smoke：

```bash
pnpm build
E2E_BROWSER=chromium pnpm test:e2e:web
E2E_BROWSER=firefox pnpm test:e2e:web
E2E_BROWSER=webkit pnpm test:e2e:web
```

该 smoke 同时运行 `@axe-core/playwright` 的 WCAG 自动审计；本地若把浏览器下载到临时目录，
需为上述命令补充同一个 `PLAYWRIGHT_BROWSERS_PATH`。

## 手动部署

在 GitHub 仓库的 **Actions → Deploy Pages → Run workflow** 中从 `main` 手动触发。手动部署仍使用当前 `main` 的锁文件和源码，不接受任意上传文件。

## 首次启用与权限

仓库的 **Settings → Pages → Build and deployment → Source** 应设置为 **GitHub Actions**。工作流仅授予以下权限：

- `contents: read`：读取仓库；
- `pages: write`：创建 Pages deployment；
- `id-token: write`：用 OIDC 证明部署来源。

生产环境名固定为 `github-pages`。项目进入多人维护后，应给该 environment 增加仅允许 `main` 部署的规则，并让 `main` 的分支保护要求 CI 通过。

## 自定义域名

1. 在 **Settings → Pages → Custom domain** 填写域名；
2. 按 GitHub 提示配置 DNS；
3. 验证 DNS 后启用 **Enforce HTTPS**；
4. 重新运行 Deploy Pages，并检查首页、favicon、锚点和静态资源。

不要在仓库中提交 DNS 服务商密钥。自定义域名启用后，工作流会从 Pages 配置自动取得根路径。

## 回滚与故障处理

- 构建失败：修复后重新运行失败任务，不要手工修改 Pages artifact；
- 新版本页面异常：revert 引入问题的合并提交，由 `main` 的新提交触发回滚部署；
- Pages 部署失败但 CI 通过：检查 `github-pages` environment、Pages Source 和工作流权限；
- 线上返回 404：确认访问地址带有 `/markdown-mint/`，并检查 Pages 是否已启用；
- 样式或脚本 404：本地用项目页 base path 重建，并检查输出 HTML 中的资源 URL。

每次生产发布后至少检查首页状态码、首屏样式、站内锚点和浏览器控制台。部署记录与 artifact 由 GitHub Actions 保存，仓库不提交 `.output`。
