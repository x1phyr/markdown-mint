# 开源软件工作流

本工作流适用于 MarkdownMint 的产品、代码、主题、文档和发布。目标是让外部贡献可预测、维护者负担可控，并让安全与排版质量不因开放协作而下降。

## 1. 工作项入口

所有非琐碎变更从 Issue 开始：

- Bug：必须包含可复现输入、预期/实际结果、环境和脱敏产物；
- Feature：描述用户问题、拟议范围、非目标和验收标准；
- Theme：附适用场景、视觉方向、组件覆盖和字体许可；
- Security：禁止公开 Issue，使用私有漏洞报告流程；
- Maintenance：依赖、基础设施、重构和开发体验。

以下改动可以直接提交 PR：拼写、失效链接、显然正确的小型测试修复、维护者明确标记为 `good first issue` 的任务。

## 2. Triage

维护者按以下顺序处理新 Issue：

1. 确认是否安全敏感；
2. 检查是否重复、是否符合产品边界；
3. 补齐复现、验收标准和影响版本；
4. 设置类型、优先级、领域、状态和里程碑；
5. 决定 `accepted`、`needs-info`、`blocked`、`duplicate` 或 `declined`。

推荐标签体系：

| 维度   | 标签                                                                                  |
| ------ | ------------------------------------------------------------------------------------- |
| 类型   | `type:bug` `type:feature` `type:theme` `type:docs` `type:maintenance`                 |
| 优先级 | `priority:p0` `priority:p1` `priority:p2` `priority:p3`                               |
| 领域   | `area:web` `area:renderer` `area:compiler` `area:themes` `area:security` `area:infra` |
| 状态   | `status:needs-info` `status:accepted` `status:blocked` `status:ready`                 |
| 贡献   | `good first issue` `help wanted`                                                      |

优先级定义：

- P0：安全事件、数据泄露、主分支/生产完全不可用；
- P1：核心导出失败、产物严重错误、无合理绕行；
- P2：重要能力或质量问题，有绕行；
- P3：体验、优化、清理和长期建议。

公开项目不承诺支持 SLA；内部目标是 7 天内完成首次 triage，`needs-info` 14 天无响应后可关闭，用户补充后可重新打开。

## 3. 分支与提交

- 默认分支：`main`，始终保持可发布；
- 分支命名：`feat/123-short-name`、`fix/456-short-name`、`docs/short-name`、`chore/short-name`；
- 禁止长期存在的开发分支；大型工作拆成可独立合并的垂直切片；
- 提交采用 Conventional Commits：`feat:`、`fix:`、`docs:`、`test:`、`refactor:`、`perf:`、`build:`、`ci:`、`chore:`；
- 破坏性变更使用 `!` 和 `BREAKING CHANGE:`，在 v1.0 前也必须记录迁移影响；
- PR 默认 squash merge，合并标题必须是合法的 Conventional Commit。

提交示例：

```text
feat(compiler): add callout normalization
fix(theme): keep code captions with the following block
docs: clarify remote asset limits
```

## 4. Pull Request 生命周期

### 开始前

- Issue 已接受并有明确验收标准；
- 高风险改动先写 ADR 或设计说明；
- PR 控制在一个问题域，避免夹带无关重构；
- 主题视觉改动准备前后对比；
- 用户可见变更准备文档与 CHANGELOG 条目说明。

### Draft PR

尽早开 Draft PR，用于验证接口、CI 和方向。Draft 可以不完整，但必须说明剩余工作和已知风险，不应请求正式批准。

### Ready for review

转为 Ready 前，作者必须：

- 完成模板中的范围、测试、安全和视觉检查；
- 运行 `pnpm check` 与相关构建；
- 将缺陷固化为测试或 fixture；
- 更新用户文档、协议、错误码和迁移说明；
- 自审 diff，删除调试代码、生成物和无关格式化；
- 确认没有提交用户文档、密钥、字体或未授权素材。

### Review

