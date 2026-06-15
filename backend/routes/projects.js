const projectStore = require("../project-store");
const projectDelivery = require("../project-delivery");
const { STORAGE_DIR } = require("../sqlite");
const { readGallery } = require("../store");
const { sendJson, parseBody } = require("../api-http");

async function handleProjectApi(req, res, urlObject) {
  if (req.method === "GET" && urlObject.pathname === "/api/projects") {
    const result = await projectStore.listProjects({
      limit: urlObject.searchParams.get("limit"),
      offset: urlObject.searchParams.get("offset")
    });
    sendJson(res, 200, Object.assign({ ok: true }, result));
    return true;
  }

  if (req.method === "POST" && urlObject.pathname === "/api/projects") {
    const body = await parseBody(req);
    if (!String(body.name || "").trim()) {
      sendJson(res, 400, { ok: false, message: "项目名称不能为空" });
      return true;
    }
    const project = await projectStore.createProject(body);
    sendJson(res, 201, { ok: true, project: project });
    return true;
  }

  if (req.method === "POST" && urlObject.pathname === "/api/projects/import") {
    const body = await parseBody(req);
    const importPackage = body.project && body.project.project ? body.project : body;
    const projectPackage = await projectStore.importProject(importPackage);
    sendJson(res, 201, { ok: true, project: projectPackage });
    return true;
  }

  const projectDiagnosticsMatch = urlObject.pathname.match(/^\/api\/projects\/([^/]+)\/diagnostics$/);
  if (projectDiagnosticsMatch && req.method === "GET") {
    const projectId = decodeURIComponent(projectDiagnosticsMatch[1]);
    const projectPackage = await projectStore.getProjectPackage(projectId);
    if (!projectPackage) {
      sendJson(res, 404, { ok: false, message: "项目不存在" });
      return true;
    }
    const report = projectDelivery.analyzeProject(projectPackage, await readGallery(), STORAGE_DIR);
    sendJson(res, 200, { ok: true, report: report });
    return true;
  }

  const projectExportMatch = urlObject.pathname.match(/^\/api\/projects\/([^/]+)\/export$/);
  if (projectExportMatch && req.method === "GET") {
    const projectPackage = await projectStore.getProjectPackage(decodeURIComponent(projectExportMatch[1]));
    if (!projectPackage) {
      sendJson(res, 404, { ok: false, message: "项目不存在" });
      return true;
    }
    sendJson(res, 200, { ok: true, format: "xint-panorama-project@1", project: projectPackage });
    return true;
  }

  const projectScenesMatch = urlObject.pathname.match(/^\/api\/projects\/([^/]+)\/scenes$/);
  if (projectScenesMatch && req.method === "GET") {
    const projectId = decodeURIComponent(projectScenesMatch[1]);
    if (!await projectStore.getProject(projectId)) {
      sendJson(res, 404, { ok: false, message: "项目不存在" });
      return true;
    }
    sendJson(res, 200, { ok: true, items: await projectStore.listProjectScenes(projectId) });
    return true;
  }

  if (projectScenesMatch && req.method === "POST") {
    const projectId = decodeURIComponent(projectScenesMatch[1]);
    const body = await parseBody(req);
    if (await hasUnknownPanorama(body)) {
      sendJson(res, 400, { ok: false, message: "panoramaId 对应的全景图不存在" });
      return true;
    }
    const scene = await projectStore.createScene(projectId, body);
    sendJson(res, 201, { ok: true, scene: scene });
    return true;
  }

  const projectMatch = urlObject.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (projectMatch && req.method === "DELETE") {
    const id = decodeURIComponent(projectMatch[1]);
    const deleted = await projectStore.deleteProject(id);
    if (!deleted) {
      sendJson(res, 404, { ok: false, message: "项目不存在" });
      return true;
    }
    sendJson(res, 200, { ok: true, deleted: true, id: id });
    return true;
  }
  if (projectMatch && req.method === "GET") {
    const projectPackage = await projectStore.getProjectPackage(decodeURIComponent(projectMatch[1]));
    if (!projectPackage) {
      sendJson(res, 404, { ok: false, message: "项目不存在" });
      return true;
    }
    sendJson(res, 200, { ok: true, project: projectPackage });
    return true;
  }

  if (projectMatch && req.method === "POST") {
    const body = await parseBody(req);
    const project = await projectStore.updateProject(decodeURIComponent(projectMatch[1]), body);
    if (!project) {
      sendJson(res, 404, { ok: false, message: "项目不存在" });
      return true;
    }
    sendJson(res, 200, { ok: true, project: project });
    return true;
  }

  const projectReleasesMatch = urlObject.pathname.match(/^\/api\/projects\/([^/]+)\/releases$/);
  if (projectReleasesMatch && req.method === "POST") {
    try {
      const release = await projectStore.createRelease(
        decodeURIComponent(projectReleasesMatch[1]),
        await parseBody(req),
        { galleryItems: await readGallery() }
      );
      sendJson(res, 201, { ok: true, release: release });
    } catch (error) {
      if (error.statusCode === 422 && error.report) {
        sendJson(res, 422, { ok: false, message: error.message, report: error.report });
      } else {
        throw error;
      }
    }
    return true;
  }

  const sceneMatch = urlObject.pathname.match(/^\/api\/scenes\/([^/]+)$/);
  if (sceneMatch && req.method === "DELETE") {
    const id = decodeURIComponent(sceneMatch[1]);
    const deleted = await projectStore.deleteScene(id);
    if (!deleted) {
      sendJson(res, 404, { ok: false, message: "场景不存在" });
      return true;
    }
    sendJson(res, 200, { ok: true, deleted: true, id: deleted.id });
    return true;
  }
  if (sceneMatch && req.method === "POST") {
    const sceneId = decodeURIComponent(sceneMatch[1]);
    const body = await parseBody(req);
    const current = await projectStore.getScene(sceneId);
    if (!current) {
      sendJson(res, 404, { ok: false, message: "场景不存在" });
      return true;
    }
    if (await hasUnknownPanorama(body)) {
      sendJson(res, 400, { ok: false, message: "panoramaId 对应的全景图不存在" });
      return true;
    }
    const scene = await projectStore.updateScene(sceneId, body);
    sendJson(res, 200, { ok: true, scene: scene });
    return true;
  }

  const sceneHotspotsMatch = urlObject.pathname.match(/^\/api\/scenes\/([^/]+)\/hotspots$/);
  if (sceneHotspotsMatch && req.method === "GET") {
    const sceneId = decodeURIComponent(sceneHotspotsMatch[1]);
    if (!await projectStore.getScene(sceneId)) {
      sendJson(res, 404, { ok: false, message: "场景不存在" });
      return true;
    }
    sendJson(res, 200, { ok: true, items: await projectStore.listSceneHotspots(sceneId) });
    return true;
  }

  if (sceneHotspotsMatch && req.method === "POST") {
    const hotspot = await projectStore.createHotspot(decodeURIComponent(sceneHotspotsMatch[1]), await parseBody(req));
    sendJson(res, 201, { ok: true, hotspot: hotspot });
    return true;
  }

  const hotspotMatch = urlObject.pathname.match(/^\/api\/hotspots\/([^/]+)$/);
  if (hotspotMatch && req.method === "DELETE") {
    const id = decodeURIComponent(hotspotMatch[1]);
    const deleted = await projectStore.deleteHotspot(id);
    if (!deleted) {
      sendJson(res, 404, { ok: false, message: "热点不存在" });
      return true;
    }
    sendJson(res, 200, { ok: true, deleted: true, id: id });
    return true;
  }
  if (hotspotMatch && req.method === "POST") {
    const hotspot = await projectStore.updateHotspot(decodeURIComponent(hotspotMatch[1]), await parseBody(req));
    if (!hotspot) {
      sendJson(res, 404, { ok: false, message: "热点不存在" });
      return true;
    }
    sendJson(res, 200, { ok: true, hotspot: hotspot });
    return true;
  }

  const releaseVerifyMatch = urlObject.pathname.match(/^\/api\/releases\/([^/]+)\/verify$/);
  if (releaseVerifyMatch && req.method === "GET") {
    const release = await projectStore.getRelease(decodeURIComponent(releaseVerifyMatch[1]));
    if (!release) {
      sendJson(res, 404, { ok: false, message: "发布版本不存在" });
      return true;
    }
    const verification = await projectDelivery.verifyReleaseSnapshot(release.snapshot, STORAGE_DIR);
    sendJson(res, 200, { ok: true, releaseId: release.id, verification: verification });
    return true;
  }

  const releaseMatch = urlObject.pathname.match(/^\/api\/releases\/([^/]+)$/);
  if (releaseMatch && req.method === "GET") {
    const release = await projectStore.getRelease(decodeURIComponent(releaseMatch[1]));
    if (!release) {
      sendJson(res, 404, { ok: false, message: "发布版本不存在" });
      return true;
    }
    sendJson(res, 200, { ok: true, release: release });
    return true;
  }

  return false;
}

async function hasUnknownPanorama(body) {
  if (body.panoramaId === undefined || body.panoramaId === null || !String(body.panoramaId).trim()) return false;
  const panoramas = await readGallery();
  return !panoramas.some(function matchPanorama(item) { return item.id === String(body.panoramaId).trim(); });
}

module.exports = { handleProjectApi };
