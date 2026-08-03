# Markdown 格式参考

MarkdownMint 接收单份 UTF-8 Markdown 文档，并在任务提交时验证 `ExportRequest`。浏览器预检只
提供摘要；完整诊断以 Renderer 的编译结果为准。

## 支持内容

- CommonMark、GFM 表格、任务列表、删除线和脚注；
- YAML frontmatter：`title`、`subtitle`、`author`、`date`、`language`；
- H1–H6、链接、图片与图注、引用、列表、分隔线和代码围栏；
- `:::tip`、`:::warning`、`:::note` 等 callout，以及 `::pagebreak`；
- `$...$` / `$$...$$` 数学公式和 `mermaid` 代码块；
- 静态 Shiki 代码高亮，单文件 HTML 和 PDF 输出。

## 限制与降级

原始 HTML、脚本、事件属性、危险 URL、私网远程资源和超限图片不会透传。资源失败会生成可见
占位符与结构化诊断，不会静默丢失内容。远程资源默认关闭；服务端若开启代理，必须单独配置
SSRF、重定向、超时和缓存策略。

不支持任意 CSS、任意主题模板、用户脚本、交互式 Mermaid `click` 指令或动态字体 URL。

## Frontmatter 示例

```yaml
---
title: Release notes
subtitle: 0.5 preview
author: MarkdownMint
language: zh-CN
---
```

导出页面、主题能力和资源限制的最终行为以当前主题 Manifest 与请求 schema 为准。
