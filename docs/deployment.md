# 部署与运维

MarkdownMint 的展示站通过 GitHub Actions 部署到 GitHub Pages。`main` 每次更新都会先执行独立的 CI，再由 Pages 工作流重新安装锁定依赖、生成 Nuxt 静态站并发布构建产物。

当前生产地址：<https://x1phyr.github.io/markdown-mint/>

## 部署链路

1. Pull Request 运行 `CI / quality` 和 `CI / build`；
2. 变更合并到 `main`；
3. `.github/workflows/deploy-pages.yml` 运行 `pnpm build:pages`；
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
