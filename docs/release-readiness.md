# Release readiness

这份清单记录 `v1.0.0` 稳定版的可验证门禁，以及建议在部署环境继续完成的观察项。
自动化通过不等于线上已部署；Render canary 与 72 小时观察仍是推荐的运维跟进。

## 当前已验证

- `CompiledDocument` v1、`ExportRequest` schema、Theme Manifest v1 和稳定错误码边界已存在；
- GFM、资源安全、Shiki、KaTeX、Mermaid、三套主题、Web 三步流程和 30 份兼容 fixture 有自动化回归；
- Node.js 运行时已统一为 22.22.2（`.nvmrc`、根 workspace engine 和 Renderer 镜像基 digest）；在该 Linux 运行时，完整 `pnpm check`（lint、全部 workspace `typecheck`、18 个测试文件的 116 个测试和格式检查）、`pnpm test:coverage`（17 个测试文件的 113 个测试及覆盖率门槛）和 `pnpm build` 均通过；
- HTML 产物有封面、目录、页眉/页脚、页码开关、大小和 sha256 元数据；
- HTML 导出已验证将合规的本地图片内联为 data URL，下载后的单文件不依赖 `assets/` 目录；
- PDF 默认使用锁定版本的 Playwright Chromium 分页适配器，不再静默使用 fallback；适配器按请求的纸张、方向和边距生成 PDF，并返回页数；
- 在生产等价 Linux 镜像中，16 个长章节的真实 Chromium smoke 生成 10 页 A4 PDF，`pdfinfo` 与服务元数据的页数一致；页眉、页脚和 `Page N / totalPages` 已通过 PNG 视觉检查；
- 固定 144 DPI 的三套首发主题 Chromium visual baseline 已纳入 `smoke:pdf:visual`（三套各 10 页），基线由生产等价 Linux 镜像生成；arm64 与 amd64 镜像的逐页图像哈希一致，连续真实渲染也一致；
- PDF 成功产物现在包含首页 PNG 缩略图元数据，并通过 `/v1/exports/:id/thumbnail` 提供；Web 结果页和主题详情页已接入渐进式预览，缩略图与任务保留期一起清理；
- Renderer Docker 镜像已在本地真实构建并启动验收；容器健康检查通过，回环 API 已完成真实 Chromium PDF 与首页 PNG 缩略图导出下载验证；
- Renderer 压力 smoke 已在固定 Chromium 上通过：amd64 容器 5 次 20 页基准 P95 为 1.56s，100 页 fixture 生成 100 页并成功完成（默认 30s 超时）；CI 与 Release workflow 已接入同一门禁；
- `smoke:pdf:complex` 已用统一主题验收样张在三套首发主题上生成真实 8 页 PDF 和首页 PNG，并接入 CI/Release；三套对应的固定 Linux 144 DPI 逐页视觉基线也已接入；
- Web 生产构建已在 Chromium、Firefox、WebKit 三个 Playwright runtime 中完成首页、主题列表、主题详情、移动视口、主 landmark、重复 ID、浏览器错误和 axe WCAG 自动审计 smoke；
- Renderer 有幂等、取消、超时、重试、保留期、超限请求和 CORS 预检测试。
- Renderer 任务有独立临时工作区、`traceId`、`x-request-id` 和 JSON 阶段日志；Vivliostyle 外部 CLI 适配器有退出码、页数、空产物和工作区清理契约测试。
- Renderer 在配置 `RENDERER_DOWNLOAD_SIGNING_SECRET` 时为 PDF/HTML 与首页缩略图返回短期签名下载地址，并对缺失、篡改和过期签名拒绝服务；Web 已消费这两个链接。
- Renderer Server 已自动执行保留期 sweep；短保留期集成测试验证 PDF、HTML/产物元数据和首页缩略图一起进入 `expired`，不能继续下载。
- CI/Release 容器门禁已包含真实 API PDF/缩略图导出、签名下载拒绝和 512 MiB `/tmp` 容量上限检查，不再只检查 `/health`。
- CI/Release 还会在生产镜像内以无网络、只读 rootfs、`/tmp` `noexec`、fixtures 只读挂载和独立可执行临时目录运行 Renderer 单元测试；
- `RENDERER_DATA_DIR` 文件存储已覆盖提交落盘、原子产物写入、重启恢复、幂等恢复、损坏产物 fail-closed
  和保留期删除契约；Compose 使用独立持久卷，`storage-backup.mjs` 已覆盖清单哈希、归档验证、恢复
  前非空目标保护和软链接拒绝，运维手册包含整卷备份/恢复步骤。
- Renderer 镜像现在生成并自校验 runtime manifest，记录 Playwright/Chromium revision、可执行文件 SHA256、
  字体包版本和第三方 notices；Release 会将该清单作为校验产物保留。
- `docs/release-signoff.md` 已提供 RC 的自动化证据索引、部署/观察记录模板；不再要求五项独立人工签字。
- 服务条款预发布草案、迁移说明和运维/发布演练手册已入库；Render canary 与 72 小时观察仍待执行。

## 已知限制与跟进项

- 当前已具备固定 Chromium smoke 的视觉 diff、明确的 Linux 字体镜像、首页 PNG 预览、扩充后的复杂主题 fixture、复杂 fixture 的独立视觉基线和 Vivliostyle 外部 CLI 适配器；Vivliostyle 运行时等价性未完成前，不得把它宣称为 v1 默认能力；
- fallback 仅可通过测试或显式注入启用，不能作为生产降级路径；
- 当前候选的 GitHub hosted CI 已通过 Trivy 容器扫描、依赖审计、CodeQL 和三浏览器矩阵；Render canary 与 72 小时观察建议在 tag 后完成；
- 暂不合并 Dependabot major bumps：`#2` TypeScript `6.0.3` 当前 typecheck 失败；`#4` `@types/node` `26.1.2` 虽通过自动化检查，但不匹配 Node `22.22.2` 运行时类型目标；
- Chromium runtime 的实际 revision/sha256、镜像内第三方 notices、字体包版本现在已有机器校验清单；
- `RENDERER_DATA_DIR` 文件存储是单实例恢复契约，不应直接当作高可用任务队列或托管数据库。

## 发布后跟进

`v1.0.0` 标签以自动化门禁与维护者确认发布。下列项目是部署环境的推荐跟进，不再阻塞 tag：

| 顺序 | 待办事项                                                                                                                                                               | 完成标准                                                                                                                   |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1    | 按 [deployment.md](deployment.md#render-首次部署) 和 [render.yaml](../render.yaml) 创建 Render Blueprint canary，填入 Web/Renderer 互相匹配的 URL、CORS 与下载签名密钥 | Web `/`、Renderer `/health` 和一次真实 PDF/HTML 导出均通过；记录服务 URL、镜像 digest、request ID/trace ID 和导出产物 hash |
| 2    | canary 健康后启动连续 72 小时观察窗口                                                                                                                                  | 写明开始/结束时间、监控来源、P0/P1/P2 事件、回滚是否触发；若发生 P0/P1 或未解释稳定性回归，重新开始观察窗口                |
| 3    | 核对 Dependabot advisory 与本地/CI 审计结果                                                                                                                            | 本地 `pnpm audit` 当前为 0 vulnerabilities，但 GitHub advisory 数可能不同；以 GitHub 列表为准写明已修复、不适用或接受风险  |
| 4    | Vivliostyle runtime 等价性说明                                                                                                                                         | 默认 PDF 路径仍是 Playwright Chromium；稳定版说明不得把未完成等价性验收的 Vivliostyle 宣称为 v1 默认能力                   |

不得把 fallback PDF 样张标记为最终排版样张。
