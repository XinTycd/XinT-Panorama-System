# XinT Panorama System：维护地图

XinT Panorama 是以网站嵌入为核心的可自行部署 720° 全景查看器。后端默认在 7210 端口提供 API、widget 和静态查看器资源；控制台默认在 7211 端口运行，用于管理图片、项目场景和热点，以及预览和调试嵌入内容。widget 展示全景图片，不承载整个项目或发布快照。本文记录当前代码结构和已实现行为，供维护者接手；产品范围与未来计划分别见 [PRODUCT.md](./PRODUCT.md) 和 [ROADMAP.md](./ROADMAP.md)。

## 运行入口

- `scripts/start-all.js` 读取运行配置并启动 API 与前端静态服务。
- `backend/index.js` 负责健康检查、图库 API、远程图片代理与静态媒体分发。
- `backend/routes/projects.js` 负责项目、场景、热点、诊断、发布与验证 API。
- `backend/api-http.js` 处理 JSON 请求体和带 CORS 的 API 响应。
- `backend/routes/gallery.js` 实现图库与分组 API；`backend/media.js` 管理安全媒体路径，`backend/media-storage.js` 统一客户端/服务端/SQLite/Turso 图片保存策略，`backend/remote-image.js` 处理远程代理。
- `backend/sqlite.js` 管理 schema v3 与迁移；`backend/store.js` 管图库和分组，`backend/project-store.js` 管项目领域数据。
- `frontend/client-media.js` 处理浏览器 IndexedDB 图片，`frontend/gallery-groups.js` 管分组操作，`frontend/toolbar-settings.js` 管工具栏偏好。
- `frontend/app.js` 提供图库与项目控制台；`frontend/panorama-viewer.js` 是控制台与 widget 共用的 viewer facade；`frontend/viewer/` 配置 PSV bundle 入口并包含简化 legacy renderer，`frontend/vendor/` 存放本地构建产物。
- `backend/public/embed.js` 与 `backend/public/widget.html` 提供嵌入式体验；静态服务从 `/assets/psv.bundle.js`、`/assets/psv.css` 提供与控制台相同的本地 viewer 资源。

## 数据与存储

SQLite 是唯一运行数据库，由 `backend/sqlite.js` 管理，默认文件为 `backend/storage/panorama.sqlite`。`backend/store.js` 管理图片元数据，`backend/project-store.js` 管理项目、场景、热点和发布快照。`backend/project-delivery.js` 负责诊断、清单哈希和发布校验。

SQLite schema 当前为 v3。新数据库首次初始化时，旧 `gallery.json` 与 `catalog.json` 会一次性迁入 SQLite；图库资源 ID 由此保留，项目 `panoramaId` 即使暂时没有对应图片也会原样保存，由诊断报告断开的资源引用。数据库初始化后不再以 JSON 文件作为运行时数据源。图库/项目元数据始终保存在本地 SQLite。图片可按新资源保存设置放在：当前浏览器 IndexedDB、本地服务端 `uploads/` 或 `encoded-images/`、本地 SQLite Base64、Turso 云端 SQLite Base64。服务端和浏览器可存原格式、Base64 或转码 JPEG/PNG/WebP；SQLite/Turso 保存 Base64，可在保存前转码。客户端图片仅供同一浏览器来源读取，不能由 widget/发布页读取。

迁移和备份恢复必须按 [DEPLOYMENT.md](./DEPLOYMENT.md) 操作。不要直接修改真实图库或运行数据库；测试必须使用隔离的 `PANORAMA_STORAGE_DIR`。

## 关键约束

- Node.js 24 或更高版本，SQLite 来自 Node 内置 `node:sqlite`。
- 图片来源由 `config.json` 的 `modes` 控制：`database`、`external`、`upload`。图库编号由后端分配。
- 图库记录有可选的 `group`（最多 64 个 Unicode 字符）；删除图库记录不删除媒体文件，且被场景引用的记录返回 409。
- 项目删除会级联清理当前场景、热点和发布记录；删除场景会清掉关联导航热点并保留已生成的发布快照。图库清空只清记录并保留媒体文件。
- 导入项目时为项目、场景和热点创建新 ID，并重映射场景关联。资源引用 ID 保留；发布历史不导入。
- 发布诊断中的错误项返回 422 并阻止发布；警告不阻止发布。远程资源和仅有元数据的资源不做联网核验，验证结果会明确标成未核验。
- 嵌入式按钮通过 `data-controls` 和 `data-hide-controls` 白名单配置。
- Viewer 默认采用 PSV，且可通过设置或 `viewer.engine` / `PANORAMA_VIEWER_ENGINE` 选择简化原球面 renderer；运行时只初始化所选引擎。PSV 使用自定义图标工具栏并关闭原生 navbar；legacy 只提供拖动观察与 zoom。console 和 widget 均不显示罗盘、遥测、品牌、全景编号、分辨率或悬浮 scene rail。旧 widget HUD tokens 仍可解析但不再产生显示项。两种引擎均无多个投影模式和双图比较。

## 测试

`npm test` 包含 backend API、SQLite、media-storage、ops、viewer-contract、viewer-adapter、legacy-viewer、viewer-assets、viewer-css、embed-controls 和 viewer-engine-config 测试。项目回归还覆盖导入失败不留部分数据、ID 重映射、并发发布版本、未知图片关联和诊断/验证报告。

接口和嵌入参数见 [API 参考](./API.md) 与 [嵌入说明](./EMBEDDING.md)。桌面 Chrome 和 390px 响应式视口已验证；真实手机、其他浏览器、真实 Turso、弱网、长时运行性能和 Docker runtime 尚未验证，不据此宣称 production ready。阶段验证记录与 viewer 迁移计划分别见 [开发日志](./DEVELOPMENT_LOG.md) 和 [现代化方案](./VIEWER_MODERNIZATION_PLAN.md)。

## 排查

- 前端无法连接：检查 `/api/health`、配置中的端口及前端 API 地址。
- 图片显示失败：确认 `modes`、资源 URL、网络可达性及 `PANORAMA_STORAGE_DIR/uploads` 权限。
- 项目诊断显示缺图：检查场景 `panoramaId` 与当前图库 ID；迁移数据时不要重写该引用。
- 迁移或恢复问题：停止服务，保留完整存储目录副本后按运维文档执行。
