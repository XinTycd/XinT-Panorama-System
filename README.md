# 芯添全景系统 (XinT-Panorama-System)

一个用于构建 **720 全景图片快速加载、预览、上传、代理与嵌入式展示** 的开源系统。

本项目核心目标不是单独做一个页面，而是提供一套可复用的前后端分离方案：

- 后端独立运行，提供图库管理、媒体代理、上传存储与嵌入资源
- 前端独立运行，作为普通网站直接消费后端 API
- 普通前端网站可直接通过 `embed.js` 按编号嵌入后端内容
- Electron 专属窗口客户端可一键拉起前后端并独立运行

## 作者信息

- 原作者：`XinTycd`
- 项目名称：`XinT-Panorama-System`
- 项目协议：`Apache License 2.0`

## 项目特性

- 前后端分离，前端不直接耦合本地文件系统
- 后端提供跨域 API，可被普通前端站点直接调用
- 支持将本地全景图上传到后端并持久化存储
- 支持注册远程全景图 URL，由后端代理输出，前台直接显示
- 支持 720 全景图拖拽视角、滚轮缩放、自动旋转、全屏预览
- 支持图库列表、上一张 / 下一张切换
- 支持后端演示数据一键写入
- 支持每张全景图自动分配独立编号 `panoramaNo`
- 支持后端嵌入脚本 `embed.js`
- 支持 Electron 桌面专属窗口客户端

## 适用场景

- 本地图片预览系统
- 项目交付演示站
- 全景图素材管理后台
- 普通前端网站调用全景图服务
- 展厅、地产、旅游、展示馆等 720 内容快速接入

## 技术架构

```text
frontend 独立站点
    |
    |  HTTP / JSON / CORS
    v
backend 独立服务
    |- 图库数据持久化
    |- 远程图片代理
    |- Base64 上传存储
    |- 嵌入式 widget / embed.js
    |- 演示资源输出

electron 客户端
    |- 启动 backend
    |- 启动 frontend
    |- 打开独立窗口
```

## 技术栈

### 后端

- 运行时：`Node.js`
- 服务实现：原生 `http / https / fs / path / url`
- 数据存储：本地 `JSON` 文件持久化
- 媒体处理：远程图片代理、本地 Base64 上传落盘
- 接口风格：`REST-like JSON API`

### 前端

- 页面结构：`HTML5`
- 视觉样式：`CSS3`
- 交互逻辑：原生 `JavaScript`
- 3D 渲染：`Three.js`
- 全景显示方式：球体反转贴图 + 鼠标交互视角控制

### 桌面端

- 客户端容器：`Electron`
- 运行模式：启动本地后端 + 启动前端静态服务 + 加载独立窗口

### 工程特点

- 不依赖 React、Vue、Webpack、Vite
- 不依赖数据库，默认可直接本地运行
- 前后端完全分离，普通前端项目可直接复用后端能力

## 目录结构

```text
.
├─ backend/
│  ├─ public/
│  │  ├─ demo-panorama.svg
│  │  ├─ embed.js
│  │  └─ widget.html
│  ├─ storage/
│  ├─ index.js
│  └─ store.js
├─ electron/
│  └─ main.js
├─ frontend/
│  ├─ vendor/
│  │  └─ three.min.js
│  ├─ app.js
│  ├─ index.html
│  └─ styles.css
├─ scripts/
│  ├─ frontend-server.js
│  └─ start-all.js
├─ tests/
│  └─ backend.test.js
├─ .gitignore
├─ LICENSE
├─ package.json
└─ README.md
```

## 运行方式

### 1. 单独运行后端

```bash
npm run start:backend
```

默认地址：

```text
http://127.0.0.1:7210
```

后端职责：

- 提供 API
- 提供媒体代理
- 保存上传图片
- 提供普通网站嵌入脚本

### 2. 单独运行前端

```bash
npm run start:frontend
```

默认地址：

```text
http://127.0.0.1:7211
```

前端首次打开时默认连接：

```text
http://127.0.0.1:7210
```

你也可以通过地址参数指定 API：

```text
http://127.0.0.1:7211/?api=http://127.0.0.1:7210
```

### 3. 同时启动前后端

```bash
npm run start:all
```

