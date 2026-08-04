# 迁移说明

## 当前版本：`v1.0.0`

自 `v1.0.0` 起，公开 API、`ExportRequest`、`CompiledDocument` 与 Theme Manifest 按语义化版本演进；
破坏性调整进入新的主版本，并同步更新 schema、测试 fixture、CHANGELOG 和文档。

当前导出协议的关键边界是：

- `ExportRequest` 由 `packages/document-schema` 校验，输出格式为 `pdf` 或 `html`；
- 编译器产生 `markdown-mint/compiled-document` v1；
- 主题 Manifest 当前为 v1，主题必须声明输出能力和可覆盖 token；
- Renderer 下载链接可能包含短期签名，客户端应使用任务响应中的 `downloads.*Url`，不要拼接未签名的生产 URL。

## 升级前检查

1. 阅读 CHANGELOG 的 Unreleased 和目标版本条目；
2. 运行 `pnpm check`、`pnpm build`、浏览器 E2E、PDF 视觉 smoke 和容器 API smoke；
3. 对自定义主题重新运行 Theme Manifest 合同测试，并检查 PDF/HTML 两种输出；
4. 对生产环境记录 Chromium、字体、镜像 digest、CORS、签名密钥和保留期配置；
5. 在变更前保留当前部署版本和上一稳定版本的回滚入口。

## 未来破坏性变化的要求

涉及 schema、错误码、主题协议、字体或分页行为的变更必须提供：

- 旧版本与新版本的请求/结果示例；
- 最小迁移步骤和不兼容字段清单；
- 受影响 fixture、视觉基线和回滚方案；
- 至少一个 RC 观察窗口，以及协议/隐私/运维影响已在 CHANGELOG 与相关文档中写明。
