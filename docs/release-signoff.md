# RC 发布签字单：v1.0.0-rc.1

本记录对应 `v1.0.0-rc.1` 候选版。稳定版门禁以自动化证据（CI、视觉 diff、扫描、容器 smoke）和可验证的部署记录为准；不再要求排版/打印、安全、隐私/法务、无障碍、运维五项独立人工签字。

正式创建 `v1.0.0-rc.n` 或 `v1.0.0` 时，应复制本文件，替换版本、镜像 digest、运行时清单和观察窗口。本文件是发布记录，不替代 CI、视觉 diff、扫描或部署验证。

## 版本信息

| 项目                    | 当前候选值                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 版本 / tag              | `v1.0.0-rc.1`（候选 prerelease）                                                                                                      |
| Git commit              | [`ac7d35853f5a5b02abed19ac32c0bfd943721829`](https://github.com/x1phyr/markdown-mint/commit/ac7d35853f5a5b02abed19ac32c0bfd943721829) |
| Renderer image          | `ghcr.io/x1phyr/markdown-mint-renderer:v1.0.0-rc.1`；digest `sha256:e96eb6351bd807e70f001f4a10c9b1727c0f2069ff4931e3b9dd004a84723563` |
| runtime manifest SHA256 | `sha256:ff7827a41421b553f52af90a1b759ad61ecf264ff8cb2c849cb246f8827814a1`（Release asset 中的清单文件）                               |
| RC 观察窗口             | 未开始；release tag 对应的生产 canary 完成后连续观察 72 小时                                                                          |
| 发布负责人              | `x1phyr / MarkdownMint 维护者`（最终签字人）                                                                                          |

## 证据索引

| 编号 | 证据                                                                                                                                                                                                                               |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1   | [PR #6 合并](https://github.com/x1phyr/markdown-mint/pull/6)；[main CI](https://github.com/x1phyr/markdown-mint/actions/runs/30816428657)；[v1.0.0-rc.1 Release](https://github.com/x1phyr/markdown-mint/actions/runs/30816589380) |
| E2   | [main CI：quality、lint、typecheck、测试、format、audit 与 storage smoke](https://github.com/x1phyr/markdown-mint/actions/runs/30816428657)                                                                                        |
| E3   | [main CI：全 workspace build](https://github.com/x1phyr/markdown-mint/actions/runs/30816428657)                                                                                                                                    |
| E4   | [main CodeQL](https://github.com/x1phyr/markdown-mint/actions/runs/30816428603)；[tag CodeQL](https://github.com/x1phyr/markdown-mint/actions/runs/30816586276)                                                                    |
| E5   | [Release verify-and-release：受限运行、API smoke、manifest、Trivy 与 GHCR 发布](https://github.com/x1phyr/markdown-mint/actions/runs/30816589380/job/91695756447)                                                                  |
| E6   | [Release verify-and-release：三套标准与 complex fixture PDF](https://github.com/x1phyr/markdown-mint/actions/runs/30816589380/job/91695756447)                                                                                     |
| E7   | [Release verify-and-release：renderer pressure smoke](https://github.com/x1phyr/markdown-mint/actions/runs/30816589380/job/91695756447)                                                                                            |
| E8   | [Release verify-and-release：Chromium、Firefox、WebKit E2E 与 axe](https://github.com/x1phyr/markdown-mint/actions/runs/30816589380/job/91695756447)                                                                               |

## 自动化门禁

| 门禁                                   | 证据链接 / artifact                                                                                           | 结果     |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------- |
| `pnpm check`、`pnpm build`             | E2、E3；quality 分步覆盖 lint/typecheck/test/format，build job 覆盖全 workspace build                         | ☑ 通过   |
| 依赖审计、Trivy、CodeQL                | E2、E4、E5；Trivy 的 CRITICAL/HIGH 阻断扫描通过                                                               | ☑ 通过   |
| Chromium / Firefox / WebKit E2E 与 axe | E8；三套浏览器 job 均通过                                                                                     | ☑ 通过   |
| 三套标准与复杂 fixture PDF 视觉回归    | E6；每套主题均包含标准与 complex fixture 视觉校验                                                             | ☑ 通过   |
| 真实容器 PDF、缩略图、签名下载与 tmpfs | E5；API smoke 返回 PDF、thumbnail、signed download，512 MiB noexec tmpfs 容量校验通过                         | ☑ 通过   |
| 存储重启恢复、备份归档与恢复 smoke     | E2；quality job 已执行 storage recovery 与 backup smoke                                                       | ☑ 通过   |
| 运行时 manifest、字体和第三方 notices  | E5；Node 22.22.2、Playwright 1.62.1、字体版本和 notices 已校验                                                | ☑ 通过   |
| Render 部署（新目标）                  | [render.yaml](../render.yaml)；Web + Renderer 的本地构建、健康检查和真实导出已通过，线上 Blueprint 部署待执行 | ◐ 待部署 |

补充的本地镜像验证：18 个测试文件、116 个测试通过；无网络、只读根文件系统、`/tmp` noexec、非 root、`cap-drop=ALL`、API smoke 和精确 512 MiB tmpfs 均通过。该验证用于复核，不替代 E5 的 hosted CI 结果。

排版质量、安全扫描、无障碍 axe、隐私/许可文档与运维契约分别由视觉回归、CodeQL/Trivy/`pnpm audit`、三浏览器 E2E、仓库内条款/许可清单，以及部署手册与自动化 smoke 覆盖；维护者不再把五项独立人工签字列为稳定版阻塞项。

## 下一步行动清单

把当前 RC 关闭到稳定版 `v1.0.0` 时，按下面顺序留下可核对的部署与自动化证据即可。

1. **执行 Render Blueprint canary。** 按
   [部署与运维](deployment.md#render-首次部署) 使用根目录 [render.yaml](../render.yaml) 创建或更新
   Web + Renderer 服务，确认 `NUXT_PUBLIC_RENDERER_URL`、`RENDERER_CORS_ORIGIN` 和
   `RENDERER_DOWNLOAD_SIGNING_SECRET` 均来自部署环境；记录服务 URL、镜像 digest、runtime manifest SHA256、
   `/health` 结果、一次真实导出的 request ID/trace ID、PDF/HTML/thumbnail hash。
2. **完成 72 小时 RC 观察。** 只在 canary 健康和真实导出通过后开始计时；
   记录窗口开始/结束时间、监控来源、P0/P1/P2 事件、回滚是否触发和是否需要重置窗口。
3. **核对依赖审计。** 以 GitHub Dependabot advisory 列表与 CI/`pnpm audit`/Trivy 结果为准，对仍开放项写明已修复、不适用或接受风险；本地 audit 为 0 不等于 GitHub 队列已清零。
4. **Vivliostyle 说明。** 若 opt-in CLI 与默认 Chromium 的运行时等价性未完成，稳定版发布说明继续把 Vivliostyle 标为非 v1 默认能力。

## RC 观察结论

- 观察窗口状态：未开始；必须在 release tag 和生产 canary 成功后启动连续 72 小时窗口。
- 观察期间的 P0/P1 事故与处理：暂无观察数据；Render canary 启动后按 [operations-drill.md](operations-drill.md) 记录 request ID、trace ID、镜像 digest 和处理时间，不记录 Markdown 正文或密钥。
- 未解释的稳定性回归：当前自动化门禁未发现；生产观察尚未验证。
- 未关闭的 P2 及其发布影响：GitHub push 提示默认分支存在 20 个 Dependabot advisory（2 high、11 moderate、7 low）；本 PR 的 dependency-review、pnpm audit 和 Trivy 均通过，但发布负责人仍需确认这些 advisory 是否影响 release scope，并记录风险接受或修复计划。
- Dependabot major bump 决定：`#2` TypeScript `5.9.3` -> `6.0.3` 在本地 `pnpm typecheck` 中失败（`packages/theme-sdk` 缺少 Node ambient types）；`#4` `@types/node` `22.19.13` -> `26.1.2` 通过 `pnpm check`，但与当前 Node `22.22.2` 运行时类型目标不一致。两者均延后到 `v1.0.0` 后处理，RC 期间接受保留当前版本的风险。
- 是否重新开始 72 小时观察窗口：否；当前没有已开始或需重置的生产观察窗口。

## 发布决定

当前决定：**已批准并创建 `v1.0.0-rc.1` prerelease；稳定版 tag 仍待 Render canary 与 72 小时观察证据**。候选 Release 和 GHCR 镜像已发布，GitHub Pages 部署已退役；不再把五项人工签字列为阻塞项。

只有自动化门禁保持通过、发布阻塞项关闭、Render canary 与观察记录齐全，才能勾选：

- ☑ 批准创建 `v1.0.0-rc.1` prerelease tag
- ☐ 批准稳定版 / 生产部署

发布前最终复核顺序：

1. 确认候选 tag、镜像 digest、release artifact 和新的 runtime manifest SHA256。
2. 完成 Render canary 与一次真实导出记录。
3. 完成 72 小时观察，记录 P0/P1、P2、稳定性和回滚结果。
4. 在以上证据齐全后勾选稳定版发布决定。

任何一项为否都应记录原因和下一步，不得用 fallback 样张替代缺失的自动化或部署证据。
