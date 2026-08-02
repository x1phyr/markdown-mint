# Security Policy

## Supported versions

在 v1.0 发布前，项目只为最新的 `main` 和最新预发布版本提供安全修复。v1.0 后，至少支持最新 minor 系列；具体窗口会在此文件更新。

| Version                     | Supported |
| --------------------------- | --------- |
| `main` / latest pre-release | Yes       |
| Older pre-releases          | No        |

## Reporting a vulnerability

请不要创建公开 Issue、Discussion 或 PR。

优先使用仓库的 **GitHub Private Vulnerability Reporting**。仓库公开后，维护者必须在 Security 设置中启用该功能。在功能启用前，请通过仓库所有者公开资料中的私密联系方式联系维护者，并仅提供最小必要信息。

报告请包含：

- 受影响的版本、提交或部署；
- 漏洞类型、前置条件和影响；
- 最小复现步骤或概念验证；
- 是否已被利用或公开；
- 建议缓解（如有）；
- 你希望使用的署名方式。

不要发送真实用户文档、凭据或不必要的个人信息。

## Response targets

这些是尽力目标，不构成服务级协议：

- 3 个工作日内确认收到；
- 7 个工作日内完成初步分级和下一步计划；
- 高危问题优先准备缓解和协调发布；
- 修复发布后，在不增加用户风险的前提下公开公告和致谢。

维护者可能要求延迟公开，以便用户更新。MarkdownMint 不授权攻击第三方系统、访问他人数据、持续破坏服务或进行社会工程。

## Scope priorities

尤其关注：

- Markdown/HTML/SVG/KaTeX/Mermaid 注入；
- SSRF、路径穿越、本地文件读取和沙箱逃逸；
- 恶意字体、图片、压缩文件和浏览器利用；
- 跨任务数据泄露、产物越权访问和保留期失效；
- GitHub Actions、依赖、发布密钥和包供应链；
- 可导致持久拒绝服务的解析或分页输入。

仅影响已明确不受信任的本地开发环境、无安全影响的版本披露和缺少最佳实践通常不视为漏洞，但仍可提交普通 Issue。
