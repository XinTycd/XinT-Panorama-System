# C02：项目诊断与发布 API

## 项目诊断

```http
GET /api/projects/{projectId}/diagnostics
```

返回 `report`，包含 `score`、`ready`、`offlineSafe`、统计和检查项。

- `error` 表示发布阻断问题；有错误时 `ready` 为 `false`。
- `warning` 表示风险但不阻止发布。
- `SCENE_UNREACHABLE` 表示场景无法从项目中的默认首场景沿有效场景热点到达。
- 远程图片会标记外部依赖；诊断不发起网络请求。引用的远程资源按资源 ID 去重统计。

## 创建发布

```http
POST /api/projects/{projectId}/releases
Content-Type: application/json

{"name":"验收版本"}
```

诊断包含错误项时返回 `422`：

```json
{
  "ok": false,
  "message": "项目存在阻止发布的问题",
  "report": { "summary": { "error": 1, "warning": 0, "success": 0 } }
}
```

警告不会阻止创建。快照包含项目元数据、场景、热点和 `assets` 清单；不打包图片文件。项目 JSON 导入导出只包含元数据与资源引用，不导入发布历史。

`integrity.digest` 是快照内容的 SHA-256；本地媒体资源有自己的 `assets[].sha256`。`assets[].status` 可为 `local`、`remote`、`metadata-only` 或 `missing`。远程和仅有元数据的资源不会下载或被称为已核验；`integrity.unverifiedAssetCount` 记录这两类数量。

## 验证发布

```http
GET /api/releases/{releaseId}/verify
```

- `snapshotVerified`：保存的快照与其指纹一致。
- `assetsVerified`：已检查资源没有发现失败；兼容字段，未核验的远程/元数据资源不算失败。
- `allAssetsVerified`：每项资源都通过了本地指纹校验。存在未核验资源时为 `false`。
- `assetResults[].verification` 为 `verified`、`failed` 或 `not-checked`；对应的 `verified` 为 `true`、`false` 或 `null`。
- `assetStatusCounts` 和 `unverifiedAssetCount` 提供状态计数。

快照校验通过只证明保存内容与记录的哈希匹配，不构成签名或来源认证。
