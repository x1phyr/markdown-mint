# 运维与发布演练手册

这是 `v1.0.0` 的可执行演练清单。它把代码可以自动验证的部分与建议由部署环境完成的部分分开。

## 发布前

```bash
pnpm audit --audit-level low
pnpm check
pnpm build
pnpm --filter @markdown-mint/renderer smoke:pressure
pnpm --filter @markdown-mint/renderer smoke:pdf
PDF_COMPLEX_SMOKE_THEME=technical-mint pnpm --filter @markdown-mint/renderer smoke:pdf:complex
RENDERER_BASE_URL=http://127.0.0.1:4310 node scripts/renderer-api-smoke.mjs
```

生产容器必须使用 [renderer-compose.yml](../deploy/renderer-compose.yml) 的只读根文件系统、512 MiB
`/tmp`、持久数据卷、非 root、capability drop、资源上限、精确 CORS 和签名下载密钥。发布前应保存
镜像 digest、PDF 视觉页面、API smoke 输出、数据卷快照标识和 `SHA256SUMS`。

## 回滚演练

1. 记录当前 Render Web/Renderer 部署、Renderer 镜像 digest、环境变量版本和签名密钥版本；
2. 用上一稳定版本镜像启动受限容器，运行 `/health` 和 `renderer-api-smoke.mjs`；
3. 验证旧版 PDF/缩略图下载、CORS、保留期和日志追踪仍可用；
4. 在 Render 上将 Web 与 Renderer 分别回滚到上一稳定提交/镜像；
5. 记录故障时间线、影响范围、触发器、修复和后续 fixture。

## 备份与恢复边界

Renderer 已提供单实例文件存储契约：配置 `RENDERER_DATA_DIR` 后，任务 JSON、源 Markdown/资源、
PDF/HTML 和缩略图写入同一数据卷；提交时先保存 queued 记录，终态产物按 sha256 校验并原子替换，
重启会恢复幂等键、已完成任务和中断前仍在队列中的任务。损坏的 JSON 或缺失/校验不匹配的产物会
被忽略，不会返回部分结果。默认不配置该变量时仍是内存模式，仅适合本地开发和单元测试。

这不是跨实例锁或托管数据库：同一数据卷只能由一个 Renderer 实例写入，生产备份和卷级访问控制仍由
部署环境负责。启用持久化后，备份必须覆盖整个数据卷；使用 `apps/renderer/scripts/storage-backup.mjs`
生成带清单和校验和的归档、在恢复前验证归档，并演练：

- 元数据与 PDF/HTML/缩略图的一致性备份；
- 中断任务重启后的重新排队和幂等行为；
- 保留期删除与备份保留期的冲突处理；
- 签名密钥轮换、旧链接失效和密钥恢复；
- 单实例故障、存储不可用、磁盘耗尽和恢复后的幂等行为。

## 事故响应

安全事件按 [SECURITY.md](../SECURITY.md) 私下报告；普通 P0/P1 事故需保留 request ID、trace ID、
阶段耗时、错误码和镜像 digest，但不得收集 Markdown 正文、令牌或远程 URL 查询参数。事故关闭前，
将最小复现固化为 fixture 或自动化测试，并更新威胁模型与发布阻塞项。
