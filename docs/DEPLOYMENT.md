# 部署与运维指南

## 运行边界

本项目支持单机、内网和 Docker Compose 部署。默认使用本地 SQLite；仅选择 Turso 图片存储时才会连接外部云数据库。全景资源和项目数据保存在 `PANORAMA_STORAGE_DIR` 指定的本地卷中。

运行需要 Node.js 24 或更高版本，以使用内置的 `node:sqlite`。SQLite 数据库固定为存储目录下的 `panorama.sqlite`；不要单独移动数据库文件而遗漏同目录上传资源。

当前实现不包含用户身份、组织权限、审计、SLA 或企业对象存储编排。

## 仅部署嵌入服务

宿主网站只使用嵌入查看器时，可只运行后端。源码部署需保留后端、`frontend/` 静态查看器源码和依赖：

```bash
npm ci
npm run start:backend
```

后端默认监听 7210，提供 API、`/embed.js`、`/widget`、本地 PSV 资源和媒体服务。首次启动会在需要时构建 PSV 资源，因此源码部署仍需安装 lockfile 中的运行和构建依赖。管理控制台是可选的 7211 服务；运行 `npm start` 才会同时启动控制台和后端。它用于上传/整理资源、维护项目场景和热点、设置查看器并预览调试嵌入内容。

## 反向代理与 HTTPS

建议使用同一公开域名的 HTTPS 反向代理，将嵌入资源和 API 路径转发到后端 7210。至少需要按部署用途处理以下只读路径：

- `/embed.js`、`/widget`、`/assets/`：脚本、widget 页面和本地查看器资源。
- `/api/config`、`/api/panoramas/by-no`：widget 初始化和按编号读取单张图片。只有需要在 widget 中浏览图库列表时才开放 `/api/gallery`；该接口会公开可分享图库中的资源列表，按编号嵌入单张图片不需要它。
- `/media/`：本地图片媒体。
- `/api/panoramas/proxy`：仅在嵌入的图片使用远程 URL 时需要。

如果前端使用 `/widget` 默认的 `location.origin`，或 iframe 里的 API 与 widget 同源，反代应让上述路径落到同一个服务地址。TLS 终止后，浏览器访问的页面和嵌入资源都应使用公开 HTTPS URL；不要让 widget 生成的图片请求降级到 HTTP。

公开部署时应将管理写接口限制在受控网络或由前置网关实施身份验证。项目本身没有用户登录或角色权限；嵌入所需的只读路径可按实际访问方式开放，远程图片代理按需开放。若反代添加 CSP `frame-ancestors`，仅列出获准嵌入的宿主来源；宿主 CSP 的 `frame-src` 应允许 XinT 来源，脚本接入还需在 `script-src` 中允许该来源。详细参数见[嵌入说明](./EMBEDDING.md)。

## Docker Compose

```bash
docker compose up -d --build
```

启动后：

- 后端 API：`http://127.0.0.1:7210`
- 前端控制台：`http://127.0.0.1:7211`

Compose 默认使用命名卷 `xint_panorama_storage` 保存 SQLite 数据库、项目、图库和上传文件；端口默认只绑定本机 `127.0.0.1`。升级镜像前请先停服务并执行备份。

## 配置校验

启动前执行：

```bash
npm run check:config
```

该命令读取 `config.json` 与环境变量，检查 Node.js 版本及存储目录、SQLite 文件路径的读写权限，不会创建、迁移或修改数据库。

## 数据库与旧数据迁移

### 图片存储

系统设置中的存储方式适用于新上传图片。项目、场景、图库记录继续保存在本地 `panorama.sqlite`。

| 位置 | 图片内容 |
| --- | --- |
| 本地客户端 | 当前浏览器的 IndexedDB。其他浏览器和嵌入页无法读取。 |
| 本地服务端 | 原图或转码图片位于 `uploads/`，Base64 文本位于 `encoded-images/`。 |
| 本地 SQLite | Base64 文本位于 `panorama.sqlite`，转码会先生成目标图片再写入。 |
| 云端 SQLite | Base64 文本位于配置的 Turso 数据库。填写 `libsql://` 或 HTTPS 数据库地址和写入令牌。 |

