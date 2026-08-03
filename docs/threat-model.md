# Renderer 威胁模型

## 资产与边界

| 资产                    | 边界              | 主要威胁                        | 当前控制                                                                             |
| ----------------------- | ----------------- | ------------------------------- | ------------------------------------------------------------------------------------ |
| Markdown 与 frontmatter | Web → Renderer    | XSS、模板注入、日志泄露         | schema、HTML 清理、正文不入日志                                                      |
| 本地图片                | 请求 → 编译器     | 路径穿越、超大图片、压缩炸弹    | 资源 allowlist、格式/尺寸/像素/总量限制                                              |
| 远程图片                | Renderer → 网络   | SSRF、重定向探测、慢响应        | 默认关闭、HTTP(S) allowlist、私网拒绝、超时                                          |
| Mermaid SVG             | 编译器 → HTML     | 脚本、foreignObject、事件属性   | 隔离渲染、严格配置、二次 SVG 清理                                                    |
| 主题 CSS                | 主题包 → 文档     | 外部加载、任意 CSS、变量注入    | Manifest 合同、分层 CSS、安全 token 校验                                             |
| 产物                    | Renderer → 下载   | 跨任务污染、永久留存、路径注入  | 随机任务 ID、sha256、短期保留、HMAC 下载签名、文件名清理                             |
| 持久任务数据            | Renderer → 数据卷 | 正文/资源泄露、损坏恢复、卷耗尽 | 700 权限、原子替换、sha256 校验、单实例写入、保留期删除；卷加密与备份 ACL 由部署负责 |
| PDF 后端                | Renderer → 子进程 | 浏览器漏洞、资源耗尽、权限扩大  | 非 root、独立工作区、超时、只读容器基线、禁用页面 JS 与外部网络                      |

## 信任假设

用户 Markdown、frontmatter、图片字节、远程响应、主题包和 HTTP header 都是不受信任输入。
Compiler 输出的 HTML 只有在通过 sanitizer 后才能进入 HTML exporter；CompiledDocument 不能
绕过协议验证直接被视为任意 HTML。

## 发布前必须复核

- 真实 PDF 分页后端的命令行、浏览器和字体版本固定并经过镜像扫描；
- PDF 页面只允许 `about:`、`data:`、`blob:` 资源，任何外部网络请求在浏览器路由层阻断；
- Renderer 生产环境设置精确 CORS 来源、HTTPS、资源网络策略和产物保留期；
- 配置 `RENDERER_DATA_DIR` 时，数据卷必须加密、限制为单个 Renderer 实例写入，并将备份纳入同一
  访问控制、删除和事故响应范围；文件存储不提供跨实例锁；
- 生产环境必须设置随机的 `RENDERER_DOWNLOAD_SIGNING_SECRET`；缺失、篡改或过期下载签名应拒绝服务；
- 远程资源代理启用前补充 DNS rebinding、IPv6、重定向链和缓存隔离测试；
- 引入用户字体、账户、分析指标或长期文档存储时重新评审数据生命周期。
