# XinT Panorama System

[English](./README.md) | **简体中文**

可自行部署、用于嵌入现有网站的 720° 全景查看器。

[![Node.js 24+](https://img.shields.io/badge/Node.js-24%2B-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![SQLite](https://img.shields.io/badge/Database-SQLite-003B57?logo=sqlite)](https://sqlite.org/)
[![Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue)](./LICENSE)

## 项目背景

随着 [Insta360](https://store.insta360.com/product/virtual_tour_kit)、[RICOH THETA](https://www.ricoh360.com/tours/) 等消费级全景设备和导览套装，以及 DJI 的 [Osmo 360](https://www.dji.com/360) 相机普及，个人创作者和小型团队也更容易拍摄完整的空间影像。房产展示、场地介绍和[施工现场记录](https://www.ricoh.com/-/Media/Ricoh/Sites/com/release/2021/pdf/0113_1.pdf)等应用，也带来了通过网页远程查看空间、分享全景内容的需求。

XinT Panorama System 为现有网站提供可自行部署的 720° 全景查看器。通过脚本或 iframe 嵌入，查看器在独立 frame 中运行；控制台用于资源管理、查看器配置和嵌入效果调试。

## 嵌入网站

### 使用嵌入脚本

在网页中放置一个专用的空容器，再加入脚本。将示例域名和全景编号改为你的服务地址及图库资源编号。

```html
<div id="xint-panorama"></div>
<script
  src="https://panorama.example/embed.js"
  data-target="xint-panorama"
  data-panorama-no="1"
></script>
```

脚本会在容器中创建自适应尺寸的 iframe，并先清空容器内容。请使用专用元素挂载查看器。

### 直接使用 iframe

```html
<iframe
  src="https://panorama.example/widget?panoramaNo=1"
  title="全景查看器"
  loading="lazy"
  allowfullscreen
  style="display:block; width:100%; aspect-ratio:16/9; border:0;"
></iframe>
```

直接嵌入图片时，可使用 widget 的 `imageUrl` 查询参数；widget 会通过 XinT 服务的图片代理加载该图片。支持参数、宿主要求和图片处理方式见[嵌入说明](./docs/EMBEDDING.md)。

iframe 将查看器脚本与样式隔离在独立页面中。嵌入不会重新编码全景图片；使用原格式存储或未转码的 Base64 存储可保留原始图片字节。图片转码是单独的存储选项。实际显示细节仍受浏览器、设备和可用纹理尺寸限制。

## 快速开始

需要 Node.js 24 或更高版本。只运行 API 和嵌入查看器时：

```bash
git clone https://github.com/XinTycd/XinT-Panorama-System.git
cd XinT-Panorama-System
npm ci
npm run start:backend
```

API、widget、嵌入脚本和查看器资源默认由 7210 端口提供。管理控制台是可选组件；运行 `npm start` 会同时启动后端和 7211 端口的控制台。反向代理和存储设置见[部署指南](./docs/DEPLOYMENT.md)。

## 管理控制台

控制台用于管理全景图片、图库分组、项目场景和热点，也可预览图片并调试嵌入设置。嵌入 widget 展示单张全景图片，不会展示整个项目。

项目工作区是默认禁用的内置插件。在“插件”抽屉中使用“启用”和“禁用”按钮，可显示或隐藏项目和场景入口。状态保存在当前浏览器。

![XinT Panorama 管理控制台中的内置演示全景图](docs/assets/studio-preview.png)

图库支持上传或登记图片 URL、分组与筛选，每页浏览 8 项。项目场景和热点可通过项目 JSON 导入或导出。

嵌入接入抽屉会为选中的服务端全景图生成可复制的 iframe 和 JavaScript 代码，并提供完整、精简和无工具栏三种预设。

## 配置

在 `config.json` 的 `viewer.engine` 中选择查看器：默认值 `psv` 使用 Photo Sphere Viewer，`legacy` 使用简化的原球面查看器。本地控制台也提供相同设置。

```json
{ "viewer": { "engine": "psv" } }
```

## 图片存储

| 位置 | 图片内容 | 可用范围 |
| --- | --- | --- |
| 浏览器 | IndexedDB | 仅限当前浏览器来源；独立嵌入无法读取 |
| 服务端文件 | 图片文件或 Base64 | 由当前 XinT 服务提供 |
| SQLite | Base64 | 由当前 XinT 服务提供 |
| Turso | Base64 | 需要配置数据库地址和令牌 |

图库和项目元数据保存在本地 SQLite。存储位置和转码设置适用于新上传图片，需在运行后端的电脑上通过控制台配置。

## 开发

```bash
npm test
npm run check:config
npm run build:vendor
```

开发环境需要 Node.js 24。`npm run build:vendor` 会构建本地查看器资源；启动时也会在缺少资源时构建。

## 文档

- [文档索引](./docs/README.md)
- [部署指南](./docs/DEPLOYMENT.md)
- [API 参考](./docs/API.md)
- [嵌入说明](./docs/EMBEDDING.md)
- [变更记录](./CHANGELOG.md)，包括 [v0.2.3 发布说明](./docs/releases/v0.2.3-zh-CN.md)

## 贡献

请阅读[贡献指南](./CONTRIBUTING.md)，并通过 [GitHub Issues](https://github.com/XinTycd/XinT-Panorama-System/issues) 报告问题或提出改进建议。

## 许可

本项目采用 [Apache License 2.0](./LICENSE)；第三方组件许可见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。安全问题报告方式见[安全政策](./SECURITY.md)。
