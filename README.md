# 芯添全景系统 (XinT-Panorama-System)

一个用于构建 **720 全景图片快速加载、预览、上传、代理与嵌入式展示** 的开源系统。

本项目核心目标不是单独做一个页面，而是提供一套可复用的前后端分离方案：

- 后端独立运行，提供图库管理、媒体代理、上传存储与嵌入资源
- 前端独立运行，作为普通网站直接消费后端 API
- 普通前端网站可直接通过 `embed.js` 按编号嵌入后端内容

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
- 支持每张全景图自动分配独立编号 `panoramaNo`
- 支持后端嵌入脚本 `embed.js`

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

## API 文档

### 统一说明

所有接口默认基于：

```text
http://127.0.0.1:7210
```

统一规则：

- 请求和响应编码：`UTF-8`
- JSON 接口请求头：`Content-Type: application/json`
- 后端默认开启 `CORS`
- `id` 是系统生成的唯一主键，不允许手动修改
- `panoramaNo` 是业务编号，可用于前端嵌入引用

### 接口总表

| 接口 | 方法 | 用途 | 说明 |
| --- | --- | --- | --- |
| `/api/health` | `GET` | 健康检查 | 检查后端服务是否在线 |
| `/api/config` | `GET` | 获取服务配置 | 返回 API 根地址和嵌入资源地址 |
| `/api/gallery` | `GET` | 获取图库列表 | 返回全部全景图 |
| `/api/panoramas/by-no` | `GET` | 按编号获取单张全景图 | 用 `panoramaNo` 查询 |
| `/api/gallery/clear` | `POST` | 清空图库 | 清空图库记录并删除上传文件 |
| `/api/gallery/seed-demo` | `POST` | 写入演示数据 | 保留为调试接口，后台页面默认不再展示 |
| `/api/panoramas/register` | `POST` | 注册远程全景图 | 将外部图片地址注册为图库记录 |
| `/api/panoramas/upload-base64` | `POST` | 上传本地图片 | 通过 Base64 JSON 上传图片 |
| `/api/panoramas/update` | `POST` | 修改全景图信息 | 可修改编号、名称、描述 |
| `/api/panoramas/proxy` | `GET` | 远程图片代理 | 用于代理外部图片，减少跨域问题 |

### 通用返回字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 系统生成主键 |
| `panoramaNo` | `number` | 业务编号 |
| `name` | `string` | 全景图名称 |
| `description` | `string` | 描述信息 |
| `sourceType` | `string` | 来源类型 |
| `viewerUrl` | `string` | 全景图预览地址 |
| `thumbnailUrl` | `string` | 缩略图地址 |
| `size` | `number \| null` | 文件大小，单位字节 |
| `width` | `number \| null` | 图片宽度 |
| `height` | `number \| null` | 图片高度 |
| `createdAt` | `string` | 创建时间，ISO 字符串 |

### 1. 健康检查

**接口**

```http
GET /api/health
```

**请求参数**

| 参数 | 位置 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| 无 | - | - | - | 无参数 |

**返回示例**

```json
{
  "ok": true,
  "author": "XinTycd",
  "service": "xint-panorama-system-backend",
  "time": "2026-04-09T12:00:00.000Z"
}
```

### 2. 获取服务配置

**接口**

```http
GET /api/config
```

**返回字段**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `author` | `string` | 作者名称 |
| `apiBase` | `string` | API 根地址 |
| `widgetScript` | `string` | `embed.js` 地址 |
| `widgetPage` | `string` | `widget` 页面地址 |

### 3. 获取图库列表

**接口**

```http
GET /api/gallery
```

**请求参数**

| 参数 | 位置 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| 无 | - | - | - | 无参数 |

**返回字段**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `author` | `string` | 作者名称 |
| `items` | `array` | 全景图列表 |

**返回示例**

```json
{
  "author": "XinTycd",
  "items": [
    {
      "id": "upload-xxx",
      "panoramaNo": 1001,
      "name": "大厅全景",
      "description": "一层前厅",
      "sourceType": "uploaded-base64",
      "viewerUrl": "http://127.0.0.1:7210/media/uploads/a.jpg"
    }
  ]
}
```

### 4. 按编号获取单张全景图

**接口**

```http
GET /api/panoramas/by-no?no=1001
```

**请求参数**

| 参数 | 位置 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `no` | `query` | `number` | 是 | 全景图编号 `panoramaNo` |

**返回字段**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `ok` | `boolean` | 是否成功 |
| `item` | `object` | 单张全景图对象 |

### 5. 注册远程全景图

**接口**

```http
POST /api/panoramas/register
```

**请求参数**

| 参数 | 位置 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `name` | `body` | `string` | 否 | 全景图名称，不传时默认“远程全景图” |
| `description` | `body` | `string` | 否 | 描述信息 |
| `url` | `body` | `string` | 是 | 远程图片地址，必须是 `http` 或 `https` |
| `panoramaNo` | `body` | `number` | 否 | 手动指定业务编号，不传则自动分配 |

