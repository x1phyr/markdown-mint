# 部署与运维

MarkdownMint 的生产目标是 Render。GitHub Pages 不再是项目的部署目标，也不再保留 Pages 工作流或静态站构建命令。

## 目标架构

Render 上创建两个服务：

1. `markdown-mint-web`：Node/Nuxt Web 服务，负责页面和用户交互；
2. `markdown-mint-renderer`：Docker Web 服务，内置 Chromium，负责 PDF/HTML 生成。

浏览器会直接调用 Renderer，因此 Renderer 必须有 HTTPS 公网地址；通过
`RENDERER_CORS_ORIGIN` 只允许 Web 服务来源。零成本预览部署会把 Renderer 的任务元数据、
PDF/HTML 和缩略图写入实例的临时文件系统，服务重启后数据会丢失。

Renderer 默认最多同时执行 2 个导出任务、最多排队 20 个（含执行中）。可用
`RENDERER_MAX_CONCURRENT` 与 `RENDERER_MAX_QUEUED` 调整。本地图片资产在 JSON API 中以
base64 字符串放在 `source.assets[].bytes`。生产环境建议设置
`RENDERER_ENFORCE_SAFE_CONFIG=1`（或依赖 `NODE_ENV=production`），强制显式 CORS 与下载签名密钥。

根目录的 [render.yaml](../render.yaml) 已声明这两个服务：Renderer 使用
`apps/renderer/Dockerfile`，Web 使用 Nuxt Node 运行时；两个服务默认部署在 Singapore，并且都明确
使用 `free` 计划。这样 Blueprint 不会因为省略 `plan` 而创建默认的付费 `starter` 实例，也不会创建
付费持久磁盘。免费实例会休眠、资源有限且文件系统不持久，只适合预览和试用，不应当作生产环境。

## Render 首次部署

1. 在 Render 中从仓库创建 Blueprint，使用根目录的 `render.yaml`；
2. 按首次创建提示填写 `NUXT_PUBLIC_RENDERER_URL` 和 `RENDERER_CORS_ORIGIN`；
3. 将 `NUXT_PUBLIC_RENDERER_URL` 设置为 Renderer 的 HTTPS 地址，例如
   `https://markdown-mint-renderer.onrender.com`；
4. 将 `RENDERER_CORS_ORIGIN` 设置为 Web 的 HTTPS 地址，例如
   `https://markdown-mint-web.onrender.com`；
5. 两个服务都通过 `/` 或 `/health` 健康检查后，再验证一次完整导出。

这两个变量在 Blueprint 中使用 `sync: false`，不会把域名或后续自定义域名写死在仓库里。
自定义域名启用后，必须同步更新这两个变量并重新部署 Web/Renderer。下载签名密钥由 Render
自动生成；不要把生产密钥提交到仓库。

