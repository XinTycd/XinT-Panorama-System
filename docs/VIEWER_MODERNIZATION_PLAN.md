# 查看器现代化计划

## 决策

用户决定采用可配置双引擎：默认 Photo Sphere Viewer（PSV）标准等距柱状预览，也可选择简化原球面 renderer。引擎由设置页保存，配置 `viewer.engine` 为默认值，环境变量 `PANORAMA_VIEWER_ENGINE` 覆盖全部持久设置；优先级为环境变量 > 本地设置 > `config.json` > 默认 `psv`。同一时间只初始化所选引擎，不并行运行或自动故障切换。两种引擎都只显示标准全景；星球、隧道、晶球和同视角双图比较暂时关闭。热点/漫游继续通过统一 viewer 契约工作，后续扩展另行评估。

系统设置通过 `PUT /api/settings/viewer` 保存选择；`GET /api/config` 返回当前引擎及是否被环境变量锁定。持久选择存储在 `viewer-settings.json`，且只能由后端所在电脑的本机控制台修改。环境变量强制锁定时，控制台无法覆盖。

实施锁定 `@photo-sphere-viewer/core` 5.15.1。PSV 项目采用 MIT 许可；准确依赖解析由 `package-lock.json` 固定。第三方许可须另行检查并随 bundle 保留 LICENSE/NOTICES。当前集成进度及验收证据见[开发日志](./DEVELOPMENT_LOG.md)。

