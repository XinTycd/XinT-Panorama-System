# XinT Panorama System

**English** | [简体中文](./README.zh-CN.md)

Self-hosted 720° panorama management and viewing, with project scenes, hotspots, and embeddable previews.

[![Node.js 24+](https://img.shields.io/badge/Node.js-24%2B-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![SQLite](https://img.shields.io/badge/Database-SQLite-003B57?logo=sqlite&logoColor=white)](https://sqlite.org/)
[![Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue)](./LICENSE)

## Project background

XinT Panorama brings panorama file management, scene organization, and website display together. Manage images on your own service, organize them into project scenes, and reuse them in project pages or existing websites.

![XinT Panorama console with the built-in demo panorama](docs/assets/studio-preview.png)

## Features

- Add panorama images by uploading files or registering image URLs; organize them into groups, filter the gallery, and browse eight items per page.
- Organize project scenes and hotspots, import or export project JSON, and create release snapshots.
- View panoramas with Photo Sphere Viewer (PSV) by default, or choose the simplified original spherical viewer for compatibility.
- Choose which viewer controls appear in the console.
- Store images in browser IndexedDB, server files, SQLite, or Turso; server and browser storage also support JPEG, PNG, and WebP transcoding.
- Embed panoramas in websites with a script or iframe.
- Back up and restore the database and locally stored media.

## Quick start

Requires Node.js 24 or later.

```bash
git clone https://github.com/XinTycd/XinT-Panorama-System.git
cd XinT-Panorama-System
npm ci
npm start
```

Open the console at <http://127.0.0.1:7211>. The API listens at <http://127.0.0.1:7210> by default. For Docker, configuration, backup, and restore instructions, see the [deployment guide](./docs/DEPLOYMENT.md) (Chinese).

## Configuration

Choose `psv` (the default) or `legacy` as the viewer engine in `config.json`:

```json
{ "viewer": { "engine": "psv" } }
```

The same choice is available in the local console settings. See the [deployment guide](./docs/DEPLOYMENT.md) for configuration details.

## Embedding

```html
<div id="panorama"></div>
<script
  src="https://your-host.example/embed.js"
  data-target="panorama"
  data-panorama-no="1"
></script>
```

See the [embedding reference](./docs/EMBEDDING.md) (Chinese) for script attributes and iframe options. Use HTTPS for both the host page and XinT service to avoid mixed-content blocks.

## Image storage

| Location | Image content | Availability |
| --- | --- | --- |
| Browser | IndexedDB | This browser origin only; unavailable to standalone embeds |
| Server files | Image files or Base64 | Served by the XinT instance |
| SQLite | Base64 | Served by the XinT instance |
| Turso | Base64 | Requires a configured database URL and token |

Gallery and project metadata remain in local SQLite. Change storage settings from the local console on the machine running the backend. See the [deployment guide](./docs/DEPLOYMENT.md) (Chinese) for setup details.

## Development

```bash
npm test
npm run check:config
npm run build:vendor
```

Development requires Node.js 24. `npm run build:vendor` builds the local viewer assets; application startup also creates them when needed.

## Documentation

- [Documentation index](./docs/README.md)
- [Deployment](./docs/DEPLOYMENT.md) (Chinese)
- [API reference](./docs/API.md) (Chinese)
- [Embedding reference](./docs/EMBEDDING.md) (Chinese)
- [Changelog](./CHANGELOG.md), including the [v0.2.2 release notes](./docs/releases/v0.2.2.md)

## Contributing

Read the [contribution guide](./CONTRIBUTING.md) (Chinese) and use [GitHub Issues](https://github.com/XinTycd/XinT-Panorama-System/issues) to report bugs or suggest changes.

## License

Licensed under the [Apache License 2.0](./LICENSE); third-party component terms are listed in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md). See [SECURITY.md](./SECURITY.md) (Chinese) to report a security issue.
