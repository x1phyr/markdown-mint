# 系统架构

## 设计原则

1. **一个内容模型，两种输出。** PDF 和 HTML 必须消费同一个编译结果。
2. **主题是受控程序包。** 主题拥有 Manifest、能力声明、变量和分层 CSS，而不是复制粘贴的模板目录。
3. **浏览器不做完整排版。** Web 端只解析摘要和提交任务，完整内容在渲染器执行。
4. **不受信任内容跨越边界时必须验证。** 输入、资源、SVG 和产物都不能因为“已经解析”就被信任。
5. **可复现优先。** 固定运行时、字体、浏览器和主题版本，使同一请求产生稳定输出。

## 内容管线

```text
Markdown + Assets + ExportRequest
                  │
                  ▼
        request schema validation
                  │
                  ▼
 remark / mdast ─ normalize ─ diagnostics
                  │
                  ▼
          MarkdownMint document model
                  │
                  ▼
       rehype / hast ─ sanitize ─ semantic HTML
                  │
                  ├──────── Theme Runtime ────────┐
                  │                               │
                  ▼                               ▼
       standalone HTML exporter          paged-media renderer
                                                  │
                                                  ▼
                                                 PDF
```

Shiki、KaTeX 和 Mermaid 在语义 HTML 形成过程中转成静态 HTML/CSS/SVG。最终文档不执行用户脚本。

## 运行时边界

### Web 应用

- Nuxt 应用、主题图库、导入流程和任务状态；
- 浏览器端只做文件读取、基础摘要和本地草稿；
- 不把原始 Markdown 写入分析日志；
- 通过版本化 API 提交 `ExportRequest`。

### Renderer API

- 验证请求、创建任务、管理生命周期和返回产物；
- 为每个任务创建独立临时工作区；
- 负责资源抓取策略、大小限制、超时和清理；
- 调用编译器、主题运行时、HTML 导出器和 PDF 后端；
- 不允许渲染进程访问应用凭据、宿主文件系统或任意内网地址。

### PDF 后端

v1.0 的首选分页后端为 Vivliostyle CLI，Chromium/Playwright 只作为缩略图、E2E 和有明确限制的降级路径。浏览器和字体版本必须固定在容器镜像中。

## 包职责

| 路径                       | 职责                                   | 禁止承担                 |
| -------------------------- | -------------------------------------- | ------------------------ |
| `packages/compiler`        | Markdown 解析、规范化、诊断、语义 HTML | 主题视觉、HTTP、任务管理 |
| `packages/document-schema` | 跨进程和持久化边界的数据协议           | 业务执行逻辑             |
| `packages/theme-sdk`       | 主题 Manifest、能力和作者接口          | 主题选择 UI              |
| `packages/theme-runtime`   | 主题加载、变量校验和 CSS 装配          | Markdown 解析            |
| `packages/themes`          | 官方主题资源                           | 渲染器基础设施           |
| `packages/html-exporter`   | 自包含 HTML 打包                       | PDF 分页                 |
| `apps/renderer`            | 隔离任务、产物与 API                   | Web 页面和编辑器         |
| `apps/web`                 | 用户流程、主题展示与结果页             | 完整服务端渲染           |

共享包必须保持小而稳定。只有至少两个边界真正消费的代码才进入 `packages/shared`。

## 核心协议

### ExportRequest

请求包含源码与资源、文档元数据、主题配置、页面配置、结构功能和输出格式。所有外部输入在进入任务队列前通过 `document-schema` 验证，未知字段默认拒绝或显式剥离。

### CompiledDocument

计划包含：

- 规范化元数据；
- 已清理的语义 HTML；
- 标题和目录树；
- 编译后的本地资源清单；
- 可定位诊断；
- 编译器和主题兼容版本。

CompiledDocument 是内部协议，不直接把任意 HTML 当作等价输入。

## 安全模型

主要威胁包括 XSS、SVG 脚本、Mermaid 注入、路径穿越、压缩炸弹、超大图片、SSRF、内网探测、字体解析缺陷、无限布局、浏览器漏洞和产物泄露。

v1.0 控制措施：

- 默认不透传原始 HTML；
- HTML 与 SVG 使用允许列表清理；
- 远程资源只允许 HTTP(S)，拒绝私网、回环、链接本地和重定向到受限地址；
- 资源数量、单文件大小、总大小、像素、解析时间和渲染时间有硬限制；
- Mermaid 使用严格安全模式，并在隔离上下文转为 SVG；
- 每个任务使用独立临时目录和随机 ID；
- 渲染容器使用非 root 用户、只读根文件系统、最小 capability 和受控网络；
- 日志不记录文档正文、令牌、远程 URL 查询参数或产物内容；
- 产物采用短期签名下载地址并按保留期删除。

在引入远程资源、用户字体或账户系统前必须更新威胁模型。

## 可复现性与版本

- Node、pnpm、Chromium、Vivliostyle、字体和系统包固定版本；
- 主题 Manifest 独立版本，导出结果记录主题版本；
- 编译器对语义结构的破坏性变化需要 ADR 和迁移说明；
- fixture PDF 以结构检查、像素 diff 和人工抽样共同验收；
- 不把带时间戳、随机 ID 的不稳定数据写入基准产物。

## 可观测性

任务状态至少包含 `queued`、`compiling`、`rendering`、`packaging`、`succeeded`、`failed`、`expired`。每个状态转换记录任务 ID、阶段、耗时、版本和标准错误码，但不记录正文。

v1.0 需要建立的指标：

- 请求和任务成功率；
- 排队、编译、分页、打包各阶段耗时；
- 文档页数和资源规模分布（只记录聚合值）；
- 超时、资源拒绝、用户语法错误和内部错误比例；
- 产物大小和清理任务滞后。
