# 第三方许可清单

这份清单只列出 MarkdownMint 当前直接引入或由生产 Renderer 明确下载的运行时。发布镜像
必须同时保留依赖包自身的 `LICENSE`、`NOTICE` 和 `ThirdPartyNotices.txt`，不能只保留本页摘要。

| 组件                        | 固定版本                                            | 用途                        | 许可/交付要求                                                                                                     |
| --------------------------- | --------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Playwright                  | 1.62.1                                              | 启动隔离 Chromium、生成 PDF | Apache-2.0；npm 包内含 `LICENSE`、`NOTICE` 和 `ThirdPartyNotices.txt`                                             |
| `@axe-core/playwright`      | 4.12.1                                              | Web E2E 的 WCAG 自动审计    | MPL-2.0；仅用于开发/CI，发布镜像不包含该包；保留锁文件和依赖许可记录                                              |
| Playwright Chromium runtime | 与 Playwright 1.62.1 匹配的 pinned browser revision | PDF 分页                    | 浏览器包及其第三方 notices 必须随生产镜像审计和保留；发布前记录实际 revision 与 sha256                            |
| Debian Liberation fonts     | 镜像/CI 的 apt 包版本                               | Latin 正文、标题和代码字体  | GPL-2 with Font embedding exception；发布镜像保留 `/usr/share/doc/fonts-liberation/copyright`                     |
| WenQuanYi Zen Hei           | 镜像/CI 的 apt 包版本                               | 中文字形回退                | GPL-2 with Font embedding exception 与 M+ FONTS License；发布镜像保留 `/usr/share/doc/fonts-wqy-zenhei/copyright` |

## 明确不引入的运行时

`@vivliostyle/cli` 当前没有进入依赖树，但 Renderer 提供了调用外部 `vivliostyle` 可执行文件的
适配器。其官方发布包是 AGPL-3.0；若未来作为可分发镜像的一部分引入，必须先完成许可证兼容性
评审和完整源码/notice 交付方案。未完成该评审前，生产 Renderer 使用 Playwright Chromium 作为
默认可审计分页路径，Vivliostyle 只能在受控环境中显式启用。

## 发布检查

- `pnpm-lock.yaml` 是 Node 依赖版本的唯一来源；
- Docker 构建固定 `playwright` 版本并安装匹配的 Chromium，不使用浮动 `latest`；
- Docker 镜像构建会生成 `/usr/share/markdown-mint/runtime-manifest.json`，记录 Playwright 版本、Chromium/headless-shell revision、可执行文件 SHA256、字体包版本和 notices SHA256；CI/Release 会验证该清单，Release 同时把它作为 `renderer-runtime-manifest.json` 保存；
- 生产镜像扫描应确认浏览器 revision、系统包和所有第三方 notices 可追溯；
- 新增字体、分页引擎、图片解码器或浏览器插件时，先更新本页和依赖审计记录。
