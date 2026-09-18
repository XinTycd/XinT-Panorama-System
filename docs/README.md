# Documentation

This index groups the operational, maintenance, API, and planning documents for XinT Panorama System. The root [README](../README.md) is the English project overview; [简体中文 README](../README.zh-CN.md) is also available.

## Use and operate the application

- [Deployment, configuration, storage, backup, and restore](DEPLOYMENT.md) (Chinese)
- [API reference](API.md) (Chinese)
- [Embedding guide](EMBEDDING.md) (Chinese)
- [Icon system](ICONS.md): shared Phosphor SVG sprite, accessible use, and provenance.
- [Device integration assessment](DEVICE_INTEGRATION.md): current still-image boundary and proposed camera/live-video paths.
- [OpenAPI description](openapi.yaml)

## Architecture and product scope

- [Maintenance map](PROJECT_CONTEXT.md) (Chinese): current modules, schema, storage behavior, and regression coverage.
- [Product scope](PRODUCT.md) (Chinese): implemented features and current limitations.
- [Roadmap](ROADMAP.md) (Chinese): internal future work, not a list of shipped release guarantees.
- [Trusted delivery API design](Doc.C02-trusted-delivery-api.md) (Chinese)
- [Trusted delivery acceptance plan](Doc.E02-trusted-delivery-test-plan.md) (Chinese)
- [Accepted delivery ADR](adr/Doc.A02-trusted-delivery.md) (Chinese)

## Viewer

- [Viewer behavior and integration notes](VIEWER_INNOVATION.md) (Chinese): implemented engine choices and compatibility boundaries.
- [Viewer modernization plan](VIEWER_MODERNIZATION_PLAN.md) (Chinese): implementation status and future work. Tiling, real-device coverage, and extended tour plugins remain unimplemented.
- [Viewer integration log](logs/2026-11-14-psv-integration.log): actual browser and test evidence.
- [Earlier verification log](logs/2026-11-14-verification.log): data-layer and operations checks from the prior phase.
- [v0.2.1 validation log](logs/v0.2.1-validation.log): clean-install, tests, and configuration-check output from that release.
- [v0.2.2 candidate checks](logs/2026-11-14-v0.2.2-validation.log): test and configuration-check output from 2026-11-14.
- [Development history](DEVELOPMENT_LOG.md) (Chinese): dated summaries with links to command output.

## Releases

- [v0.2.3 — English](releases/v0.2.3.md)
- [v0.2.3 — 简体中文](releases/v0.2.3-zh-CN.md)
- [v0.2.2 — English](releases/v0.2.2.md)
- [v0.2.2 — 简体中文](releases/v0.2.2-zh-CN.md)
- [v0.2.1 — English](releases/v0.2.1.md)
- [v0.2.1 — 简体中文](releases/v0.2.1-zh-CN.md)
- [v0.2.0 — English](releases/v0.2.0.md)
- [v0.2.0 — 简体中文](releases/v0.2.0-zh-CN.md)
- [Changelog](../CHANGELOG.md)

API references and maintenance notes describe implemented behavior. Documents labelled as plans or proposals are not evidence that planned work has shipped.