官方参考（资料核查日期：2026-11-14）：[PSV 官方文档](https://photo-sphere-viewer.js.org/)、[Releases](https://github.com/mistic100/Photo-Sphere-Viewer/releases)、[等距切片 adapter](https://photo-sphere-viewer.js.org/guide/adapters/equirectangular-tiles.html)、[Navbar guide](https://photo-sphere-viewer.js.org/guide/navbar.html)、[Virtual Tour plugin](https://photo-sphere-viewer.js.org/plugins/virtual-tour.html)。本次仅使用 PSV 核心标准预览，不接入切片 adapter 或 virtual tour plugin。备选比较： [Pannellum](https://github.com/mpetroff/pannellum)（轻量，见[官方说明](https://pannellum.org/documentation/overview/)）和 [Marzipano](https://github.com/google/marzipano)（仓库显示 2026-04-20 归档）不在本轮实施范围。

## 预期集成形态

- `frontend/panorama-viewer.js` 提供应用 viewer facade；按设置创建 PSV 或简化原球面 renderer，保持相同的视角、媒体和业务 API。PSV 控制台与 `backend/public/widget.html` 共用同一版本的本地 PSV bundle 和 CSS，不从 CDN 拉取运行脚本。
- `npm run build:vendor` 根据锁定依赖生成 bundle、样式及第三方许可记录；从源码首次运行需 `npm ci` 安装含 esbuild 的开发依赖，再由启动流程生成缺失产物。Docker runtime 镜像预先携带生成物，运行阶段无需 devDependency。
- 用户选择的引擎应用于控制台与 widget。旧 `mode` 特殊视图统一映射到 `expand`；保留嵌入参数解析兼容，不展示特殊模式控件；比较控件及其实现关闭。引擎选择走本机设置、配置或环境变量，不以 `viewer=legacy` URL 参数切换。
- 视角兼容须保持控制台、项目演示和 widget 使用一致的视角坐标映射。当前 facade 将旧 yaw 映射为 PSV yaw = wrap(old yaw + 180°)，再转换为弧度；pitch 从角度转弧度；旧垂直 FOV 30°–105°与 PSV zoom 0–100 线性映射。迁移验收应记录方向样例与数值边界。
- viewer 生命周期需覆盖切换图片、加载失败、清空与 dispose；从四类存储路径验证图片读取：浏览器 IndexedDB Blob、服务端媒体/远程代理 URL、本地 SQLite Base64 资源、Turso Base64 资源。客户端 IndexedDB 图片只能由原浏览器来源读取，不能供独立 widget 使用。

## 交付轮次

### A. PSV 标准预览与双引擎配置 — 已完成

**范围：** 固定精确依赖；打包本地 viewer 资源；连接控制台与 widget facade；规范化旧 mode 为 `expand`；移除特殊模式和双图比较入口；提供显式 PSV/简化 legacy renderer 配置，保留实际需要的控件、项目热点和嵌入 API。

**完成证据：** 自动化测试通过；PSV bundle 与许可文件可由构建和启动流程生成；控制台与 widget 使用相同引擎选择；本机 Chrome smoke 覆盖 PSV/legacy、widget、引擎持久化、同页切换、项目场景与热点、四象限 yaw/FOV、Data URL/Blob/SQLite 图片、工具栏 Cookie、clear/reload/dispose、无 CDN 请求及无未捕获错误。完整记录见 [原始日志](./logs/2026-11-14-psv-integration.log)。

**恢复策略：** 用户可通过配置明确选择 legacy renderer；不会在运行时自动回退或同时启动两个引擎。图片和数据库数据不因 viewer 切换而改写。

### B. 控件与交互收敛 — 已完成

PSV 使用自定义的常规全景查看器图标工具栏，并设置 `navbar: false` 关闭 PSV 原生 navbar。控制台包含上一张、下一张、缩放、自动旋转、导演演示、重置、全屏和更多设置；widget 按嵌入白名单显示相应操作。两处均不显示罗盘、遥测、品牌、全景编号、分辨率或悬浮场景轨道。简化原球面 renderer 只提供拖动观察与两个缩放按钮；旧工具栏 Cookie 不会隐藏 legacy 缩放按钮。widget 在加载或失败时保留必要状态反馈。

本机 Chrome 已检查两引擎的 console/widget、控件 Cookie、390px 响应式视口、44px 触控目标、引擎切换与恢复。390px 是浏览器视口测试，不等于真实移动设备验收；真实手机、其他浏览器、Turso、弱网、长时运行性能与 Docker runtime 仍待验证。证据见[原始日志](./logs/2026-11-14-psv-integration.log)。

### C. 资源与大图策略 — 未实施

目前仅完成常规 viewer 接入不代表具备切片或大图性能优化。后续若实施缩略图、低清预览或按视野/层级切片，按浏览器 IndexedDB、本地文件、本地 SQLite、Turso 分别评估生成、失败重试、缓存失效、版本标记、清理与备份。SQLite/Turso 中的 Base64 源图片副本保持原位，衍生资源可再生；“源图片副本”指当前保存内容，既有设置可能已转码，不表示另存上传前字节。测算云端存储与流量成本，不假设免费。

### D. 后续 viewer 插件与漫游能力 — 未实施

项目热点的定位、点击和场景导航属于当前基础能力，已纳入 Chrome smoke。此轮未实施更丰富的 PSV plugin/adapter 漫游功能或额外 viewer 效果。后续扩展需列出需求、实现依据和验收用例后再实施。

### E. 兼容性与性能实测 — 未完成

计划测试 Windows Chrome/Edge、Firefox 与真实 iOS/Android 设备，覆盖后台离屏与恢复、快速切图、网络失败/恢复、弱网、长时运行和 WebGL 资源释放。固定 2K、4K、8K、16K 样本并记录设备/浏览器、图片字节数、首次可视、内存、切换耗时和失败率。桌面 Chrome 与 390px 响应式视口已检查，但不代表真实移动设备、其他浏览器的兼容性或性能结果；未对 Turso 账号、真实移动端、弱网、长时运行或 Docker runtime 进行验收，不承诺未测 FPS。

## 协作与状态记录

本轮由主会话审阅目标与范围，执行代理实现，主会话复核代码及验收证据；有测试或浏览器证据后才更新完成状态。浏览器测试最多使用一个隔离实例，只清理本次自动化创建的浏览器进程。状态与证据写入 [`docs/DEVELOPMENT_LOG.md`](./DEVELOPMENT_LOG.md) 和当轮 raw log。本计划不是对未来贡献者的工具或模型限制。
