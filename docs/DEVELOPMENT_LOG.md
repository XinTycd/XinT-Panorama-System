# 开发日志

本日志保留可追溯的阶段记录。日期与时间使用 Asia/Shanghai。历史记录基于可查验的前轮会话资料和留存文件整理，不补造逐条命令日志；实际验证命令与输出以链接的原始日志为准。

## 记录模板

- 日期（Asia/Shanghai）：
- 目标：
- 文件/模块：
- 命令：
- 结果：
- 限制/未验证项：
- 下一步：

## 前轮会话记录：数据层迁移、图库与项目基础

- 日期（Asia/Shanghai）：2026-11-14（按工作区提供的前轮记录日期；本节为阶段摘要，并非逐命令时间线）
- 目标：整理 SQLite 运行数据层、图库媒体存储、项目/场景/热点与交付流程，补充部署、产品和维护文档。
- 文件/模块：后端 SQLite/store/media 与项目路由、前端图库/设置/查看器、测试、部署和产品文档；具体文件见工作区变更。
- 命令：历史阶段命令未逐条留存；本节不推断或伪造命令。
- 结果：仓库包含 SQLite 单一运行库、旧 JSON 首次迁移、备份/恢复脚本、图库分组与四类图片保存位置、项目交付诊断及发布快照等实现；详细事实见 README、PROJECT_CONTEXT、DEPLOYMENT 和测试。
- 限制/未验证项：不据此声称已发布或已推送。云端 Turso 真实账号未联测；跨浏览器和移动设备检查未完成。当前 package 版本为 0.1.0，内部“Core 0.2”不表示公开发行。
- 下一步：完成查看器现代化方案评审和分轮实施；最终检查敏感运行数据是否排除在仓库之外。

## 2026-11-14：查看器现代化规划与文档整理

- 日期（Asia/Shanghai）：2026-11-14；验证时间见原始日志。
- 目标：在不声称 PSV 已集成的前提下，记录候选方案、迁移轮次、兼容验收和回滚策略；重写 GitHub 项目首页并准备仓库安全边界说明。
- 文件/模块：README、`docs/VIEWER_MODERNIZATION_PLAN.md`、本日志、ROADMAP、PROJECT_CONTEXT、VIEWER_INNOVATION、PRODUCT、CHANGELOG、`.gitignore`。
- 命令：`npm test`；`npm run check:config`。输出保存在 [2026-11-14 验证日志](./logs/2026-11-14-verification.log)。
- 结果：Node v24.14.1、npm 11.11.0；六组测试通过，配置检查退出码 0。对 `backend/storage/gallery.json` 执行 `git rm --cached -- backend/storage/gallery.json`，仅取消 Git 索引跟踪，保留本地真实文件；已添加忽略运行目录日志的规则，`docs/logs/` 审查日志仍可跟踪。
- 限制/未验证项：PSV 仍未集成；浏览器/移动端、真实 Turso、弱网和大图性能测试尚未完成。官方网页链接与版本信息于 2026-11-14 作过资料核查，不代表浏览器端到端实测；最终 diff 与链接检查结果以原始验证日志为准。GitHub API 未认证限流，未据此声称仓库最后活跃时间。线上 demo 资源加载失败只作为当时观察，不推断服务下线。
- 下一步：实施前核对 PSV 官方当前兼容文档并固定依赖版本；逐轮提供验收证据及回退。最终检查变更和索引，排除真实库、媒体、token 与客户原始数据；未经授权不推送。

## 2026-11-14：查看器引擎配置与双语项目首页

- 日期（Asia/Shanghai）：2026-11-14；原始运行/浏览器记录见 [PSV 集成日志](./logs/2026-11-14-psv-integration.log)。
- 目标：按最新决策记录 PSV 默认、简化原球面 renderer 可选的引擎配置；将 README 默认语言改为英文，并提供简体中文版本；把 API 和 embed 参数从项目首页拆分到独立文档。
- 文件/模块：`README.md`、`README.zh-CN.md`、`docs/API.md`、`docs/EMBEDDING.md`、`docs/VIEWER_MODERNIZATION_PLAN.md`、`VIEWER_INNOVATION.md`、`PRODUCT.md`、`PROJECT_CONTEXT.md`、`ROADMAP.md`、`CHANGELOG.md`。
- 命令：本节只记录文档编辑，不补造逐行命令；构建、测试和浏览器命令及结果由原始日志记录。
- 结果：文档当前描述默认 PSV、可配置选择简化原球面 renderer、同一时间只创建选中引擎；两个引擎均为标准全景，特殊投影和双图比较暂时关闭。README 默认英文并提供简体中文互链；两版均插入仅含内置 demo 和合成测试资源的本机 Chrome 截图。API 文档记录 viewer engine 优先级及本机设置接口。执行代理报告 `npm test` 十一组通过；主会话 Chrome smoke 验证两引擎、widget、设置持久化、同页切换、视角/热点、媒体 URL、工具栏 Cookie 和释放路径通过，具体输出见原始日志。
- 限制/未验证项：未测真实 Turso 账号、真实移动设备、其他浏览器、弱网、长时运行性能或 Docker runtime；Chrome smoke 不代表跨设备兼容性或性能保证。
- 下一步：按剩余兼容性与性能范围开展独立验收；再按真实需求规划切片和跨设备测试。

## 2026-11-14：查看器控件样式与响应式验收