**请求示例**

```json
{
  "name": "展示大厅",
  "description": "官网外链场景",
  "url": "https://example.com/panorama.jpg",
  "panoramaNo": 1001
}
```

### 6. 上传本地图片到后端

当前版本使用 **Base64 JSON 上传**，适合普通前端页面直接接入，不依赖表单提交。

**接口**

```http
POST /api/panoramas/upload-base64
```

**请求参数**

| 参数 | 位置 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `name` | `body` | `string` | 否 | 全景图名称，不传则使用文件名 |
| `description` | `body` | `string` | 否 | 描述信息 |
| `panoramaNo` | `body` | `number` | 否 | 手动指定业务编号，不传则自动分配 |
| `dataUrl` | `body` | `string` | 是 | 图片的 Base64 Data URL，例如 `data:image/jpeg;base64,...` |

**请求示例**

```json
{
  "name": "room-01",
  "description": "一楼大厅全景图",
  "panoramaNo": 1002,
  "dataUrl": "data:image/jpeg;base64,..."
}
```

**前端上传示例**

```js
async function uploadPanorama(file) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const response = await fetch("http://127.0.0.1:7210/api/panoramas/upload-base64", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: file.name.replace(/\.[^.]+$/, ""),
      description: "前端上传示例",
      dataUrl: dataUrl
    })
  });

  return response.json();
}
```

### 7. 修改全景图信息

**接口**

```http
POST /api/panoramas/update
```

**请求参数**

| 参数 | 位置 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | `body` | `string` | 是 | 系统生成主键，用于定位要修改的全景图 |
| `panoramaNo` | `body` | `number` | 是 | 新的业务编号，必须为正整数且唯一 |
| `name` | `body` | `string` | 否 | 新名称 |
| `description` | `body` | `string` | 否 | 新描述 |

**说明**

- `id` 只用于定位记录，不允许修改
- `panoramaNo`、`name`、`description` 可修改

### 8. 清空图库

**接口**

```http
POST /api/gallery/clear
```

**请求参数**

| 参数 | 位置 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| 无 | - | - | - | 请求体可传 `{}` |

### 9. 远程图片代理

**接口**

```http
GET /api/panoramas/proxy?url=https%3A%2F%2Fexample.com%2Fpanorama.jpg
```

**请求参数**

| 参数 | 位置 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `url` | `query` | `string` | 是 | 远程全景图地址，后端会代理该图片 |

## 嵌入参数说明

### `embed.js` 最小示例

```html
<div id="panorama-widget"></div>
<script
  src="http://127.0.0.1:7210/embed.js"
  data-target="panorama-widget"
  data-api="http://127.0.0.1:7210"
  data-panorama-no="1001"
></script>
```

### 嵌入参数总表

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `src` | `string` | 是 | `embed.js` 脚本地址 |
| `data-target` | `string` | 否 | 组件要挂载到的容器 `id`，不带 `#`；不传时默认插入到当前脚本后面 |
| `data-api` | `string` | 否 | 后端 API 根地址，默认取当前脚本所在域名 |
| `data-panorama-no` | `number` | 否 | 指定按编号加载某一张全景图 |
| `data-image-url` | `string` | 否 | 直接使用外部全景图 URL 嵌入 |
| `data-image-name` | `string` | 否 | 外部 URL 模式下显示名称 |
| `data-autorotate` | `string` | 否 | 是否自动旋转，`1` 为开启，`0` 为关闭 |
| `data-aspect-ratio` | `string` | 否 | 容器宽高比，例如 `16:9`、`2:1` |
| `data-min-height` | `number` | 否 | 最小高度，单位像素 |
| `data-max-height` | `number` | 否 | 最大高度，单位像素 |

### 按编号嵌入

```html
<div id="panorama-widget"></div>
<script
  src="http://127.0.0.1:7210/embed.js"
  data-target="panorama-widget"
  data-api="http://127.0.0.1:7210"
  data-panorama-no="1001"
  data-autorotate="1"
  data-aspect-ratio="16:9"
></script>
```

### 按外部 URL 直接嵌入

```html
<div id="panorama-widget-url"></div>
<script
  src="http://127.0.0.1:7210/embed.js"
  data-target="panorama-widget-url"
  data-api="http://127.0.0.1:7210"
  data-image-url="https://example.com/panorama.jpg"
  data-image-name="官网外链全景图"
  data-autorotate="1"
  data-aspect-ratio="2:1"
></script>
```

### 方式二：前端自己调用 API

```js
fetch("http://127.0.0.1:7210/api/gallery")
  .then((response) => response.json())
  .then((data) => {
    console.log(data.items);
  });
```

## 前端功能说明

独立前端站点 `frontend/` 已提供：

- 后端地址配置
- 刷新 / 清空图库
- 上传本地图片到后端
- 注册远程全景图 URL
- 修改全景图编号、名称、描述
- 720 全景预览
- 自动旋转
- 上一张 / 下一张切换
- 全屏
- 接入代码示例展示

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