至少一名具备对应领域权限的 reviewer 批准。以下改动需要两名维护者或一名维护者加领域 owner：

- 安全边界、远程资源和渲染隔离；
- `document-schema`、主题合同和公开 API 的破坏性变化；
- 发布、权限、工作流和依赖来源；
- 许可证、治理和行为准则；
- 大范围视觉基线更新。

reviewer 检查正确性、边界、测试、错误处理、可观测性、安全、性能、兼容性、文档和维护成本。风格问题优先交给自动化工具。

### Merge

只有在必需检查通过、讨论解决、批准有效且分支为最新状态时合并。作者不能自行绕过门禁。紧急安全修复可以缩短公开讨论，但仍需私下 review、测试和事后记录。

## 5. CI 门禁

每个 PR 至少执行：

- 安装锁文件依赖；
- ESLint、Prettier 和 TypeScript；
- 单元测试和覆盖率；
- 全量构建；
- 依赖差异审查；
- CodeQL；
- 后续里程碑加入 E2E、视觉回归、容器扫描和许可证扫描。

分支保护应要求：

- PR 才能合并到 `main`；
- 至少 1 个批准，代码所有者规则启用后要求 owner review；
- 新提交使旧批准失效；
- 所有讨论解决；
- `CI / quality` 与 `CI / build` 为必需检查；
- 禁止 force push 和删除 `main`；
- 管理员同样遵守规则。

## 6. 版本与发布

项目遵循 Semantic Versioning：

- `0.y.z`：开发期，minor 允许协议调整但必须记录；
- `1.y.z`：稳定期，破坏性变化只进入 major；
- `-alpha.n`、`-beta.n`、`-rc.n`：预发布渠道。

发布步骤：

1. 创建 release Issue，列出范围、阻塞项、迁移、安全、文档和回滚；
2. 从 `main` 准备发布 PR，更新版本、CHANGELOG 和兼容说明；
3. 在干净环境运行全量门禁并生成候选产物；
4. 合并后创建签名/受保护标签 `vX.Y.Z`；
5. 标签触发 GitHub Actions 重跑质量门禁并创建 GitHub Release；
6. Release 包含变更、破坏性变化、升级、已知问题、产物和 SHA256；
7. 发布后执行 smoke test，观察错误率，并确认回滚路径；
8. 关闭 release Issue，未完成内容返回 backlog。

v1.0 前不自动发布 npm 包。任何包首次公开发布必须先完成包名、权限、provenance、2FA、导出面和许可证评审。

## 7. 缺陷与安全修复

- 普通回归：先添加失败测试，再修复；
- 主题缺陷：添加最小 fixture、结构断言和必要视觉基线；
- P0/P1：建立负责人、影响范围、缓解、修复、验证和沟通记录；
- 安全漏洞：遵循 [SECURITY.md](../SECURITY.md)，在修复发布前限制细节；
- 修复进入支持分支时使用最小 cherry-pick，不把无关功能带入 patch。

## 8. 依赖与供应链

- Dependabot 每周检查 pnpm 与 GitHub Actions；
- 小型、低风险更新可批量，渲染器、解析器、浏览器、字体和安全相关依赖单独 PR；
- 禁止未经审查的安装脚本、二进制下载和浮动 URL；
- 锁文件必须提交，CI 使用 `--frozen-lockfile`；
- 发布镜像固定基础镜像 digest，生成 SBOM 并记录第三方许可证；
- 高危漏洞在发布前为 0；无法立即修复时记录影响、缓解和到期日。

## 9. 决策与治理

普通实现通过 Issue 和 PR 决定；跨包边界、长期兼容性、安全或不可逆决策使用 ADR。维护者寻求共识，无法形成共识时按 [GOVERNANCE.md](../GOVERNANCE.md) 决定并记录理由。

路线图是优先级工具，不是对贡献者的承诺。维护者可以因为产品边界、风险、维护成本或资源拒绝功能，即使实现本身可行。
