# RC 发布签字单：v1.0.0-rc.1

本记录对应 `v1.0.0-rc.1` 候选版。自动化门禁已经通过；跨平台打印、人工安全/隐私/无障碍/运维验收和 72 小时 RC 观察属于部署环境门禁，不能由代码作者代签，因此本文件批准的是明确标注的 prerelease，不是稳定版或生产部署批准。

正式创建 `v1.0.0-rc.n` 或 `v1.0.0` 时，应复制本文件，替换版本、镜像 digest、运行时清单和观察窗口，并把人工签字证据附在对应位置。签字单是发布记录，不替代 CI、视觉 diff、扫描或部署演练。

## 版本信息

| 项目                    | 当前候选值                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 版本 / tag              | `v1.0.0-rc.1`（候选 prerelease）                                                                                                      |
| Git commit              | [`ac7d35853f5a5b02abed19ac32c0bfd943721829`](https://github.com/x1phyr/markdown-mint/commit/ac7d35853f5a5b02abed19ac32c0bfd943721829) |
| Renderer image          | `ghcr.io/x1phyr/markdown-mint-renderer:v1.0.0-rc.1`；digest `sha256:e96eb6351bd807e70f001f4a10c9b1727c0f2069ff4931e3b9dd004a84723563` |
| runtime manifest SHA256 | `sha256:ff7827a41421b553f52af90a1b759ad61ecf264ff8cb2c849cb246f8827814a1`（Release asset 中的清单文件）                                  |
| RC 观察窗口             | 未开始；release tag 对应的生产 canary 完成后连续观察 72 小时                                                                          |
| 发布负责人              | `x1phyr / MarkdownMint 维护者`（最终签字人）                                                                                          |

## 证据索引

| 编号 | 证据                                                                                                                                                                                                                                                                                                                    |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1   | [PR #6 合并](https://github.com/x1phyr/markdown-mint/pull/6)；[main CI](https://github.com/x1phyr/markdown-mint/actions/runs/30816428657)；[v1.0.0-rc.1 Release](https://github.com/x1phyr/markdown-mint/actions/runs/30816589380) |
| E2   | [main CI：quality、lint、typecheck、测试、format、audit 与 storage smoke](https://github.com/x1phyr/markdown-mint/actions/runs/30816428657) |
| E3   | [main CI：全 workspace build](https://github.com/x1phyr/markdown-mint/actions/runs/30816428657) |
| E4   | [main CodeQL](https://github.com/x1phyr/markdown-mint/actions/runs/30816428603)；[tag CodeQL](https://github.com/x1phyr/markdown-mint/actions/runs/30816586276) |
| E5   | [Release verify-and-release：受限运行、API smoke、manifest、Trivy 与 GHCR 发布](https://github.com/x1phyr/markdown-mint/actions/runs/30816589380/job/91695756447) |
| E6   | [Release verify-and-release：三套标准与 complex fixture PDF](https://github.com/x1phyr/markdown-mint/actions/runs/30816589380/job/91695756447) |
| E7   | [Release verify-and-release：renderer pressure smoke](https://github.com/x1phyr/markdown-mint/actions/runs/30816589380/job/91695756447) |
| E8   | [Release verify-and-release：Chromium、Firefox、WebKit E2E 与 axe](https://github.com/x1phyr/markdown-mint/actions/runs/30816589380/job/91695756447) |

## 自动化门禁

| 门禁                                   | 证据链接 / artifact                                                                   | 结果   |
| -------------------------------------- | ------------------------------------------------------------------------------------- | ------ |
| `pnpm check`、`pnpm build`             | E2、E3；quality 分步覆盖 lint/typecheck/test/format，build job 覆盖全 workspace build | ☑ 通过 |
| 依赖审计、Trivy、CodeQL                | E2、E4、E5；Trivy 的 CRITICAL/HIGH 阻断扫描通过                                       | ☑ 通过 |
| Chromium / Firefox / WebKit E2E 与 axe | E8；三套浏览器 job 均通过                                                             | ☑ 通过 |
| 三套标准与复杂 fixture PDF 视觉回归    | E6；每套主题均包含标准与 complex fixture 视觉校验                                     | ☑ 通过 |
| 真实容器 PDF、缩略图、签名下载与 tmpfs | E5；API smoke 返回 PDF、thumbnail、signed download，512 MiB noexec tmpfs 容量校验通过 | ☑ 通过 |
| 存储重启恢复、备份归档与恢复 smoke     | E2；quality job 已执行 storage recovery 与 backup smoke                               | ☑ 通过 |
| 运行时 manifest、字体和第三方 notices  | E5；Node 22.22.2、Playwright 1.62.1、字体版本和 notices 已校验                        | ☑ 通过 |
| GitHub Pages 发布                         | [Deploy Pages](https://github.com/x1phyr/markdown-mint/actions/runs/30816428695)；线上站点返回 HTTP 200，部署 SHA 为 `ac7d358…` | ☑ 通过 |

补充的本地镜像验证：18 个测试文件、116 个测试通过；无网络、只读根文件系统、`/tmp` noexec、非 root、`cap-drop=ALL`、API smoke 和精确 512 MiB tmpfs 均通过。该验证用于复核，不替代 E5 的 hosted CI 结果。

## 人工验收

结果标记：`☑` 已完成，`◐` 自动化有证据但人工未签，`☐` 未完成。人工负责人必须在实际设备、部署环境或法务流程中签名；不能由本文件作者代签。

| 领域        | 必须确认                                                                                                                   | 建议留存证据                                                                                       | 负责人                  | 日期 / 签名    | 结果       |
| ----------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------- | -------------- | ---------- |
| 排版 / 打印 | 三套主题在至少一台 Linux 和一台 macOS/Windows 打印链路中抽样；页眉、页脚、页码、中文字体、公式、图表、宽表格和分页无 P0/P1 | 设备/OS/打印机型号、PDF SHA256、打印样张照片、分页问题记录                                         | 发布负责人 + 打印复核人 | 发布前现场签字 | ☐ 未完成   |
| 安全        | 威胁模型、权限、资源策略、日志脱敏、密钥托管和人工安全评审无开放阻塞项                                                     | [threat-model.md](threat-model.md)、[security.md](../SECURITY.md)、评审结论和阻塞项清单            | 安全评审人              | 发布前评审签字 | ☐ 未完成   |
| 隐私 / 法务 | 服务条款、隐私、第三方许可、字体再分发和备份生命周期已批准                                                                 | [terms.md](terms.md)、[privacy.md](privacy.md)、[third-party-licenses.md](third-party-licenses.md) | 法务 / 隐私负责人       | 发布前批准签字 | ☐ 未完成   |
| 无障碍      | 键盘、焦点、读屏和已知 axe 结果已人工复核；P0/P1 为 0                                                                      | E8 的三套 axe 结果、人工键盘/读屏记录、已知问题清单                                                | 无障碍复核人            | 发布前复核签字 | ◐ 待人工签 |
| 运维        | 加密卷、备份 ACL、恢复、回滚、磁盘耗尽、签名密钥轮换和单实例限制已演练                                                     | [operations-drill.md](operations-drill.md)、演练日志、卷快照 ID、回滚 commit、密钥轮换记录         | 运维负责人              | 发布前演练签字 | ☐ 未完成   |

当前不能代签的原因：跨平台打印样张、法务批准、人工读屏记录、生产回滚演练或 72 小时生产观察数据必须来自相应负责人和真实部署环境。

## RC 观察结论

- 观察窗口状态：未开始；必须在 release tag 和生产 canary 成功后启动连续 72 小时窗口。
- 观察期间的 P0/P1 事故与处理：暂无观察数据；启动后按 [operations-drill.md](operations-drill.md) 记录 request ID、trace ID、镜像 digest 和处理时间，不记录 Markdown 正文或密钥。
- 未解释的稳定性回归：当前自动化门禁未发现；生产观察尚未验证。
- 未关闭的 P2 及其发布影响：GitHub push 提示默认分支存在 20 个 Dependabot advisory（2 high、11 moderate、7 low）；本 PR 的 dependency-review、pnpm audit 和 Trivy 均通过，但发布负责人仍需确认这些 advisory 是否影响 release scope，并记录风险接受或修复计划。
- 是否重新开始 72 小时观察窗口：否；当前没有已开始或需重置的生产观察窗口。

## 发布决定

当前决定：**已批准并创建 `v1.0.0-rc.1` prerelease；不批准稳定版 tag 和生产部署**。候选 Release、GHCR 镜像和 GitHub Pages 均已发布；人工签字、回滚演练和 72 小时观察尚未完成，自动化门禁通过不能替代这些发布条件。

只有以下条件全部满足、发布阻塞项为零、上一稳定版本回滚已验证，才能勾选：

- ☑ 批准创建 `v1.0.0-rc.1` prerelease tag
- ☐ 批准生产部署

发布前最终复核顺序：

1. 由发布负责人确认候选 tag、镜像 digest、release artifact 和新的 runtime manifest SHA256。
2. 完成人工排版、安保、隐私/法务、无障碍和运维签字。
3. 在生产 canary 启动 72 小时观察，记录 P0/P1、P2、稳定性和回滚结果。
4. 由发布负责人在以上证据齐全后明确勾选稳定版发布决定。

任何一项为否都应记录原因、责任人和下一步，不得用 fallback 样张或本地通过替代缺失验收。