### 4. 启动桌面客户端

先安装依赖：

```bash
npm install
```

再启动：

```bash
npm run start:desktop
```

Electron 客户端会自动拉起前后端，然后打开独立窗口。

## 前后端分离说明

本仓库的前端与后端是明确分开的：

- `backend/` 可以独立部署到服务器或本机服务
- `frontend/` 可以单独作为静态站点部署
- 前端只通过 HTTP API 调用后端
- 普通网站也可以不使用 `frontend/`，直接接入 `backend/` API 或嵌入 `embed.js`

这意味着你未来完全可以：

- 保留当前后端不变，重写一个 React/Vue 前端
- 保留当前前端不变，把后端部署到内网或云端
- 在任意业务网站中局部嵌入后端输出的图库内容

## 开源协议信息

### 本项目源码协议

- 项目协议：`Apache License 2.0`
- 协议文件：[LICENSE](./LICENSE)
- 版权归属：`Copyright (c) 2026 XinT-Tech`

## 后端 API

### 健康检查

```http
GET /api/health
```

### 获取图库

```http
GET /api/gallery
```

返回值中每个全景图都会带有独立编号字段：

```json
{
  "panoramaNo": 1001
}
```

### 按编号获取单张全景图

```http
GET /api/panoramas/by-no?no=1001
```

### 写入演示数据

```http
POST /api/gallery/seed-demo
Content-Type: application/json
```

### 清空图库

```http
POST /api/gallery/clear
Content-Type: application/json
```

### 注册远程全景图

```http
POST /api/panoramas/register
Content-Type: application/json

{
  "name": "展示大厅",
  "url": "https://example.com/panorama.jpg"
}
```

### 上传本地图片到后端

```http
POST /api/panoramas/upload-base64
Content-Type: application/json

{
  "name": "room-01",
  "dataUrl": "data:image/jpeg;base64,..."
}
```

### 远程媒体代理

```http
GET /api/panoramas/proxy?url=https%3A%2F%2Fexample.com%2Fpanorama.jpg
```

## 前端网站接入方式

### 方式一：直接嵌入组件

```html
<div id="panorama-widget"></div>
<script
  src="http://127.0.0.1:7210/embed.js"
  data-target="panorama-widget"
  data-api="http://127.0.0.1:7210"
  data-panorama-no="1001"
  data-autorotate="1"
></script>
```

适合：

- 普通官网
- 展示页
- CMS 页面
- 不想自己实现前端逻辑的场景

说明：

- `data-panorama-no` 用于指定嵌入哪一张全景图
- 不传 `data-panorama-no` 时，组件会加载整个图库
- 嵌入后的组件支持拖拽旋转、滚轮缩放、自动旋转、全屏

### 方式二：前端自己调用 API

```js
fetch("http://127.0.0.1:7210/api/gallery")
  .then((response) => response.json())
  .then((data) => {
    console.log(data.items);
  });
```

适合：

- 你自己已有前端工程
- 需要自定义 UI / 权限 / 业务流程

## 前端功能说明

独立前端站点 `frontend/` 已提供：

- 后端地址配置
- 写入演示数据
- 刷新 / 清空图库
- 上传本地图片到后端
- 注册远程全景图 URL
- 720 全景预览
- 自动旋转
- 上一张 / 下一张切换
- 全屏
- 接入代码示例展示

## 桌面客户端说明

Electron 客户端用于用户本地进行预览：

- 启动时自动拉起后端
- 启动时自动拉起前端静态服务
- 打开桌面专属窗口

## 支持的图片格式

- `.jpg`
- `.jpeg`
- `.png`
- `.webp`
- `.gif`
- `.bmp`
- `.avif`
- `.svg`

建议优先使用标准 2:1 等距柱状投影的 720 全景图。

## 验证

执行基础测试：

```bash
npm test
```

当前测试覆盖：

- 后端健康检查
- 演示图库写入
- Base64 图片上传
- 图库列表读取

## 后续扩展方向

- 用户认证与权限控制
- 多图库 / 多项目空间
- 热点标注
- 多场景漫游
- 数据库存储
- OSS / COS / MinIO 对接
- 缩略图生成
- 图片元数据检索
- Electron 安装包打包
