# API reference

The backend API defaults to `http://127.0.0.1:7210`. JSON request bodies use `Content-Type: application/json`. `GET /api/gallery` returns the complete gallery collection; the console filters and paginates it client-side with eight items per page.

## Status and settings

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Service status, application version, active modes, and database type |
| GET | `/api/config` | API/widget URLs, runtime modes, database/media settings, and fixed `viewer.engine: "legacy"` |
| PUT | `/api/settings/media-storage` | Update image storage settings; restricted to the local console |

The viewer is fixed to the simplified spherical renderer in this release; there is no viewer-engine setting endpoint.

## Gallery and groups

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/gallery` | Return all gallery records |
| GET | `/api/panoramas/by-no?no=1` | Look up a record by panorama number |
| POST | `/api/panoramas/create` | Register an existing local image reference |
| POST | `/api/panoramas/register` | Register a remote image URL |
| POST | `/api/panoramas/upload-base64` | Upload an image as a Base64 Data URL |
| POST | `/api/panoramas/update` | Update a record by `id` |
| DELETE | `/api/panoramas/:id` | Delete a gallery record; returns 409 when a project scene references it. Media is retained. |
| GET | `/api/panoramas/proxy?url=...` | Fetch an allowed remote image through the server proxy |
| GET / POST / DELETE | `/api/gallery/groups` | List, create, or delete a named group |
| POST | `/api/gallery/clear` | Clear gallery records without deleting image media |
| POST | `/api/gallery/seed-demo` | Add the built-in synthetic demo record |

To create a named group, send `{"name":"Lobby"}` to `POST /api/gallery/groups`. Deleting a group moves its records to the ungrouped state; an empty group remains. Create the group before assigning records to it. Group names are trimmed and limited to 64 Unicode characters.

## Projects, scenes, and hotspots

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/projects?limit=&offset=` | List projects with pagination |
| POST | `/api/projects` | Create a project |
| GET / POST / DELETE | `/api/projects/:id` | Read the project package, update the project, or delete it |
| POST | `/api/projects/import` | Import project JSON with new project, scene, and hotspot IDs |
| GET | `/api/projects/:id/export` | Export an `xint-panorama-project@1` JSON document |
| GET / POST | `/api/projects/:id/scenes` | List or create scenes |
| POST / DELETE | `/api/scenes/:id` | Update or delete a scene |
| GET / POST | `/api/scenes/:id/hotspots` | List or create hotspots |
| POST / DELETE | `/api/hotspots/:id` | Update or delete a hotspot |
| GET | `/api/projects/:id/diagnostics` | Check project readiness for a release snapshot |
| POST | `/api/projects/:id/releases` | Create a release snapshot |
| GET | `/api/releases/:id` | Read a release snapshot |
| GET | `/api/releases/:id/verify` | Verify a snapshot and readable local assets |

Project import/export and release snapshots store metadata and image references, not image payloads. Remote-only resources are not fetched during release verification.

## Image storage settings

`PUT /api/settings/media-storage` accepts the setting fields returned by `GET /api/config`:

```json
{
  "mode": "server",
  "format": "original",
  "codec": "jpeg",
  "quality": 85
}
```

Supported image locations are `client`, `server`, `sqlite`, and `cloud`; supported formats are `original`, `base64`, and `transcode`. SQLite-backed image storage uses Base64 and does not accept `original`. Transcoding supports JPEG, PNG, and WebP with a quality value from 1 to 100 where applicable. Cloud SQLite uploads are limited to 6 MiB. The endpoint is restricted to requests from the local console machine.

See [deployment and operations](../DEPLOYMENT.md) for storage behavior, migration, backup, and restore details.
