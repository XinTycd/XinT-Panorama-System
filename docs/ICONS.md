# Icon system

XinT Panorama uses one shared, offline SVG symbol sprite. Console pages reference `./icons/sprite.svg#<name>`; the widget references `/assets/icons.svg#<name>`. Both paths serve the same `frontend/icons/sprite.svg` file. The sprite contains no XinT logo or Admin implementation code.

## Use

Use the Phosphor Regular geometry with `currentColor`. Choose 16px for an icon beside text, 20px for viewer toolbar controls, and 24px for larger standalone actions. An icon-only button needs a hit area of at least 44 by 44px.

```html
<button type="button" aria-label="放大细节" title="放大细节">
  <svg class="xint-icon" aria-hidden="true" focusable="false" viewBox="0 0 256 256">
    <use href="./icons/sprite.svg#zoom-in"></use>
  </svg>
</button>
```

Keep the Chinese accessible name and visible text on the button, not on its decorative SVG. Mark the SVG `aria-hidden="true"` and `focusable="false"`. Give every icon-only button a Chinese `aria-label` and matching `title`. Toggle buttons use `aria-pressed`; when their action changes, update both the label and title to describe the next action.

For the panorama toolbar, use the icon-only controls with these labels:

| Control state | Symbol | Button name |
| --- | --- | --- |
| Previous panorama | `previous` | 上一张 |
| Next panorama | `next` | 下一张 |
| Start autorotate | `refresh` | 自动旋转 |
| Stop autorotate | `refresh` | 停止旋转 |
| Zoom in / out | `zoom-in` / `zoom-out` | 放大细节 / 缩小视野 |
| Focus / leave focus | `focus` | 聚焦 / 退出聚焦 |
| Start / stop demo | `play` / `pause` | 自动演示 / 停止自动演示 |
| Reset view | `retry` | 重置视角 |
| Enter / exit fullscreen | `fullscreen` / `exit-fullscreen` | 全屏预览 / 退出全屏 |

`autorotate` intentionally uses the existing Admin `refresh` glyph and `reset` uses `retry`. Their button names describe the panorama actions; do not infer the action from the glyph alone.

## Symbols

| Symbol | 中文名称 | Use |
| --- | --- | --- |
| `add` | 新增 | Add or create |
| `close` | 关闭 | Close or dismiss |
| `copy` | 复制 | Copy |
| `delete` | 删除 | Delete |
| `edit` | 编辑 | Edit |
| `exit-fullscreen` | 退出全屏 | Exit fullscreen |
| `external` | 打开外部链接 | Open an external destination |
| `file` | 文件 | File |
| `folder` | 文件夹或分组 | Folder or group |
| `focus` | 聚焦 | Focus or aim |
| `fullscreen` | 全屏 | Enter fullscreen |
| `info` | 信息 | Information |
| `link` | 链接 | Link or register a URL |
| `module` | 插件 | Built-in plugin |
| `more` | 更多操作 | More actions |
| `next` | 下一项 | Next item or page |
| `pause` | 暂停 | Pause a demo |
| `platforms` | 项目 | Project workspace |
| `play` | 播放 | Play a demo |
| `previous` | 上一项 | Previous item or page |
| `refresh` | 刷新 | Refresh; used for autorotate |
| `retry` | 重试 | Retry; used for reset view |
| `settings` | 设置 | Settings |
| `upload` | 上传 | Upload |
| `zoom-in` | 放大 | Zoom in |
| `zoom-out` | 缩小 | Zoom out |

New icons should use a Phosphor Regular source glyph with a documented upstream ID. Add the source URL and SHA-256 of the original SVG to `frontend/icons/manifest.json`, retain the MIT license, and keep symbol IDs semantic and stable. Do not use a character glyph as an icon fallback.

## Provenance and license

Nineteen symbols shared with XinT-Admin are identified in its `@xint/admin-icons` `0.1.0-alpha.11` asset manifest, retrieved with `better-icons@1.0.4`. Their source file hashes were checked against that manifest before building this sprite. Seven additional viewer symbols come from the official [`@phosphor-icons/core` 2.1.1 package](https://www.npmjs.com/package/@phosphor-icons/core/v/2.1.1). The fixed jsDelivr URLs for those SVGs were fetched and matched against the recorded SHA-256 hashes. Per-icon source IDs, versions, URLs, and hashes are recorded in `frontend/icons/manifest.json`.

Phosphor Icons are distributed under the [MIT License](../frontend/icons/LICENSE.phosphor). The license is also served by the backend at `/assets/icons/LICENSE.phosphor`. Icon geometry is attributed to Phosphor; XinT's symbol names and usage guidance do not imply that the upstream artwork is original XinT artwork.