存储设置可在后端所在电脑的本地控制台修改。云端单张图片的保存上限为 6 MiB，为 Base64 和协议开销预留空间。云端令牌保存在服务端数据目录的 `media-settings.json`，其中也保存供旧图片使用的连接信息。限制该目录及备份的读取权限，云端图片内容由云服务另行备份。

SQLite 使用 `config.json` 中的 `database.storageDir`，也可以通过 `PANORAMA_STORAGE_DIR` 指定存储目录。旧配置中的 `database.json.storageDir` 仍可读取。默认数据库路径为 `<storageDir>/panorama.sqlite`。

首次启动时，如果 SQLite 尚不存在而存储目录包含旧版 `gallery.json` 或 `catalog.json`，服务会将数据迁移到 SQLite。原 JSON 文件会留作迁移源副本。`database.driver: "json"` 是旧配置兼容值，仍会启动 SQLite 并执行迁移。MySQL 配置已移除；显式设置 MySQL 或其他不支持的数据库驱动会报错退出。

项目场景通过 `panoramaId` 引用图库中的全景图。

## 备份

备份前先停止服务，保证 SQLite 快照和上传文件来自同一时间点。主机直装可运行：

```bash
npm run backup -- --output /path/to/backups
```

Compose 部署可将备份输出挂到主机目录：

```bash
docker compose stop
docker compose run --rm -v ./backups:/backups xint-panorama node scripts/backup.js --output /backups
docker compose start
```

脚本通过 SQLite backup API 创建数据库快照，并复制上传资源到临时目录，排除 SQLite `-wal`、`-shm` 与 `-journal` 文件，运行 `quick_check` 和 schema 检查后再发布备份目录及 `backup-manifest.json`。备份目标不能位于存储目录中；建议放在另一块磁盘或受控备份位置。备份脚本不会自动停止服务，停止服务仍是保证数据库与媒体文件来自同一时间点的必要步骤。

## 恢复

恢复会覆盖当前存储数据，必须显式确认：

```bash
npm run restore -- --from /path/to/backups/backup-2026-01-01T00-00-00-000Z --confirm
```

Compose 部署时，将恢复源目录挂载到容器：

```bash
docker compose stop
docker compose run --rm -v ./backups:/backups xint-panorama node scripts/restore.js --from /backups/backup-2026-01-01T00-00-00-000Z --confirm
docker compose start
```

恢复前先停止服务。脚本会验证清单和 SQLite `quick_check`，在当前存储目录的同卷临时目录完成恢复后才替换当前存储目录，并保留旧目录为 `*.pre-restore-<timestamp>`。恢复失败时会尝试恢复旧目录。来源与目标不得相同或互相包含；来源可以位于其他卷。

旧版 JSON 备份也可恢复：清单需标识本应用，并且备份内包含 `gallery.json` 或 `catalog.json`。脚本会在临时目录先迁移并验证 JSON 数据，再替换当前存储目录；损坏数据不会覆盖现有存储。完成后核对图库和项目，再清理保留的旧目录。

## 远程图片安全策略

远程图片代理仅接受无用户名和密码的 `http` / `https` 地址，并执行以下限制：

- 拒绝本机、内网、链路本地、保留和多播地址。
- 每次重定向重新校验目标地址，最多允许 3 次重定向。
- 仅代理 `image/*` 响应，默认最大 30 MB，默认超时 10 秒。
- 可通过环境变量配置允许来源与资源上限。

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PANORAMA_REMOTE_IMAGE_ALLOWLIST` | 空 | 逗号分隔的允许域名；设置后仅允许这些域名及其子域名 |
| `PANORAMA_REMOTE_IMAGE_MAX_BYTES` | `31457280` | 远程图片最大响应体字节数 |
| `PANORAMA_REMOTE_IMAGE_TIMEOUT_MS` | `10000` | 远程图片请求超时毫秒数 |

生产环境建议明确设置 `PANORAMA_REMOTE_IMAGE_ALLOWLIST`，并关闭不需要的 `external` 运行模式。
