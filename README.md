# XinT Panorama System

**English** | [简体中文](./README.zh-CN.md)

A self-hosted system for managing and previewing 360° panorama assets.

[![Node.js 24+](https://img.shields.io/badge/Node.js-24%2B-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![SQLite](https://img.shields.io/badge/Database-SQLite-003B57?logo=sqlite&logoColor=white)](https://sqlite.org/)
[![Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue)](./LICENSE)

**Version 0.2.1 · 2026-07-29.** The viewer defaults to Photo Sphere Viewer (PSV) 5.15.1, with a simplified original spherical renderer as an option; only the selected engine runs at a time. Desktop Chrome and a 390px responsive viewport have been checked; real phones, other browsers, Turso, weak networks, long-running performance, and Docker runtime remain unverified.

## Project background

Panorama images, project references, and web embeds are often managed in separate places. XinT Panorama brings the gallery, projects, scenes, hotspots, and embeddable viewer into one self-hosted app.

This project migration replaces MySQL with SQLite to simplify local deployment. Images can be stored in the browser, on the local server, in SQLite, or in Turso. The viewer uses PSV by default, with a simplified original renderer available for compatibility. Both engines provide standard panorama viewing; custom projection modes and side-by-side comparison are currently disabled.

![XinT Panorama console showing the built-in demo panorama](docs/assets/studio-preview.png)

*Console preview with the built-in demo panorama.*

## Quick start

Requires Node.js 24 or later.

```bash
npm ci
npm start
```

Open the console at <http://127.0.0.1:7211>. The API listens at <http://127.0.0.1:7210> by default. `npm start` launches both services. On first startup, the app creates `backend/storage/panorama.sqlite`; if it finds legacy `gallery.json` or `catalog.json` files in the storage directory, it migrates them once. Back up existing storage before migration.

For Docker Compose, configuration, backup, and restore instructions, see the [deployment guide](./docs/DEPLOYMENT.md) (Chinese).

## Features

- Add panoramas by uploading a file, registering an external image URL, or adding an existing image address.
- Organize the gallery with named groups, client-side filters, and eight items per page.
- Organize projects, scenes, and hotspots; import and export project JSON; inspect delivery diagnostics and release snapshots.
- Browse panoramas with PSV by default, or select the simplified original spherical renderer. PSV uses a custom icon toolbar styled like a conventional panorama viewer, with its native navbar disabled. The legacy renderer offers drag-to-look and zoom buttons only.
- Configure visible PSV console toolbar buttons; preferences are saved in a browser cookie. The legacy renderer keeps its two zoom buttons visible. Widget controls use embed parameters rather than this console cookie.
- Choose among browser IndexedDB, local server files, local SQLite, and Turso SQLite for new image content. Server and browser storage support original formats, Base64, or JPEG/PNG/WebP transcoding.
- Embed a panorama in another site with `embed.js` and an iframe widget.
- Back up and restore SQLite and local media with the included scripts.

## Choose a viewer engine

Set `viewer.engine` in `config.json` to `psv` (the default) or `legacy` (the simplified original spherical renderer). The local console also provides an engine selector. The selection priority is `PANORAMA_VIEWER_ENGINE` environment variable, local `viewer-settings.json`, `config.json`, then the default `psv`. When forced by the environment, the selector is disabled. The console saves a new choice and recreates the viewer in the current page while preserving the image and view; changing engines is blocked while uploads are queued. The widget reads the same global setting when it loads. Reload an already open widget to apply a changed engine setting. Only one engine is initialized at a time.

```json
{ "viewer": { "engine": "psv" } }
```

Both engines display the standard panorama view. Multiple projection modes and image comparison are disabled. The console toolbar and widget do not display compass, telemetry, brand, panorama-number, resolution, or floating scene-rail overlays. The widget accepts legacy `brand`, `panorama-no`, and `resolution` control tokens for parsing compatibility, but renders no corresponding HUD.

## Embed example

```html
<div id="panorama"></div>
<script
  src="https://your-host.example/embed.js"
  data-target="panorama"
  data-panorama-no="1"
></script>
```

See the [embedding reference](./docs/EMBEDDING.md) (Chinese) for all attributes and supported controls. Use HTTPS for both the host page and XinT service to avoid mixed-content blocks.

## Image storage

| Location | Image content | Access |
| --- | --- | --- |
| Browser | IndexedDB | Same browser origin only; unavailable to the widget |
| Local server | Original/transcoded files or Base64 | Served by the XinT instance |
| Local SQLite | Base64, optionally transcoded before saving | Served by the XinT instance |
| Turso SQLite | Base64, optionally transcoded before saving | Configured Turso database |

Gallery and project metadata always remain in local SQLite. Storage settings can only be changed from the local console on the machine running the backend. Turso requires your own database URL and write token. See the [deployment guide](./docs/DEPLOYMENT.md) (Chinese) for details.

## Development

```bash
npm test
npm run check:config
npm run build:vendor
```

Development requires Node.js 24. `sharp` is used for image transcoding. From a clean source checkout, `npm ci` installs the build dependencies; `npm run build:vendor` rebuilds locked viewer assets and license files, and application startup creates any missing generated assets. The Docker runtime image contains the generated assets and does not need dev dependencies. See `package.json` and `package-lock.json` for exact dependency versions. Desktop Chrome checks include the console, both engines, widget, and a 390px responsive viewport; this is not a real-phone or cross-browser test. Real Turso, weak-network and long-run behavior, and Docker runtime remain unverified. See the [PSV integration log](./docs/logs/2026-11-14-psv-integration.log) and [development log](./docs/DEVELOPMENT_LOG.md) for the verification record.

## Project layout

```text
backend/       API, SQLite, media storage, and routes
  public/      embed.js and widget.html
frontend/      console, viewer facade, browser media, viewer build entry
lib/           HTTP utilities and runtime configuration
scripts/       startup, config checks, backup/restore, viewer assets
tests/         API, database, media, operations, viewer, and embed tests
docs/          API, embed, deployment planning, and development notes
```

## Documentation

- [API reference](./docs/API.md) (Chinese)
- [Embedding reference](./docs/EMBEDDING.md) (Chinese)
- [Deployment, storage, backup, and restore](./docs/DEPLOYMENT.md) (Chinese)
- [Documentation index](./docs/README.md)
- [Product scope](./docs/PRODUCT.md) (Chinese)
- [Maintenance map](./docs/PROJECT_CONTEXT.md) (Chinese)
- [Viewer notes](./docs/VIEWER_INNOVATION.md) (Chinese)
- [Viewer modernization plan](./docs/VIEWER_MODERNIZATION_PLAN.md) (Chinese)
- [Development log](./docs/DEVELOPMENT_LOG.md) (Chinese)
- [Changelog](./CHANGELOG.md)
- [v0.2.1 release notes](./docs/releases/v0.2.1.md)
- [v0.2.1 简体中文发布说明](./docs/releases/v0.2.1-zh-CN.md)

## Contributing

Bug reports and improvement ideas are welcome in [GitHub Issues](https://github.com/XinTycd/XinT-Panorama-System/issues). Please read the [contribution guide](./CONTRIBUTING.md) (Chinese) before submitting changes.

## Security

Do not include real databases, image files, access tokens, or customer data in issues or public commits. See the [security policy](./SECURITY.md) (Chinese) for reporting security issues.

## License

Copyright XinTycd. This project is licensed under the [Apache License 2.0](./LICENSE). Photo Sphere Viewer is MIT licensed. Generated viewer assets include the applicable license files; see [third-party notices](./THIRD_PARTY_NOTICES.md).
