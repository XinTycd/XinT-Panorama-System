# XinT Panorama System

[English](./README.md) | **简体中文**

自托管 360° 全景资源管理与预览系统。

[![Node.js 24+](https://img.shields.io/badge/Node.js-24%2B-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![SQLite](https://img.shields.io/badge/Database-SQLite-003B57?logo=sqlite&logoColor=white)](https://sqlite.org/)
[![Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue)](./LICENSE)

**版本 0.2.1 · 2026-07-29。** 查看器默认使用 Photo Sphere Viewer（PSV）5.15.1，也可选择简化的原球面 renderer；同一时间仅运行选定的一个引擎。桌面 Chrome 与 390px 响应式视口已检查；真实手机、其他浏览器、Turso、弱网长时运行和 Docker runtime 尚未验证。

[快速开始](#快速开始) · [功能](#功能) · [部署与运维](./docs/DEPLOYMENT.md) · [文档](#文档) · [贡献](#贡献) · [安全](#安全)

## 项目背景

全景图片常散落在不同目录和链接里，项目中的场景与图片引用也不易一处维护；需要在网站或交付页面展示时，还得单独处理嵌入方式。XinT Panorama 把图库、项目场景、热点和网页预览放在一个可自行部署的系统中。

这次整理将运行数据库从 MySQL 改为 SQLite，减轻本地部署时的配置和维护负担；图片则可按使用场景保存在浏览器、本地服务端、SQLite 或 Turso。查看器默认使用 Photo Sphere Viewer，也可选择简化的原球面 renderer；项目保留图库、场景和热点等业务能力，暂时关闭特殊投影和双图比较。

![XinT Panorama 控制台显示内置演示全景图](docs/assets/studio-preview.png)

*控制台内置演示全景图预览。*

## 快速开始

需要 Node.js 24 或更高版本。

```bash
npm ci
npm start
```

打开控制台 <http://127.0.0.1:7211>；API 默认监听 <http://127.0.0.1:7210>。`npm start` 同时启动前后端。第一次启动会在 `backend/storage/panorama.sqlite` 初始化数据库；若该目录含旧版 `gallery.json` 或 `catalog.json`，会一次性迁移到 SQLite。迁移前请备份旧存储目录。

Docker Compose、配置、备份和恢复说明见[部署指南](./docs/DEPLOYMENT.md)。

## 功能

- 管理本地上传、远程链接或已有地址的全景资源；按命名分组筛选，控制台每页显示 8 项。
- 使用 SQLite 保存图库、项目、场景、热点和发布记录；项目可导入/导出 JSON，并生成交付诊断与发布校验。
- 使用全景查看器浏览图片，默认 PSV，也可配置选择简化的原球面 renderer。PSV 使用自定义图标工具栏，外观接近常见全景查看器，并关闭 PSV 原生 navbar；legacy 仅提供拖动观察与缩放按钮。查看器不显示罗盘、遥测、品牌、全景编号、分辨率或悬浮场景轨道。
- 可配置 PSV 控制台工具栏按钮显示偏好，并通过浏览器 Cookie 保存；legacy 的两个缩放按钮始终显示。widget 控件通过嵌入参数配置，不使用控制台 Cookie。
- 图片可保存到当前浏览器 IndexedDB、本地服务端文件、本地 SQLite 或 Turso 云端 SQLite；服务端和浏览器支持原格式、Base64 与 JPEG/PNG/WebP 转码。元数据始终保存在本地 SQLite。
- 提供 `embed.js` 与 iframe widget，可将资源嵌入其他页面。
- 提供 SQLite 与媒体文件备份/恢复脚本。

## 选择查看器引擎

系统设置可选择预览引擎，默认 `psv`；也可选 `legacy` 使用简化的原球面 renderer。两个引擎均只提供标准全景浏览，不含多投影模式或双图比较。优先级为环境变量 `PANORAMA_VIEWER_ENGINE`、本地 `viewer-settings.json`、`config.json` 的 `viewer.engine`，最后默认 `psv`；环境变量强制时选择器会禁用。控制台保存后会在当前页面重建查看器并保留当前图片与视角；待上传队列非空时不能切换。widget 初始化时读取同一全局配置，已打开的 widget 不会跨刷新热同步。一次只运行一个引擎。widget 只显示操作图标，加载或错误时会显示必要反馈；旧 `brand`、`panorama-no`、`resolution` 控件 token 仍可解析，但不再显示对应 HUD。

```json
{ "viewer": { "engine": "psv" } }
```

## 嵌入示例

```html
<div id="panorama"></div>
<script
  src="https://your-host.example/embed.js"
  data-target="panorama"
  data-panorama-no="1"
></script>
```

完整参数和控件白名单见[嵌入说明](./docs/EMBEDDING.md)。通过 HTTPS 页面嵌入时，服务端也应使用 HTTPS。

## 图片存储

| 位置 | 图片内容 | 读取范围 |
| --- | --- | --- |
| 浏览器 | IndexedDB | 同一浏览器来源；不能供 widget 读取 |
| 本地服务端 | 原格式/转码文件或 Base64 | 当前 XinT 服务 |
| 本地 SQLite | Base64，可转码后保存 | 当前 XinT 服务 |
| Turso SQLite | Base64，可转码后保存 | 配置的 Turso 数据库 |

图片存储设置仅能从运行后端的电脑上的 localhost 控制台更改。Turso 需要自行配置数据库 URL 与写入令牌。完整细节见[部署指南](./docs/DEPLOYMENT.md)。

## 开发

```bash
npm test
npm run check:config
npm run build:vendor
```

开发环境要求 Node.js 24；`sharp` 用于图片转码。从源码首次运行时，`npm ci` 会安装构建依赖；`npm run build:vendor` 或应用启动流程会按锁定版本/hash生成缺失的 viewer 资源和许可文件。生产 Docker runtime 镜像已带这些资源，运行阶段不需要构建依赖。依赖版本见 `package.json` 与 `package-lock.json`。桌面 Chrome 已检查两个引擎、widget 与 390px 响应式视口；这不代表真实手机或跨浏览器验收。真实 Turso、弱网/长时运行和 Docker runtime 尚未验证。具体记录见[PSV 集成日志](./docs/logs/2026-11-14-psv-integration.log)与[开发日志](./docs/DEVELOPMENT_LOG.md)。

### 选择查看器引擎

设置页保存引擎选择；配置文件 `viewer.engine` 默认为 `psv`，可选 `legacy` 使用简化的原球面 renderer。两者都只显示标准全景，不含多个投影模式或双图比较。环境变量 `PANORAMA_VIEWER_ENGINE` 优先级最高，其次是本地设置、配置文件，最后默认 `psv`。控制台与 widget 使用相同选择，单次只创建所选的一个引擎：

```json
{ "viewer": { "engine": "psv" } }
```

## 代码结构

```text
backend/       API、SQLite、媒体存储与路由
  public/      embed.js、widget.html
frontend/      控制台、viewer facade、浏览器媒体模块；viewer/构建入口
lib/           HTTP 与运行配置
scripts/       启动、配置校验、备份与恢复
tests/         API、数据库、媒体、运维、viewer 与 embed 测试
docs/          API、嵌入、开发和迁移文档
```

## 文档

- [API 参考](./docs/API.md)
- [嵌入参数](./docs/EMBEDDING.md)
- [部署、配置、存储与备份](./docs/DEPLOYMENT.md)
- [文档索引](./docs/README.md)
- [产品范围](./docs/PRODUCT.md)
- [维护地图](./docs/PROJECT_CONTEXT.md)
- [查看器说明](./docs/VIEWER_INNOVATION.md)
- [查看器现代化计划](./docs/VIEWER_MODERNIZATION_PLAN.md)
- [开发日志](./docs/DEVELOPMENT_LOG.md)
- [变更记录](./CHANGELOG.md)
- [v0.2.1 发布说明](./docs/releases/v0.2.1-zh-CN.md)
- [v0.2.1 English release notes](./docs/releases/v0.2.1.md)

## 贡献

欢迎通过 [GitHub Issues](https://github.com/XinTycd/XinT-Panorama-System/issues) 报告问题或提出改进；提交代码前请阅读[贡献指南](./CONTRIBUTING.md)。

## 安全

请勿在 Issue 或公开提交中包含真实数据库、图片、访问令牌或客户数据。报告安全问题请阅读[安全政策](./SECURITY.md)。

## 许可

本项目由 XinTycd 发布，使用 [Apache License 2.0](./LICENSE)。Photo Sphere Viewer 使用 MIT 许可；构建输出包含 PSV 与 Three.js 的许可文件及[第三方说明](./THIRD_PARTY_NOTICES.md)。
