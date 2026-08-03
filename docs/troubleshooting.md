# 故障排查

## 点击生成后提示无法连接 Renderer

本地分别运行：

```bash
pnpm dev:renderer
pnpm dev:web
```

如果 Renderer 不在默认地址，设置 `NUXT_PUBLIC_RENDERER_URL`；跨域部署时同时设置
`RENDERER_CORS_ORIGIN`。先访问 Renderer 的 `/health`，再检查浏览器控制台中的请求来源。

## 文档能导入但生成失败

查看生成页中的错误码与诊断。`compile-diagnostics` 表示 Markdown 或资源产生了阻塞诊断，
`theme-not-found` 表示主题版本未部署，`timeout` 表示任务超过服务端时间限制。减少图片大小、
关闭远程资源或拆分长文档后可以重试。

## HTML 与 PDF 的视觉不同

两种输出共享同一份编译 HTML，但 PDF 还经过分页后端。检查页面尺寸、方向、边距、字体镜像和
主题的 `print.css`；不要在 Markdown 中加入任意 CSS 来修补分页问题，应把最小案例固化为
fixture 后修复主题层。

## 草稿没有恢复

草稿使用浏览器 IndexedDB。无痕窗口、清除站点数据或浏览器策略可能禁用它；导出流程不依赖
草稿存储，仍可重新粘贴或上传 Markdown。
