# XinT Panorama System

[English](README.md) | **简体中文**

一个用于自托管管理、浏览和嵌入 360° 全景资源的系统。

[快速开始](#快速开始) · [功能](#功能) · [配置](#配置) · [文档](#文档) · [参与贡献](CONTRIBUTING.md)

## 项目背景

XinT Panorama System 将全景图片、项目与场景引用、可嵌入预览放到同一套自托管流程中。项目起点是整理全景图片以及维护图库、项目场景和外部页面之间的资源引用时，手工处理比较分散。

本版更新了控制台和资源处理流程，并将元数据迁移到 SQLite，以简化本地部署。默认查看器采用标准球面全景渲染方式，提供拖动浏览和缩放控件。

![使用内置演示全景图的控制台预览](docs/assets/legacy-preview.png)

*截图使用仓库内置演示全景图和合成项目数据。*

## 快速开始

需要 Node.js 24 或更高版本及 npm。

```bash
npm ci
npm start
```

控制台地址：<http://127.0.0.1:7211>；API 地址：<http://127.0.0.1:7210>。只校验配置而不启动服务，可运行 `npm run check:config`。

Docker Compose 部署请参阅[部署指南](DEPLOYMENT.md#docker-compose)。

## 功能

- 浏览全景图库、创建分组并筛选；客户端每页显示 8 项。
- 创建项目和场景、放置热点，并在场景流程中引用图库全景图。
- 通过脚本标签或独立 widget 地址嵌入全景查看器。
- 为新保存的图片选择浏览器 IndexedDB、本地文件、本地 SQLite 或 Turso SQLite；元数据始终保存在本地 SQLite 数据库。
- 根据存储位置选择保留源图片或转码为 JPEG、PNG、WebP，并设置适用的质量参数。
- 使用附带脚本备份和恢复 SQLite 数据库及服务端图片文件。

## 查看器

本版使用简化的球面查看器，支持拖动浏览及放大、缩小控件。旧版多投影视图和双图比较不包含在本版中。

## 配置

启动前可编辑 `config.json`。默认使用 SQLite 和本地存储：

```json
{
  "modes": ["database", "external", "upload"],
  "viewer": { "engine": "legacy" },
  "database": {
    "driver": "sqlite",
    "storageDir": "backend/storage"
  },
  "server": {
    "backend": { "host": "127.0.0.1", "port": 7210 },
    "frontend": { "host": "127.0.0.1", "port": 7211 }
  }
}
```

本版查看器固定使用 `legacy`。`PANORAMA_CONFIG` 可指定其他配置文件；`PANORAMA_STORAGE_DIR`、`PANORAMA_HOST`、`PANORAMA_PORT`、`FRONTEND_HOST`、`FRONTEND_PORT` 可覆盖存储目录和监听地址。`PANORAMA_APP_MODES` 接受逗号分隔的 `database`、`external` 和 `upload`。不支持 MySQL；首次启动时会在适用情况下将旧 JSON 图库数据迁移到 SQLite。

## 图片存储

图库、项目、场景和设置元数据保存在存储目录下的本地 `panorama.sqlite`。图片存储设置作用于新保存的图片：

| 图片位置 | 图片数据 | 说明 |
| --- | --- | --- |
| 浏览器 | IndexedDB | 仅原浏览器和站点来源可读取，嵌入 widget 无法访问。 |
| 本地服务端 | `uploads/` 文件，或 `encoded-images/` 中的 Base64 | 支持保留图片字节或转码。 |
| 本地 SQLite | `panorama.sqlite` 中的 Base64 | 可选 Base64 或转码，不支持原格式存储。 |
| Turso SQLite | 配置的 Turso 数据库中的 Base64 | 可选 Base64 或转码；需由部署者配置账号凭据和连接。 |

SQLite 图片模式使用 Base64 数据，并可在保存前转码。转码可能改变保存的源图片副本；系统不承诺额外保留上传时的原始字节。云服务容量和成本取决于部署者所用的 Turso 方案。

## 开发

```bash
npm test
npm run check:config
```

测试使用临时存储和合成样本。本地启动应用请运行 `npm start`。运行数据写入配置的存储目录；请勿将该目录纳入源码控制，并由部署者自行纳入备份。

## 文档

- [部署与运维](DEPLOYMENT.md)
- [API 参考](docs/API.md)
- [嵌入指南](docs/EMBEDDING.md)
- [版本说明](docs/releases/v0.2.0-zh-CN.md)
- [English README](README.md)

## 参与贡献与安全

欢迎通过仓库的[问题跟踪器](https://github.com/XinTycd/XinT-Panorama-System/issues)反馈问题或贡献代码，详见[贡献指南](CONTRIBUTING.md)。安全问题请参阅[安全政策](SECURITY.md)。发布 fork 或版本前，请检查暂存文件清单，确认其中没有运行数据库、上传图片、凭据或备份。

## 许可证

项目采用 [Apache License 2.0](LICENSE)。仓库中的 Three.js 浏览器构建保留了上游许可证声明，详见[第三方许可说明](THIRD_PARTY_NOTICES.md)。
