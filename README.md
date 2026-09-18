# XinT Panorama System

**English** | [简体中文](./README.zh-CN.md)

Self-hosted 720° panorama viewer for embedding in websites.

[![Node.js 24+](https://img.shields.io/badge/Node.js-24%2B-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![SQLite](https://img.shields.io/badge/Database-SQLite-003B57?logo=sqlite)](https://sqlite.org/)
[![Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue)](./LICENSE)

## Project background

Consumer 360 camera options include virtual-tour bundles from [Insta360](https://store.insta360.com/product/virtual_tour_kit), [RICOH THETA](https://www.ricoh360.com/tours/) cameras, and DJI's [Osmo 360](https://www.dji.com/360). These devices have made it easier for individual creators and small teams to capture complete views of a space. Real estate listings, venue introductions, and [construction-site records](https://www.ricoh.com/-/Media/Ricoh/Sites/com/release/2021/pdf/0113_1.pdf) have also created a need to view and share those spaces remotely on the web.

XinT Panorama System provides a self-hosted 720° panorama viewer that can be embedded in an existing website. Add it with a script or iframe; it runs in its own frame. The console is for resource management, viewer configuration, and embed previews.

## Embed in a website

### With the embed script

Put the script in a page with a dedicated, empty container. Replace the sample host and panorama number with your service address and gallery item.

```html
<div id="xint-panorama"></div>
<script
  src="https://panorama.example/embed.js"
  data-target="xint-panorama"
  data-panorama-no="1"
></script>
```

The script creates a responsive iframe in the container and clears that container first. Use a dedicated element for the viewer.

### With an iframe

```html
<iframe
  src="https://panorama.example/widget?panoramaNo=1"
  title="Panorama viewer"
  loading="lazy"
  allowfullscreen
  style="display:block; width:100%; aspect-ratio:16/9; border:0;"
></iframe>
```

For direct image embedding, use the widget's `imageUrl` query parameter; the widget loads that image through the XinT service's image proxy. See the [embedding guide](./docs/EMBEDDING.md) for supported parameters, host requirements, and image handling.

The iframe keeps viewer scripts and styles separate from the host page. Embedding does not re-encode the panorama. Original image bytes can be kept with original-format storage, or with an untranscoded Base64 storage option; image transcoding is a separate storage setting. Displayed detail still depends on the browser, device, and available texture size.

## Quick start

Requires Node.js 24 or later. To run the API and embeddable viewer without the console:

```bash
git clone https://github.com/XinTycd/XinT-Panorama-System.git
cd XinT-Panorama-System
npm ci
npm run start:backend
```

The API, widget, embed script, and viewer assets are served from port 7210 by default. The optional management console is served at port 7211 when running `npm start`, which starts both services. See the [deployment guide](./docs/DEPLOYMENT.md) (Chinese) for reverse proxy and storage setup.

## Management console

The console manages panorama images, gallery groups, project scenes, and hotspots. It also provides image preview and embed debugging. A widget embed displays one panorama rather than a whole project.

The project workspace is a built-in console plugin and is disabled by default. Use the Enable and Disable buttons in the Plugins drawer to show or hide project and scene controls. Its state is stored in the current browser.

![XinT Panorama management console with the built-in demo panorama](docs/assets/studio-preview.png)

Gallery images can be uploaded or registered by URL, grouped and filtered, and browsed eight per page. Project scenes and hotspots can be imported or exported as project JSON.

The Embedding drawer generates copyable iframe and JavaScript snippets for a selected server panorama, with full, compact, and no-toolbar presets.

## Configuration

Choose the viewer engine with `viewer.engine` in `config.json`: `psv` is the default; `legacy` selects the simplified original spherical viewer. The same setting is available in the local console.

```json
{ "viewer": { "engine": "psv" } }
```

## Image storage

| Location | Image content | Availability |
| --- | --- | --- |
| Browser | IndexedDB | This browser origin only; unavailable to standalone embeds |
| Server files | Image files or Base64 | Served by the XinT instance |
| SQLite | Base64 | Served by the XinT instance |
| Turso | Base64 | Requires a configured database URL and token |

Gallery and project metadata remain in local SQLite. Storage mode and transcoding settings apply to new uploads; configure them from the console on the machine running the backend.

## Development

```bash
npm test
npm run check:config
npm run build:vendor
```

Development requires Node.js 24. `npm run build:vendor` creates the local viewer assets; startup also builds them when needed.

## Documentation

- [Documentation index](./docs/README.md)
- [Deployment](./docs/DEPLOYMENT.md) (Chinese)
- [API reference](./docs/API.md) (Chinese)
- [Embedding guide](./docs/EMBEDDING.md) (Chinese)
- [Changelog](./CHANGELOG.md), including the [v0.2.3 release notes](./docs/releases/v0.2.3.md)

## Contributing

Read the [contribution guide](./CONTRIBUTING.md) (Chinese) and use [GitHub Issues](https://github.com/XinTycd/XinT-Panorama-System/issues) to report bugs or suggest changes.

## License

Licensed under the [Apache License 2.0](./LICENSE); third-party component terms are listed in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md). See [SECURITY.md](./SECURITY.md) (Chinese) to report a security issue.
