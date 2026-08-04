# 发布记录：v1.0.0

本记录对应 `v1.0.0` 稳定版。门禁以自动化证据（CI、视觉 diff、扫描、容器 smoke）为准；不再要求排版/打印、安全、隐私/法务、无障碍、运维五项独立人工签字。Render canary 与 72 小时观察作为发布后运维跟进。

## 版本信息

| 项目                    | 当前值                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------- |
| 版本 / tag              | `v1.0.0`                                                                                |
| Git commit              | 见 `v1.0.0` tag（含 Nuxt 4.5.1 安全升级、#10 渲染硬化与发布文档整理）                   |
| Renderer image          | `ghcr.io/x1phyr/markdown-mint-renderer:v1.0.0`（由 Release workflow 发布后回填 digest） |
| runtime manifest SHA256 | Release asset 中的清单文件（tag 构建后回填）                                            |
| 观察窗口                | 建议在 Render canary 成功后连续观察 72 小时                                             |
| 发布负责人              | `x1phyr / MarkdownMint 维护者`                                                          |

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
| E9   | [#11 Nuxt 4.5.1 安全升级 CI](https://github.com/x1phyr/markdown-mint/pull/11)（quality/build/PDF/E2E 全绿）                                                                                                                        |
| E10  | [#10 渲染硬化](https://github.com/x1phyr/markdown-mint/pull/10)；admission control、AbortSignal 超时、idempotency fingerprint                                                                                                      |

## 自动化门禁

| 门禁                                   | 证据链接 / artifact                                                                   | 结果   |
| -------------------------------------- | ------------------------------------------------------------------------------------- | ------ |
| `pnpm check`、`pnpm build`             | E2、E3、E9；quality 与 build 通过                                                     | ☑ 通过 |
| 依赖审计、Trivy、CodeQL                | E2、E4、E5；Trivy 的 CRITICAL/HIGH 阻断扫描通过                                       | ☑ 通过 |
| Chromium / Firefox / WebKit E2E 与 axe | E8、E9；三套浏览器 job 均通过                                                         | ☑ 通过 |
| 三套标准与复杂 fixture PDF 视觉回归    | E6、E9；每套主题均包含标准与 complex fixture 视觉校验                                 | ☑ 通过 |
| 真实容器 PDF、缩略图、签名下载与 tmpfs | E5；API smoke 返回 PDF、thumbnail、signed download，512 MiB noexec tmpfs 容量校验通过 | ☑ 通过 |
| 存储重启恢复、备份归档与恢复 smoke     | E2；quality job 已执行 storage recovery 与 backup smoke                               | ☑ 通过 |
| 运行时 manifest、字体和第三方 notices  | E5；Node 22.22.2、Playwright 1.62.1、字体版本和 notices 已校验                        | ☑ 通过 |
| Nuxt 安全升级                          | E9；`unctx@3.0.0` 与 `@nuxt/cli@3.37.0` overrides 已对齐                              | ☑ 通过 |

排版质量、安全扫描、无障碍 axe、隐私/许可文档与运维契约分别由视觉回归、CodeQL/Trivy/`pnpm audit`、三浏览器 E2E、仓库内条款/许可清单，以及部署手册与自动化 smoke 覆盖。

## 发布后跟进

1. **执行 Render Blueprint canary。** 按 [部署与运维](deployment.md#render-首次部署) 使用 [render.yaml](../render.yaml)；记录服务 URL、镜像 digest、runtime manifest SHA256、一次真实导出的 request ID/trace ID 与产物 hash。
2. **完成 72 小时观察。** canary 健康后开始计时；记录 P0/P1/P2 与是否回滚。
3. **核对依赖审计。** 以 GitHub Dependabot advisory 与 CI/`pnpm audit`/Trivy 为准；TypeScript 6 与 `@types/node` 26 major bumps 已延后。
4. **Vivliostyle 说明。** 默认 PDF 路径为 Playwright Chromium；未完成等价性前不宣称 Vivliostyle 为 v1 默认能力。

## 观察结论（发布时）

- 观察窗口状态：未开始；建议在 `v1.0.0` tag 与 Render canary 成功后启动。
- Dependabot major bump：`#2` TypeScript 6 typecheck 失败；`#4` `@types/node` 26 与 Node 22.22.2 不匹配；均延后。
- 本地 `pnpm audit` 当前为 0 vulnerabilities。

## 发布决定

当前决定：**批准创建 `v1.0.0` 稳定版标签**。候选 `v1.0.0-rc.1` 自动化证据保留为基线；本版本合并 Nuxt 安全修复与渲染硬化，并以自动化门禁作为稳定版依据。

- ☑ 批准创建 `v1.0.0-rc.1` prerelease tag
- ☑ 批准创建 `v1.0.0` 稳定版 tag
- ☐ Render canary / 72 小时观察（发布后跟进）