`v1.0.0` canary 部署完成后，把 Web/Renderer URL、镜像 digest、runtime manifest SHA256、一次真实导出的
request ID/trace ID 和产物 hash 记录到 [发布记录](release-signoff.md#发布后跟进)，再启动
连续 72 小时观察窗口。

Render 的 Web 服务必须监听 `0.0.0.0`，本项目通过 `HOST=0.0.0.0` 和 `PORT=4310` 完成绑定；
Renderer 的 `/health` 是 Render 的 HTTP 健康检查路径。不要把 `PORT` 改成只绑定本机的端口。

## 本地先跑通

要求：Node.js `22.22.2`、pnpm `11.18.0`、Docker Desktop。

### 原生开发模式

```bash
corepack enable
pnpm install --frozen-lockfile
```

分别启动两个进程：

```bash
pnpm dev:renderer
pnpm dev:web
```

Web 默认请求 `http://127.0.0.1:4310`。如果只验证页面，不点击 PDF 生成，可以只启动 Web；要验证完整导出流程，两个进程都必须运行。

### 当前源码构建 Docker 并启动 Renderer

不要把旧的 `1.0.0-rc.1` 或过期的 release 镜像当作本地开发入口。使用仓库提供的 Compose，它会从当前源码构建
`markdown-mint-renderer:local`，创建本地数据卷，并注入可用的开发密钥：

```bash
pnpm docker:renderer:up
curl --fail http://127.0.0.1:4310/health
RENDERER_BASE_URL=http://127.0.0.1:4310 node scripts/renderer-api-smoke.mjs
```

停止服务：

```bash
pnpm docker:renderer:down
```

也可以只构建镜像：

```bash
pnpm docker:renderer:build
```

本地 Compose 使用 `deploy/renderer-local-compose.yml`；生产主机使用带只读根文件系统和资源限制的
`deploy/renderer-compose.yml`。两者不要混用，生产 Compose 的默认镜像是 Release 资产，不是本地 tag。

## 必需环境变量

Renderer 生产环境至少需要：

```text
HOST=0.0.0.0
PORT=4310
RENDERER_CORS_ORIGIN=https://<web-origin>
RENDERER_DOWNLOAD_SIGNING_SECRET=<至少 32 个随机字符>
RENDERER_DATA_DIR=/tmp/markdown-mint
```

`RENDERER_DOWNLOAD_SIGNING_TTL_SECONDS` 默认 300 秒；`RENDERER_RETENTION_MS` 默认 1 小时，
后台 sweep 默认每 60 秒清理过期任务。生产环境不要使用 `RENDERER_CORS_ORIGIN=*`，也不要依赖
未配置密钥时的无签名兼容模式。

Web 生产环境需要：

```text
NUXT_PUBLIC_RENDERER_URL=https://<renderer-origin>
```

## PDF 运行时

Node.js 运行时由 `.nvmrc`、根 `package.json` 的 engine 和 Renderer Docker 基镜像共同固定为
`22.22.2`。Renderer 镜像在构建阶段安装与 `playwright@1.62.1` 匹配的 Chromium、打印字体和
运行时许可清单；浏览器不可用时，任务会返回 `pdf-backend-unavailable`，不会静默生成 fallback PDF。

本地构建后可以执行：

```bash
PDF_SMOKE_OUTPUT=/tmp/markdown-mint-smoke.pdf \
PDF_SMOKE_THUMBNAIL_OUTPUT=/tmp/markdown-mint-smoke-thumbnail.png \
  pnpm --filter @markdown-mint/renderer smoke:pdf

pnpm --filter @markdown-mint/renderer smoke:pressure
PDF_COMPLEX_SMOKE_THEME=technical-mint \
  pnpm --filter @markdown-mint/renderer smoke:pdf:complex
```

视觉基线校验和多浏览器 Web smoke 仍由 CI/Release 执行；提交部署相关改动前至少运行：

```bash
pnpm check
pnpm build
```

## 数据与备份

Renderer 的 `RENDERER_DATA_DIR` 下包含 `jobs/`、`artifacts/` 和 `thumbnails/`。免费 Render 实例使用
临时文件系统，重启后这些内容会丢失，也不能按下面的方法做持久备份。升级到带持久磁盘的付费实例后，
将目录改为 `/var/lib/markdown-mint`；不要只备份产物目录，
因为恢复幂等键和任务状态需要 `jobs/` 元数据。仓库提供归档脚本：

```bash
docker run --rm \
  --volume markdown-mint-renderer-data:/var/lib/markdown-mint:ro \
  --volume "$PWD/backups:/backup" \
  markdown-mint-renderer:local \
  node apps/renderer/scripts/storage-backup.mjs create \
  --data-dir /var/lib/markdown-mint \
  --output /backup/renderer-data-<timestamp>.tgz

docker run --rm \
  --volume "$PWD/backups:/backup:ro" \
  markdown-mint-renderer:local \
  node apps/renderer/scripts/storage-backup.mjs verify \
  --archive /backup/renderer-data-<timestamp>.tgz
```

Render 持久磁盘只能用于付费实例，只能挂载到单个服务实例，不能与多实例扩容一起使用；升级前应确认
磁盘容量、备份、恢复和保留期策略。归档包含用户 Markdown 和上传资源，必须按生产数据处理。

## 镜像清理

只清理 MarkdownMint 自己的旧 tag，不要对整台机器执行无范围的 `docker system prune`：

```bash
docker image ls 'markdown-mint-renderer'
docker image rm markdown-mint-renderer:<old-tag>
```

删除前先确认没有容器引用该 tag。当前本地开发统一使用 `markdown-mint-renderer:local`；发布镜像
使用不可变的 Release digest，不要让生产部署跟随可变 `latest`。

## 回滚与故障处理

- Web 页面正常但生成失败：先访问 Renderer `/health`，再检查 `NUXT_PUBLIC_RENDERER_URL` 和
  `RENDERER_CORS_ORIGIN` 是否互相匹配；
- Render 报端口错误：确认服务监听 `0.0.0.0:4310`，没有把 `HOST` 设为 `127.0.0.1`；
- PDF 任务失败：检查 Chromium/字体安装、Renderer 内存、磁盘空间和任务错误码；
- 新版本异常：先回滚 Web 与 Renderer 到同一发布版本，再验证 `/health`、API smoke 和一个真实 PDF；
- 数据恢复：先停止 Renderer，校验归档清单和镜像版本，恢复后重新执行 API smoke。

完整的发布前演练见 [运维与发布演练](operations-drill.md)，常见问题见 [故障排查](troubleshooting.md)。
