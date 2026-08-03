# 主题开发规范

## 主题不是一份 CSS

主题包必须声明适用场景、能力、默认配置和兼容版本，并消费统一的 MarkdownMint 语义 HTML。主题不得依赖用户脚本、外部运行时或私有网络资源。

推荐结构：

```text
packages/themes/<theme-id>/
├── manifest.ts
├── tokens.css
├── content.css
├── screen.css
├── print.css
├── cover.css
├── fixtures/
└── previews/
```

官方主题还应在 `packages/themes/src/details.ts` 中声明适用场景、内容覆盖、设计原则和统一验收
fixture。当前首发主题共用 `fixtures/p5-themes.md`，由编译器和主题运行时生成 HTML 预览；PDF
样例必须来自同一份 fixture 和渲染器适配器，不能用手工截图替代。

Manifest 必须声明 `schemaVersion: 1`、`compatibility.compiledDocument: 1`、支持的 `outputs`、完整能力集合，以及所有允许覆盖的 `--mm-*` token。主题 SDK 会在 `defineTheme()` 时校验这些字段；JSON manifest 也可以使用作者 CLI 检查：

```bash
pnpm --filter @markdown-mint/theme-sdk build
node packages/theme-sdk/dist/cli.js path/to/manifest.json
```

## 分层职责

- `manifest.ts`：身份、版本、分类、能力、默认值、支持的输出和兼容范围；
- `tokens.css`：颜色、字体、字号、行高、间距、圆角、边框和页面变量；
- `content.css`：标题、段落、列表、表格、代码、公式、图表等语义内容；
- `screen.css`：独立 HTML 和主题样张的屏幕表现；
- `print.css`：分页媒体、页眉页脚、页码、孤行寡行和跨页策略；
- `cover.css`：封面与章节首页的独立布局。

运行时按 `tokens → content → cover → screen → print` 装配 CSS。`cover.css` 可以省略，但其它四层和 `.mm-document` 语义根必须存在；CSS 不得包含 `@import`、外部 `url()`、脚本或未在 Manifest 中声明的 token。

## 允许用户覆盖的变量

v1.0 只开放经过主题声明的变量：

- 强调色；
- 内容密度；
- 代码主题；
- 页面尺寸、方向和边距；
- 封面、目录、标题编号、页眉页脚和页码开关。

不允许任意 CSS、任意字体 URL、任意 HTML 模板和 JavaScript。

运行时只接受 Manifest 中 `userOverridable: true` 的 token，并按 `color`、`length`、`number` 或字体类型校验值。未知 token、锁定 token 和包含 URL/脚本的值都会变成构建诊断。

## 必测内容

每套主题必须覆盖：

- 封面、目录、普通页、章节首页、附录、页眉、页脚和页码；
- H1–H6、段落、链接、引用、Callout、分隔线和多级列表；
- 表格、行内代码、代码块、图片、图注、公式、Mermaid 和脚注；
- 中文/英文混排、超长标题、超长 URL、宽表格、100 行代码、大图和连续分页；
- A4/Letter、纵向/横向、PDF/HTML 和三档密度。

## 预览生成

主题预览必须来自真实管线：

```text
标准 fixture → compiler → theme runtime → HTML/PDF → 指定页面截图 → WebP
```

禁止手工制作与实际导出不一致的营销图。更新视觉基线的 PR 必须同时提供变更原因、前后对比和至少一名主题 reviewer 的批准。

## 主题完成定义

- Manifest 通过 schema 和兼容性检查；
- 没有未消费或未声明的 token；
- 所有合同、视觉和分页测试通过；
- PDF 和 HTML 的核心视觉语言一致；
- 打印运行时使用 CI 与 Renderer 镜像明确安装的 `Liberation Sans/Serif/Mono` 与 `WenQuanYi Zen Hei` 字体栈；中文字体具备明确许可和所需字形；
- 页面在打印和屏幕环境均达到对比度要求；
- 主题详情、能力说明、样例 PDF 和 HTML 已生成。
- `fixtures/p5-themes.md` 通过三套主题的结构合同，且预览 HTML 由真实编译结果生成。
