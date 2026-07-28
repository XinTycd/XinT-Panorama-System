# 全景查看器说明

## 引擎选择

默认引擎为 Photo Sphere Viewer（PSV）5.15.1；系统设置也可选择简化的原球面 renderer。设置对控制台和 widget 统一生效，一次只创建所选的一个引擎。环境变量 `PANORAMA_VIEWER_ENGINE` 可强制覆盖设置和配置。配置优先级及接口见[API 参考](./API.md)。

两种引擎均只显示标准等距柱状全景。简化原球面 renderer 只提供拖动观察和缩放按钮。PSV 使用自定义图标工具栏（`navbar: false`），包括上一张、下一张、缩放、自动旋转、演示、重置、全屏和更多设置。控制台与 widget 均不显示罗盘、遥测、品牌、全景编号、分辨率或悬浮场景轨道；widget 只在加载或出错时显示状态反馈。星球、隧道、晶球等自定义投影和同视角双图比较暂时关闭；不会以引擎切换恢复这些模式。

## 资源与视角

控制台和 widget 通过 `frontend/panorama-viewer.js` facade 共享资源与视角接口。旧视角 yaw 按代码定义转换到 PSV yaw；pitch 由角度转换为弧度。垂直 FOV 30°–105°映射到 PSV zoom 0–100。资源可来自远程代理、本地服务端、本地 SQLite/Turso 或浏览器 IndexedDB Blob；客户端图片仅原浏览器来源可读，不能供独立 widget 使用。

## 性能边界

桌面 Chrome 已验收 PSV 和 legacy 的控制台及 widget，并检查 390px 响应式视口；这不代表真实手机或其他浏览器的兼容性验收。真实 Turso 账号、弱网、长时运行和 Docker runtime 未验证。选择 PSV 引擎不表示已完成大图性能优化。按视野/层级切片、移动设备和 2K–16K 图片性能仍需独立实测；任何性能数字应附设备、浏览器和样本记录。

## 嵌入

widget 与控制台使用相同引擎选择。旧 `data-mode`/`data-preview-mode` 参数会统一显示标准全景模式；旧特殊模式控件 token 不再显示。`brand`、`panorama-no`、`resolution` 等旧 HUD token 仍可解析，但没有相应显示控件。详见[嵌入说明](./EMBEDDING.md)。
