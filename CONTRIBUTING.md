# Contributing to MarkdownMint

感谢你参与 MarkdownMint。项目欢迎代码、主题、fixture、文档、设计评审和问题复现。

参与即表示你同意遵守 [行为准则](CODE_OF_CONDUCT.md)，并同意你的贡献按项目的 [Apache-2.0](LICENSE) 许可证发布。项目当前不要求 CLA。

## 开始之前

- 安全问题请按 [SECURITY.md](SECURITY.md) 私下报告；
- 除拼写和显然正确的小修复外，请先创建或认领一个已接受的 Issue；
- 大型功能、协议、安全边界和跨包重构在编码前需要设计讨论或 ADR；
- 不要在未经维护者确认的情况下投入大规模实现，避免方向不一致。

## 开发环境

```bash
corepack enable
pnpm install
pnpm check
pnpm build
```

运行 Web：

```bash
pnpm dev
```

运行渲染器：

```bash
pnpm dev:renderer
curl http://127.0.0.1:4310/health
```

## 变更要求

- 使用 TypeScript strict，不使用未说明的 `any`；
- 外部输入必须通过 schema 验证；
- 不信任 Markdown、HTML、SVG、URL、字体和渲染产物；
- 缺陷修复必须添加能在修复前失败的测试或 fixture；
- PDF/HTML 共享内容逻辑，不建立两套编译管线；
- 主题变更同时验证中文、英文、PDF、HTML 和极端 fixture；
- 用户可见行为、配置、错误和限制同步更新文档；
- 不提交密钥、真实用户文档、未脱敏日志和许可证不明确的素材。

## 提交与 PR

分支示例：`feat/123-callouts`、`fix/456-wide-tables`。

提交和 PR 标题使用 Conventional Commits：

```text
feat(compiler): add footnote normalization
fix(renderer): reject redirects to private networks
docs: document image size limits
```

提交 PR 前运行：

```bash
pnpm check
pnpm build
```

PR 应保持单一目的，链接 Issue，说明测试和风险。涉及视觉变化时附前后对比；涉及性能时附可复现基准；涉及安全边界时说明威胁和控制措施。

完整流程见 [开源软件工作流](docs/opensource-workflow.md)。

## 主题贡献

新主题必须先提交设计 Issue，说明适用场景、差异化、字体与素材许可证以及组件覆盖。实现需遵守 [主题开发规范](docs/theme-authoring.md)，预览图必须由真实渲染管线生成。

## 许可证说明

除非另有明确声明，你提交的代码和文档将按 Apache-2.0 许可。你必须有权提交贡献。第三方代码、字体、图片和示例内容必须保留来源与许可证，不得复制来源不明的素材。
