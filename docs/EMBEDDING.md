# 嵌入全景查看器

XinT Panorama 提供两种嵌入单张全景图的方式：`embed.js` 会在宿主页面创建 iframe；也可以直接添加 `/widget` iframe。两种方式都在独立 frame 中运行查看器脚本和样式，宿主页面不需要引入查看器依赖。

要嵌入的服务需通过浏览器可访问的 HTTPS 地址提供页面、widget、API 和图片。`data-api` 或 iframe 的 `api` 参数应填写 XinT 服务根地址，例如 `https://panorama.example`，不要在末尾添加 `/api`。默认情况下，脚本从自身地址推导服务根地址，直接打开 widget 时则使用 `location.origin`。

## 使用嵌入脚本

为查看器准备专用的空容器。脚本会清空 `data-target` 指定容器的现有内容，并在其中创建 iframe。

```html
<div id="xint-panorama"></div>
<script
  src="https://panorama.example/embed.js"
  data-target="xint-panorama"
  data-panorama-no="1"
  data-aspect-ratio="16:9"
  data-min-height="280"
  data-max-height="960"
></script>
```

如果不提供 `data-target`，脚本会在它自身后面创建容器。需要由宿主页面掌控尺寸时，可直接使用 iframe。

## 直接使用 iframe

```html
<iframe
  src="https://panorama.example/widget?panoramaNo=1"
  title="大厅全景"
  loading="lazy"
  allowfullscreen
  style="display:block; width:100%; aspect-ratio:16/9; border:0;"
></iframe>
```

Widget 默认从当前来源读取 API 配置和图库。需要指定服务根地址时，可用以下参数：

```html
<iframe
  src="https://panorama.example/widget?api=https%3A%2F%2Fpanorama.example&panoramaNo=1"
  title="大厅全景"
  loading="lazy"
  allowfullscreen
  style="display:block; width:100%; height:480px; border:0;"
></iframe>
```

使用 iframe 时自行设置宽度和高度或宽高比；iframe 页面会填满其视口。使用脚本时，可用 `data-aspect-ratio`、`data-min-height` 和 `data-max-height` 控制生成的 iframe 尺寸。

## 参数

| 参数 | 方式 | 说明 |
| --- | --- | --- |
| `data-api` | Script | XinT 服务根 URL；默认由脚本 URL 推导。填写服务根地址，不带 `/api`。 |
| `data-target` | Script | 宿主页面的挂载容器 ID；省略时在 script 后插入容器。指定的容器内容会被清空。 |
| `data-panorama-no` | Script | 图库编号。先将图片导入图库，再按编号嵌入。 |
| `data-aspect-ratio` | Script | iframe 宽高比，可写 `16:9` 或正数。默认 `16:9`。 |
| `data-min-height` / `data-max-height` | Script | iframe 高度范围，单位像素；默认 280 / 960。 |
| `data-autorotate` | Script | 对支持自动旋转的 PSV 引擎请求打开自动旋转；legacy 不启用。 |
| `data-controls` | Script | 可见控件，可填写 `all`、`compact`、`none` 或以逗号分隔的控件名。 |
| `data-hide-controls` | Script | 隐藏控件列表，逗号分隔。 |
| `api` | iframe query | XinT 服务根 URL；默认 `location.origin`，填写时不带 `/api`。 |
| `panoramaNo` | iframe query | 显示图库中指定编号的图片。 |
| `controls` / `hideControls` | iframe query | 可见或隐藏控件列表，使用与脚本方式相同的预设和控件名。 |
| `lang` | Script / iframe query | 界面语言：`zh-CN`、`zh-TW` 或 `en`。省略时使用浏览器语言偏好。控制台的语言选择位于“设置”抽屉内。 |

旧 `data-mode`、`data-preview-mode` 属性仍可解析为标准全景视图；当前查看器没有多个投影模式。旧 `brand`、`panorama-no` 和 `resolution` HUD 控件 token 为兼容性保留，widget 不渲染相应叠层。控制台的工具栏 Cookie 设置不影响 widget。

## 宿主网站和代理要求

- 当宿主页使用 HTTPS 时，XinT 服务也必须通过 HTTPS 提供；浏览器会阻止安全页面加载不安全的 iframe 或脚本。
- 若宿主设置了内容安全策略（CSP），`frame-src` 需允许 XinT 服务来源；使用 `embed.js` 时，`script-src` 还需允许该来源。纯 iframe 接入只需允许对应 frame 来源。
- 若 XinT 前方的网关或反向代理设置 CSP `frame-ancestors`，应只允许实际嵌入此查看器的宿主来源。跨站嵌入时，不要返回会阻止该宿主的 `X-Frame-Options` 策略。
- iframe 内的 widget 会从 XinT 服务请求 `/api/config`、`/api/gallery` 或 `/api/panoramas/by-no`，并通过 `/api/panoramas/preview` 和 `/api/panoramas/thumbnail` 获取服务端派生图。图库 API 不公开 `/media/` 原始媒体路径。请先通过管理控制台或图库导入 API 添加图片，再用 `panoramaNo` 嵌入；直接图片 URL 参数及 `/api/panoramas/proxy` 已退役。同源反向代理应将所需路径以及 `/widget`、`/embed.js`、`/assets/` 转发到同一 XinT 后端。
- 远程图片应先通过图库导入 API 保存为服务端资源；浏览器 IndexedDB 图片仅在保存它的浏览器来源可用，不能由独立 widget 读取；Turso 图片由服务端提供安全预览，可用于 widget。
- 嵌入查看器不需要公开管理控制台。图库写入、项目管理、存储和引擎设置属于管理操作，应留在受控网络环境；本项目不提供用户登录或角色权限。

PSV 先加载较小的服务端派生图，再按视口、缩放和设备纹理上限提高分辨率。支持全尺寸时，PSV 可显示保留解码像素的无损派生图。存储源文件按所选存储方式保留，图库接口只交付移除元数据的派生图。

## 控件白名单

控件名为 `previous`、`next`、`autorotate`、`zoom-in`、`zoom-out`、`focus`、`director`、`reset`、`fullscreen`。`all`、`default`、`none` 可组合设置默认显示方式；`status` 对应加载和错误反馈，必要反馈不会被隐藏。legacy 查看器只提供缩放按钮。

同源父页面可以通过 widget 暴露的 `window.XinTPanoramaWidget.setControlPreset("all" | "compact" | "none")` 切换预设；跨源父页面不会收到此接口。普通嵌入通常在 URL 中设置 `controls`，无需调用脚本接口。
