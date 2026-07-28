# 嵌入全景查看器

后端提供 `embed.js`，由它创建适配尺寸的 iframe widget。将脚本放在目标容器之后或父页面的其他位置，并用 `data-target` 指定已有容器 ID。

```html
<div id="panorama"></div>
<script
  src="https://your-host.example/embed.js"
  data-target="panorama"
  data-panorama-no="1"
></script>
```

最简单的引用方式是指定已存在的图库编号。也可直接指定远程图片 URL 与名称：

```html
<div id="panorama"></div>
<script
  src="https://your-host.example/embed.js"
  data-target="panorama"
  data-image-url="https://example.com/panorama.jpg"
  data-image-name="大厅"
></script>
```

## 参数

| 属性 | 说明 |
| --- | --- |
| `data-api` | API 根 URL；默认由脚本 URL 推导 |
| `data-target` | 页面中的挂载容器 ID；省略时在 script 后插入容器 |
| `data-panorama-no` | 图库编号；与 `data-image-url` 同时指定时直接 URL 优先 |
| `data-image-url` | 直接显示的图片 URL |
| `data-image-name` | 图片名称 |
| `data-mode` | 兼容旧页面的属性；所有旧模式值均统一为标准全景视图 |
| `data-autorotate` | 对支持自动旋转的 PSV 引擎请求打开自动旋转；legacy 不启用自动旋转 |
| `data-controls` | 控件白名单，逗号分隔 |
| `data-hide-controls` | 要隐藏的控件，逗号分隔 |
| `data-aspect-ratio` | iframe 宽高比，可写 `16:9` 或正数 |
| `data-min-height` / `data-max-height` | iframe 高度限制，单位像素 |

## 控件白名单

widget 可见操作控件为 `previous`、`next`、`autorotate`、`zoom-in`、`zoom-out`、`focus`、`director`、`reset`、`fullscreen`，以及 `all`、`default`、`none` 组合值。默认显示除 `director` 外的标准操作；可将 `director` 显式加入 `data-controls`。`status` 表示加载/错误反馈，该反馈不会被成功状态固定覆盖，`controls=none` 也不会隐藏必要的加载/错误提示。legacy 引擎只显示两个 zoom 操作。

`embed.js` 为兼容旧集成仍接受 `brand`、`panorama-no`、`resolution` 等旧 HUD token，但新版 widget 不显示对应品牌、全景编号或分辨率叠加。旧 `mode-expand`、`mode-planet`、`mode-tunnel`、`mode-crystal` tokens 不再是控件项；旧 `data-mode`/`data-preview-mode` 属性仍会解析为标准全景视图。旧 `viewer=legacy` 参数不会选择引擎，widget 使用系统配置的引擎。控制台主 viewer 的 Cookie 工具栏设置不影响嵌入 widget。

兼容别名：`data-src-url` 等价于 `data-image-url`；`data-title` 等价于 `data-image-name`；`data-preview-mode` 等价于 `data-mode`。

## 部署提示

宿主页和 XinT 服务均建议使用 HTTPS；否则浏览器可能阻止混合内容。远程图片能否加载还受 CORS、图片代理安全策略和来源可达性影响。浏览器 IndexedDB 中的客户端图片只对原浏览器来源可读，不能从独立 widget 加载。
