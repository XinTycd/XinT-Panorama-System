# Embedding the panorama viewer

The backend serves `embed.js`, which creates a responsive iframe for the panorama widget. Place the script near the target container and set `data-target` to its element ID.

```html
<div id="panorama"></div>
<script
  src="https://your-host.example/embed.js"
  data-target="panorama"
  data-panorama-no="1"
></script>
```

A direct image URL can be embedded instead of a gallery number:

```html
<div id="panorama"></div>
<script
  src="https://your-host.example/embed.js"
  data-target="panorama"
  data-image-url="https://example.com/panorama.jpg"
  data-image-name="Lobby"
></script>
```

## Script attributes

| Attribute | Description |
| --- | --- |
| `data-api` | API root URL; derived from the script URL by default |
| `data-target` | ID of the container element; when omitted, a container is inserted after the script |
| `data-panorama-no` | Gallery panorama number; `data-image-url` takes precedence if both are set |
| `data-image-url` | Direct image URL |
| `data-image-name` | Display name for a direct image |
| `data-mode` | Accepted for old page compatibility; the widget displays the standard spherical view |
| `data-autorotate` | Legacy parameter; automatic rotation is not available in this release |
| `data-controls` | Comma-separated control list |
| `data-hide-controls` | Comma-separated controls to hide |
| `data-aspect-ratio` | Iframe aspect ratio, for example `16:9` or a positive number |
| `data-min-height` / `data-max-height` | Iframe height limits in pixels |

The widget uses the simplified spherical renderer. Its visible controls are zoom in and zoom out; dragging the panorama changes the view. Loading and error feedback is shown when needed. Older mode values are ignored. Existing `data-src-url` and `data-title` aliases are accepted for `data-image-url` and `data-image-name`; `data-preview-mode` is accepted as an alias for `data-mode`.

The `data-controls` and `data-hide-controls` attributes are parsed for compatibility with existing embed code. The simplified widget only exposes zoom controls; other legacy control tokens do not enable additional viewer features.

## Deployment notes

Use HTTPS for both the host page and XinT service to avoid mixed-content restrictions. Remote image loading also depends on CORS, the server proxy security checks, and source availability. Browser IndexedDB images can only be read from the original browser and site origin, so they cannot be loaded by a separate widget.
