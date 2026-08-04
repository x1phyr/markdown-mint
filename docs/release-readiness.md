# Release readiness

这份清单用于 `v1.0.0-rc.1` 候选版及后续 `v1.0.0` 稳定版。它记录可验证的门禁，也记录尚未
满足的发布阻塞项，不把测试通过误写成生产就绪。

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
- `smoke:pdf:complex` 已用统一主题验收样张在三套首发主题上生成真实 8 页 PDF 和首页 PNG，并接入 CI/Release；三套对应的固定 Linux 144 DPI 逐页视觉基线也已接入，证据明确区分自动化通过与人工打印签字；
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
- `docs/release-signoff.md` 已提供 RC 的自动化证据、跨平台打印、安全/隐私/无障碍/运维负责人签字和
  72 小时观察窗口记录模板。
- 服务条款预发布草案、迁移说明和运维/发布演练手册已入库；持久卷加密、备份 ACL、跨实例协调和签名
  密钥托管仍需部署负责人完成。

## 发布阻塞项

- 当前已具备固定 Chromium smoke 的视觉 diff、明确的 Linux 字体镜像、首页 PNG 预览、扩充后的复杂主题 fixture、复杂 fixture 的独立视觉基线和 Vivliostyle 外部 CLI 适配器，但 Vivliostyle 运行时等价性和跨平台人工打印验收尚未完成；
- fallback 仅可通过测试或显式注入启用，不能作为生产降级路径；
- 当前候选的 GitHub hosted CI 已通过 Trivy 容器扫描、依赖审计、CodeQL 和三浏览器矩阵；生产 canary 的 72 小时 RC 观察仍需在发布后完成；
- Chromium runtime 的实际 revision/sha256、镜像内第三方 notices、字体包版本现在已有机器校验清单，但再分发许可和最终发布负责人签字仍未完成；
- 生产产物保留参数、持久卷加密与备份/回滚演练、签名密钥托管和跨实例部署策略需要部署环境参与；
  `RENDERER_DATA_DIR` 文件存储是单实例恢复契约，不应直接当作高可用任务队列或托管数据库。

## 下一步行动清单

稳定版 `v1.0.0` 只能在以下项目全部关闭后推进。每项关闭时应在
[release-signoff.md](release-signoff.md) 中补充负责人、日期、证据链接和结论；不能把自动化通过、候选版发布
或本地 smoke 结果替代人工/生产证据。

| 顺序 | 负责人                       | 待关闭事项                                                                                                                                                             | 关闭标准                                                                                                                                                                           |
| ---- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | 部署负责人                   | 按 [deployment.md](deployment.md#render-首次部署) 和 [render.yaml](../render.yaml) 创建 Render Blueprint canary，填入 Web/Renderer 互相匹配的 URL、CORS 与下载签名密钥 | Web `/`、Renderer `/health` 和一次真实 PDF/HTML 导出均通过；在签字单记录服务 URL、镜像 digest、request ID/trace ID 和导出产物 hash                                                 |
| 2    | 运维负责人 + 发布负责人      | canary 健康后启动连续 72 小时 RC 观察窗口                                                                                                                              | 在签字单写明开始/结束时间、监控来源、P0/P1/P2 事件、回滚是否触发；若发生 P0/P1 或未解释稳定性回归，重新开始观察窗口                                                                |
| 3    | 打印复核人                   | 完成跨平台人工打印验收                                                                                                                                                 | 至少覆盖一条 Linux 打印链路和一条 macOS/Windows 打印链路，留存 PDF SHA256、设备/OS/打印机型号、样张照片和分页问题结论                                                              |
| 4    | 安全评审人                   | 完成安全签字和 GitHub advisory 处置记录                                                                                                                                | 复核威胁模型、资源策略、日志脱敏、密钥托管和开放漏洞；对 Dependabot advisory 逐项写明已修复、误报/不适用或带理由接受风险                                                           |
| 5    | 隐私 / 法务负责人            | 完成服务条款、隐私、第三方许可、字体再分发和备份生命周期批准                                                                                                           | 在签字单写明批准结论；字体/redistribution license 不能只引用自动生成 notices，需有最终 owner signoff                                                                               |
| 6    | 无障碍复核人                 | 完成键盘、焦点和读屏人工复核                                                                                                                                           | 结合三浏览器 axe 结果记录人工步骤、读屏环境、P0/P1 数量和是否接受已知问题                                                                                                          |
| 7    | 运维负责人                   | 完成生产运维项：持久卷加密、备份 ACL、恢复/回滚演练、签名 key custody、单实例限制                                                                                      | 记录卷加密与备份访问控制、恢复演练日志、回滚 commit、密钥保管/轮换方式；明确 Render 持久磁盘只能挂载单实例，未完成跨实例协调前不得水平扩容                                         |
| 8    | Renderer 负责人 + 发布负责人 | 关闭 Vivliostyle runtime 等价性                                                                                                                                        | 完成 opt-in CLI 与默认 Chromium runtime 的等价性验收并记录证据；若未完成，稳定版说明不得把 Vivliostyle 宣称为 v1 支持能力                                                          |
| 9    | 发布负责人                   | 汇总依赖审计状态并 reconcile GitHub 与本地结果                                                                                                                         | 本地 `pnpm audit` 当前为 0 vulnerabilities，但 GitHub Dependabot advisory 数可能不同；发布前需以 GitHub advisory 列表为准逐项补充 accept/fix notes，并重新运行 CI/Release 相关扫描 |

在以上项目关闭前，不应创建稳定版 `v1.0.0` 标签，也不应把 fallback PDF 样张标记为最终排版样张。`v1.0.0-rc.1`
只能作为明确标注的 prerelease，用于获取真实部署和观察证据。