- 日期（Asia/Shanghai）：2026-11-14；完整命令、截图检查和浏览器输出见 [PSV 集成原始日志](./logs/2026-11-14-psv-integration.log)。
- 目标：统一 PSV 与简化 legacy renderer 的常规全景查看器外观，移除 viewer HUD，复核 widget 的控件与反馈，并校正文档状态。
- 文件/模块：console 与 widget viewer 控件；README 中英文版、`VIEWER_INNOVATION.md`、`PROJECT_CONTEXT.md`、`PRODUCT.md`、`ROADMAP.md`、`CHANGELOG.md`、`docs/EMBEDDING.md`、本计划及本日志。
- 命令：主会话记录 `npm run test`（11 组测试）与 `npm run check:config` 均退出码 0；Chrome smoke 输出与详细场景见原始日志。
- 结果：本机桌面 Chrome 验证 PSV/legacy console 与 widget、viewer HUD 移除、按钮 Cookie、legacy 仅缩放与错误提示、引擎切换和当前图保持、PSV 控件恢复、两引擎四象限方位/FOV/投影、媒体 URL、资源释放及无 CDN/未捕获错误。390px 浏览器视口无横向溢出且缩放触控目标可用；README 截图为仓库内置演示图的真实 console 截图。
- 限制/未验证项：390px 是浏览器视口测试，不代表真实手机。未验收其他浏览器、真实 Turso 账号、弱网、长时运行性能或 Docker runtime；未实施多分辨率切片或真实移动设备大图性能测试。不据此声称 production ready。
- 下一步：根据实际设备和部署范围补做跨浏览器、真实移动端、真实 Turso、弱网/长时运行与 Docker 验收；无性能基准前不承诺 FPS 或大图体验。

主服务后台启动/重启被工具自动审批策略阻止，因此本次没有改变现有常驻进程；短时隔离服务验证已通过。

## 2026-11-14：项目首页与产品定位

- 更新中英文 README，统一项目介绍、功能、运行、配置、嵌入、存储、开发与文档章节；移除首页中的验收记录和查看器实现细节。
- 将产品定位统一为 720° 全景资源管理与浏览，并更新 npm 包描述。
- 本次核对 README 本地链接、JSON 元数据、版本一致性及首页定位用语；未运行应用或浏览器。历史验证记录和原始日志保留原处。

## 2026-11-14：v0.2.1 发布候选与文档整理

- 日期（Asia/Shanghai）：2026-11-14。用户指定 v0.2.1 版本及提交日期为 2026-07-29；下面的实际安装、构建、测试和配置检查均在 2026-11-14 执行，没有回填时间。
- 目标：准备 PSV 默认、简化 legacy 可选的 v0.2.1 候选，整理 GitHub 文档布局，保留 v0.2.0 的发布说明和验证历史。
- 文件/模块：版本元数据、查看器/控制台/API 文档、双语 README 与发布说明；维护、产品、部署、路线图和查看器文档归入 `docs/`，新增文档索引。详细清单和命令输出见 [v0.2.1 验证日志](./logs/v0.2.1-validation.log)。
- 命令：`npm ci`、`npm run build:vendor`、`npm test`、`npm run check:config`。11 组测试通过，配置检查通过；文档链接检查和 diff 校验结果见验证日志。
- 结果：候选包和 lockfile 版本均为 0.2.1；PSV 5.15.1 为默认引擎、legacy 为兼容选项。文档记录配置优先级、同页切换、widget 行为与实际验证边界。README 截图为仓库内置 demo 和合成项目数据；历史 Chrome 证据见 [PSV 集成日志](./logs/2026-11-14-psv-integration.log)，本轮没有重新运行浏览器。
- 限制/未验证项：真实手机、跨浏览器、真实 Turso、弱网/长时运行、切片交付、大图性能和 Docker runtime 未在本轮验证。
- 下一步：供主会话审查本次候选文件和 staged allowlist；该记录不表示本次已提交或已推送。

## 2026-11-14：PSV 生命周期与渲染优化

- 收紧 PSV 异步加载、Blob 解码、销毁、BFCache 恢复和导演动画生命周期；同步修正控制台与 widget 的迟到请求和热点导航处理。
- 关闭 PSV 进程内 Blob 缓存；按容器尺寸将画布 DPR 限制为不高于 2 且不超过 4M 像素预算。合并控制台视角通知、热点 DOM 更新和工具栏状态写入。
- `npm test`、`npm run check:config`、本轮 `node --check` 与 `git diff --check` 通过。命令输出及主会话同窗口 Edge 对照数据见 [PSV 优化日志](./logs/2026-11-14-psv-optimization.log)；本轮未自行启动浏览器。

## 2026-11-14：v0.2.2 发布候选

- 按用户指定的版本号和发布日期准备 v0.2.2 候选；发布日期为 2026-08-15，实际构建与回归检查时间为 2026-11-14。
- 同步包与锁文件、控制台显示、OpenAPI、产品与路线图版本，新增中英文发布说明；保留 v0.2.1 及更早版本记录。
- `npm test` 的 11 个脚本、`npm run check:config`、Markdown 链接和版本一致性检查均通过。命令输出见 [候选验证日志](./logs/2026-11-14-v0.2.2-validation.log)，实现和浏览器对照记录见 [PSV 优化日志](./logs/2026-11-14-psv-optimization.log)。
