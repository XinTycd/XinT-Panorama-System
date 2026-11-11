# Changelog

## v0.2.5 — 2026-11-11

- Stop returning stored panorama files and source URLs from public API responses. Serve metadata-free, lossless previews and generated thumbnails; remote imports require HTTPS and validate DNS destinations, while the raw-image proxy is retired.
- Store the API address, built-in plugin state, embed preset, and toolbar visibility in server-side console settings. Keep only the language choice in the browser.
- Add Simplified Chinese, Traditional Chinese, and English console interfaces with language selection in Settings; improve copy feedback, hidden-control labels, and scrollbar styling.

See the [English release notes](docs/releases/v0.2.5.md) and [简体中文版本](docs/releases/v0.2.5-zh-CN.md).

## v0.2.4 — 2026-11-03

- Load only the configured engine at console startup and request gallery metadata alongside configuration.
- Serve precompressed viewer scripts and styles to browsers that accept Brotli.
- Remove JSON response indentation to reduce API transfer size.
- Use smaller WebP thumbnails for supported local uploads. The viewer continues to load the stored panorama.
- Accept the `compact` toolbar preset in script and iframe embeds.
- Refresh the console and embed screenshots in both README editions.
- Remove the repeated resolution label from the console's scene details.

See the [English release notes](docs/releases/v0.2.4.md) and [简体中文版本](docs/releases/v0.2.4-zh-CN.md).

## v0.2.3 — 2026-09-19

- Add a local built-in plugin registry. The project workspace starts disabled and can be enabled or disabled in the console; its preference is stored in the current browser.
- Refine project and gallery management, make storage settings respond to their selected mode, and make scene deletion refresh safely.
- Generate copyable iframe and JavaScript embed examples for the selected panorama, and add the system information menu to the embedded viewer.
- Reuse shared Phosphor icons across the console and viewer, and improve embedded startup by loading only the selected engine and requesting panorama metadata alongside configuration.
- Reduce repeated startup and image lookup work, write local image files asynchronously, and refresh the gallery once per upload batch.
- Keep application loading feedback while hiding the viewer's built-in spinner.

See the [English release notes](docs/releases/v0.2.3.md) and [简体中文版本](docs/releases/v0.2.3-zh-CN.md).

## v0.2.2 — 2026-08-15

- Make panorama changes predictable: concurrent requests for the same image share a load, and only the latest selection can update the viewer.
- Clean up temporary image URLs and viewer work when a load is cancelled, the page is hidden, or the viewer is closed.
- Schedule rotation and view updates with the viewer render loop, and limit the drawing buffer by device pixel ratio and container size.
- Present XinT Panorama as a self-hosted 720° panorama system for managing project scenes, hotspots, and website embeds.

See the [English release notes](docs/releases/v0.2.2.md) and [简体中文版本](docs/releases/v0.2.2-zh-CN.md).

## v0.2.1 — 2026-07-29

- Add Photo Sphere Viewer 5.15.1 as the default renderer and retain the simplified spherical renderer as an optional compatibility engine. Only the selected engine is initialized; console engine changes recreate the viewer in place and preserve its current image and view.
- Add locked local viewer asset generation, license notices, and Docker build output so the app does not load viewer code from a CDN.
- Add engine selection through the local console, `config.json`, and `PANORAMA_VIEWER_ENGINE`, with environment overrides taking precedence.
- Refine the PSV toolbar and save its visible-button preferences in a browser cookie; the legacy viewer remains limited to dragging and zoom buttons.
- Adapt project scene hotspots to the shared viewer interface and use the global engine selection when a widget loads.
- Expand viewer, asset-build, configuration, CSS, and embed regression coverage.

See the [v0.2.1 release notes](docs/releases/v0.2.1.md) and [简体中文版本](docs/releases/v0.2.1-zh-CN.md).

## v0.2.0 — 2026-06-16

- Move gallery and project metadata to SQLite and migrate legacy JSON gallery data on first startup when applicable.
- Add gallery groups and client-side filtering with eight items per page.
- Improve project, scene, hotspot, and resource references.
- Add browser, local server, local SQLite, and Turso SQLite image storage choices, plus JPEG/PNG/WebP transcoding options where supported.
- Add backup/restore utilities, configuration checks, and standalone widget embedding.
- Keep the viewer on the simplified standard spherical renderer with drag and zoom controls.

See the [English release notes](docs/releases/v0.2.0.md) and [简体中文版本](docs/releases/v0.2.0-zh-CN.md).
