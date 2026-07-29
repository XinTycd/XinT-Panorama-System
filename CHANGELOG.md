# Changelog

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
