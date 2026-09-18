# API 参考

默认 API 地址为 `http://127.0.0.1:7210`。JSON 请求使用 `Content-Type: application/json`。图库 `GET /api/gallery` 返回完整记录集合；控制台在客户端进行筛选和每页 8 项分页，服务端没有图库分页参数。

## 健康检查与配置

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 服务状态、版本、模式和数据库类型 |
| GET | `/api/config` | API/widget 地址、运行模式、数据库与媒体存储配置 |
| PUT | `/api/settings/media-storage` | 更新媒体存储设置；仅允许本机控制台来源 |
| PUT | `/api/settings/viewer` | 更新 viewer 引擎；仅允许本机控制台来源，写入 `viewer-settings.json` |

`GET /api/config` 的 `viewer` 对象返回当前 `engine` 与 `forcedByEnvironment`。优先级为 `PANORAMA_VIEWER_ENGINE` 环境变量、本机持久设置、`config.json` 的 `viewer.engine`、默认值 `psv`。合法引擎为 `psv` 与 `legacy`。本机控制台保存请求示例：

```json
{"engine":"legacy"}
```

发送到 `PUT /api/settings/viewer`；设置只记录引擎选择。设置在存储目录的 `viewer-settings.json`。环境变量强制选择时，写请求返回 409；非本机来源返回 403。控制台保存后在当前页面释放并重建所选引擎，同时保留当前图片与视角；待上传队列非空时不能切换。widget 初始化时读取同一全局配置，已打开的 widget 标签页不会跨刷新热同步。

## 图库和分组

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/gallery` | 查询全部图库记录 |
| GET | `/api/panoramas/by-no?no=1` | 按图库编号查询 |
| POST | `/api/panoramas/create` | 注册已有图片地址/记录 |
| POST | `/api/panoramas/register` | 注册远程图片链接 |
| POST | `/api/panoramas/upload-base64` | 上传 Base64 Data URL；JSON body 上限 30 MiB。默认返回图库 `items`，批量上传可用 `?includeItems=0` 仅返回 `ok` 和 `item` |
| POST | `/api/panoramas/update` | 按 `id` 更新编号、分组、名称或描述 |
| DELETE | `/api/panoramas/:id` | 删除图库记录；有项目场景引用时返回 409。不会删除图片媒体 |
| GET | `/api/panoramas/proxy?url=...` | 受安全限制的远程图片代理 |
| GET/POST/DELETE | `/api/gallery/groups` | 查询、创建、删除命名分组；删除组内资源移至未分组，空组保留 |
| POST | `/api/gallery/clear` | 清除图库记录，不删除媒体或发布快照 |
| POST | `/api/gallery/seed-demo` | 添加演示记录 |

图片注册请求示例：

```json
{"name":"大厅","imageUrl":"https://example.com/panorama.jpg"}
```

上传请求示例：

```json
{"name":"大厅","dataUrl":"data:image/jpeg;base64,..."}
```

通过上传方式创建图片时，编号由服务端分配。资源可带可选 `group`；命名分组需先创建。服务端对组名 trim 后最多接受 64 个 Unicode 字符，空值表示未分组。

## 项目、场景、热点

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/projects?limit=&offset=` | 分页查询项目 |
| POST | `/api/projects` | 创建项目 |
| GET/POST/DELETE | `/api/projects/:id` | 查询（返回项目包与发布摘要）、更新、删除项目 |
| POST | `/api/projects/import` | 导入项目 JSON；生成新项目/场景/热点 ID，保留资源引用，不导入历史发布 |
| GET | `/api/projects/:id/export` | 导出 `xint-panorama-project@1` 项目 JSON |
| GET/POST | `/api/projects/:id/scenes` | 查询/创建项目场景 |
| POST/DELETE | `/api/scenes/:id` | 更新/删除场景 |
| GET/POST | `/api/scenes/:id/hotspots` | 查询/创建场景热点 |
| POST/DELETE | `/api/hotspots/:id` | 更新/删除热点 |
| GET | `/api/projects/:id/diagnostics` | 生成交付诊断；错误会阻止发布 |
| POST | `/api/projects/:id/releases` | 创建发布快照；诊断错误时返回 422 |
| GET | `/api/releases/:id` | 读取发布快照 |
| GET | `/api/releases/:id/verify` | 校验快照与可读取的本地资源 |

项目导入/导出和发布快照含元数据/资源引用，不包含图片文件。远程或仅有元数据的资源不会执行联网核验。

## 删除行为

- 删除图库记录不会删除媒体文件；被项目场景引用时以 409 拒绝。
- 删除场景会移除其热点和该项目中指向该场景的导航热点；已有发布快照不自动更新。
- 删除项目会删除其当前场景、热点和发布记录。
- 清空图库只移除图库记录；项目可能因此保留无法解析的资源引用。
