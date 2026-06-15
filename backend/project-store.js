const { getDatabase, transaction } = require("./sqlite");
const projectDelivery = require("./project-delivery");

const DB_DRIVER = "sqlite";

function makeId(prefix) {
  return [prefix, Date.now().toString(36), Math.random().toString(36).slice(2, 10)].join("-");
}

function now() {
  return new Date().toISOString();
}

function createStoreError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function db() {
  return getDatabase();
}

async function initialize() {
  db();
}

function normalizeProject(input) {
  const timestamp = now();
  return {
    id: String(input.id || makeId("project")),
    name: String(input.name || "未命名项目").trim() || "未命名项目",
    description: String(input.description || ""),
    createdAt: input.createdAt || timestamp,
    updatedAt: timestamp
  };
}

function normalizeScene(input) {
  const timestamp = now();
  return {
    id: String(input.id || makeId("scene")),
    projectId: String(input.projectId || ""),
    panoramaId: input.panoramaId ? String(input.panoramaId).trim() || null : null,
    name: String(input.name || "未命名场景").trim() || "未命名场景",
    initialYaw: numberOrNull(input.initialYaw),
    initialPitch: numberOrNull(input.initialPitch),
    initialFov: numberOrNull(input.initialFov),
    createdAt: input.createdAt || timestamp,
    updatedAt: timestamp
  };
}

function normalizeHotspot(input) {
  const timestamp = now();
  const type = String(input.type || "info");
  if (["info", "link", "scene"].indexOf(type) === -1) {
    throw createStoreError(400, "热点类型必须是 info、link 或 scene");
  }
  return {
    id: String(input.id || makeId("hotspot")),
    sceneId: String(input.sceneId || ""),
    type: type,
    title: String(input.title || "热点").trim() || "热点",
    description: String(input.description || ""),
    targetUrl: input.targetUrl ? String(input.targetUrl) : null,
    targetSceneId: input.targetSceneId ? String(input.targetSceneId) : null,
    yaw: numberOrNull(input.yaw),
    pitch: numberOrNull(input.pitch),
    createdAt: input.createdAt || timestamp,
    updatedAt: timestamp
  };
}

function numberOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parsePagination(options) {
  const limitValue = options && options.limit;
  const offsetValue = options && options.offset;
  const rawLimit = limitValue === null || limitValue === undefined || limitValue === "" ? 0 : Number(limitValue);
  const rawOffset = offsetValue === null || offsetValue === undefined || offsetValue === "" ? 0 : Number(offsetValue);
  const limit = Number.isFinite(rawLimit) && rawLimit !== 0 ? Math.max(1, Math.min(100, Math.trunc(rawLimit))) : 20;
  const offset = Number.isFinite(rawOffset) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.trunc(rawOffset))) : 0;
  return { limit: limit, offset: offset };
}

async function listProjects(options) {
  const pagination = parsePagination(options);
  const database = db();
  const total = database.prepare("SELECT COUNT(*) AS total FROM projects").get().total;
  const rows = database.prepare(
    "SELECT id, name, description, created_at, updated_at FROM projects ORDER BY updated_at DESC, id ASC LIMIT ? OFFSET ?"
  ).all(pagination.limit, pagination.offset);
  return {
    items: rows.map(projectFromRow),
    total: Number(total),
    limit: pagination.limit,
    offset: pagination.offset
  };
}

function assertUniqueId(table, id) {
  const row = db().prepare("SELECT id FROM " + table + " WHERE id=?").get(id);
  if (row) throw createStoreError(409, "ID 已存在，请使用其他 ID");
}

function insertProject(database, project) {
  database.prepare("INSERT INTO projects (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
    .run(project.id, project.name, project.description, project.createdAt, project.updatedAt);
}

function insertScene(database, scene) {
  database.prepare("INSERT INTO scenes (id, project_id, panorama_id, name, initial_yaw, initial_pitch, initial_fov, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(scene.id, scene.projectId, scene.panoramaId, scene.name, scene.initialYaw, scene.initialPitch, scene.initialFov, scene.createdAt, scene.updatedAt);
}

function insertHotspot(database, hotspot) {
  database.prepare("INSERT INTO hotspots (id, scene_id, type, title, description, target_url, target_scene_id, yaw, pitch, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(hotspot.id, hotspot.sceneId, hotspot.type, hotspot.title, hotspot.description, hotspot.targetUrl, hotspot.targetSceneId, hotspot.yaw, hotspot.pitch, hotspot.createdAt, hotspot.updatedAt);
}

function touchProject(database, projectId) {
  const current = database.prepare("SELECT updated_at FROM projects WHERE id=?").get(projectId);
  if (!current) return;
  let timestamp = now();
  if (timestamp <= current.updated_at) timestamp = new Date(Date.parse(current.updated_at) + 1).toISOString();
  database.prepare("UPDATE projects SET updated_at=? WHERE id=?").run(timestamp, projectId);
}

function assertPanoramaExists(database, panoramaId) {
  if (panoramaId === null || panoramaId === undefined || panoramaId === "") return;
  if (!database.prepare("SELECT id FROM panoramas WHERE id=?").get(panoramaId)) {
    throw createStoreError(400, "panoramaId 对应的全景图不存在");
  }
}

async function createProject(input) {
  const project = normalizeProject(input || {});
  assertUniqueId("projects", project.id);
  insertProject(db(), project);
  return project;
}

async function updateProject(id, input) {
  const project = await getProject(id);
  if (!project) return null;
  const updated = Object.assign({}, project, {
    name: input && input.name !== undefined ? String(input.name || "").trim() || project.name : project.name,
    description: input && input.description !== undefined ? String(input.description || "") : project.description,
    updatedAt: now()
  });
  db().prepare("UPDATE projects SET name=?, description=?, updated_at=? WHERE id=?")
    .run(updated.name, updated.description, updated.updatedAt, updated.id);
  return updated;
}

async function getProject(id) {
  const row = db().prepare("SELECT id, name, description, created_at, updated_at FROM projects WHERE id=?").get(id);
  return row ? projectFromRow(row) : null;
}

async function createScene(projectId, input) {
  const scene = normalizeScene(Object.assign({}, input || {}, { projectId: projectId }));
  return transaction(function insertSceneAndTouch(database) {
    if (!database.prepare("SELECT id FROM projects WHERE id=?").get(projectId)) throw createStoreError(404, "项目不存在");
    if (database.prepare("SELECT id FROM scenes WHERE id=?").get(scene.id)) throw createStoreError(409, "ID 已存在，请使用其他 ID");
    assertPanoramaExists(database, scene.panoramaId);
    insertScene(database, scene);
    touchProject(database, projectId);
    return scene;
  });
}

async function updateScene(id, input) {
  return transaction(function updateSceneAndTouch(database) {
    const row = database.prepare("SELECT * FROM scenes WHERE id=?").get(String(id));
    if (!row) return null;
    const scene = sceneFromRow(row);
    const updated = Object.assign({}, scene, {
      panoramaId: input && input.panoramaId !== undefined ? (input.panoramaId ? String(input.panoramaId).trim() || null : null) : scene.panoramaId,
      name: input && input.name !== undefined ? String(input.name || "").trim() || scene.name : scene.name,
      initialYaw: input && input.initialYaw !== undefined ? numberOrNull(input.initialYaw) : scene.initialYaw,
      initialPitch: input && input.initialPitch !== undefined ? numberOrNull(input.initialPitch) : scene.initialPitch,
      initialFov: input && input.initialFov !== undefined ? numberOrNull(input.initialFov) : scene.initialFov,
      updatedAt: now()
    });
    if (input && input.panoramaId !== undefined) assertPanoramaExists(database, updated.panoramaId);
    database.prepare("UPDATE scenes SET panorama_id=?, name=?, initial_yaw=?, initial_pitch=?, initial_fov=?, updated_at=? WHERE id=?")
      .run(updated.panoramaId, updated.name, updated.initialYaw, updated.initialPitch, updated.initialFov, updated.updatedAt, updated.id);
    touchProject(database, updated.projectId);
    return updated;
  });
}

async function deleteProject(id) {
  return transaction(function deleteProjectRecord(database) {
    const result = database.prepare("DELETE FROM projects WHERE id=?").run(String(id));
    return result.changes > 0;
  });
}

async function deleteScene(id) {
  return transaction(function deleteSceneRecord(database) {
    const scene = database.prepare("SELECT id, project_id FROM scenes WHERE id=?").get(String(id));
    if (!scene) return null;
    database.prepare("DELETE FROM hotspots WHERE type='scene' AND target_scene_id=? AND scene_id IN (SELECT id FROM scenes WHERE project_id=?)")
      .run(scene.id, scene.project_id);
    database.prepare("DELETE FROM scenes WHERE id=?").run(scene.id);
    touchProject(database, scene.project_id);
    return { id: scene.id, projectId: scene.project_id };
  });
}

async function getScene(id) {
  const row = db().prepare("SELECT id, project_id, panorama_id, name, initial_yaw, initial_pitch, initial_fov, created_at, updated_at FROM scenes WHERE id=?").get(id);
  return row ? sceneFromRow(row) : null;
}

async function listProjectScenes(projectId) {
  return db().prepare("SELECT id, project_id, panorama_id, name, initial_yaw, initial_pitch, initial_fov, created_at, updated_at FROM scenes WHERE project_id=? ORDER BY rowid ASC")
    .all(projectId).map(sceneFromRow);
}

async function createHotspot(sceneId, input) {
  const hotspot = normalizeHotspot(Object.assign({}, input || {}, { sceneId: sceneId }));
  return transaction(function insertHotspotAndTouch(database) {
    const sceneRow = database.prepare("SELECT id, project_id FROM scenes WHERE id=?").get(String(sceneId));
    if (!sceneRow) throw createStoreError(404, "场景不存在");
    if (database.prepare("SELECT id FROM hotspots WHERE id=?").get(hotspot.id)) throw createStoreError(409, "ID 已存在，请使用其他 ID");
    validateHotspot(hotspot, sceneRow.project_id, sceneId, database);
    insertHotspot(database, hotspot);
    touchProject(database, sceneRow.project_id);
    return hotspot;
  });
}

async function updateHotspot(id, input) {
  return transaction(function updateHotspotAndTouch(database) {
    const row = database.prepare("SELECT * FROM hotspots WHERE id=?").get(String(id));
    if (!row) return null;
    const hotspot = hotspotFromRow(row);
    const scene = database.prepare("SELECT id, project_id FROM scenes WHERE id=?").get(hotspot.sceneId);
    if (!scene) throw createStoreError(404, "场景不存在");
    const updated = normalizeHotspot(Object.assign({}, hotspot, input || {}, { id: hotspot.id, sceneId: hotspot.sceneId, createdAt: hotspot.createdAt }));
    validateHotspot(updated, scene.project_id, scene.id, database);
    database.prepare("UPDATE hotspots SET type=?, title=?, description=?, target_url=?, target_scene_id=?, yaw=?, pitch=?, updated_at=? WHERE id=?")
      .run(updated.type, updated.title, updated.description, updated.targetUrl, updated.targetSceneId, updated.yaw, updated.pitch, updated.updatedAt, updated.id);
    touchProject(database, scene.project_id);
    return updated;
  });
}

function validateHotspot(hotspot, projectId, currentSceneId, database) {
  validateHotspotFields(hotspot, currentSceneId);
  if (hotspot.type === "scene") {
    const targetScene = database.prepare("SELECT project_id FROM scenes WHERE id=?").get(hotspot.targetSceneId);
    if (!targetScene || targetScene.project_id !== projectId) throw createStoreError(400, "场景热点必须指向同一项目中的有效场景");
  }
}

async function deleteHotspot(id) {
  return transaction(function deleteHotspotRecord(database) {
    const hotspot = database.prepare("SELECT h.id, s.project_id FROM hotspots h JOIN scenes s ON s.id=h.scene_id WHERE h.id=?").get(String(id));
    if (!hotspot) return false;
    database.prepare("DELETE FROM hotspots WHERE id=?").run(hotspot.id);
    touchProject(database, hotspot.project_id);
    return true;
  });
}

function validateHotspotFields(hotspot, currentSceneId) {
  if (!Number.isFinite(hotspot.yaw) || !Number.isFinite(hotspot.pitch)) throw createStoreError(400, "热点必须包含有效的 yaw 和 pitch 坐标");
  if (hotspot.type === "link" && !/^https?:\/\//i.test(hotspot.targetUrl || "")) throw createStoreError(400, "外链热点必须使用 http 或 https 地址");
  if (hotspot.type === "scene" && !hotspot.targetSceneId) throw createStoreError(400, "场景热点必须指定 targetSceneId");
  if (hotspot.type !== "scene" && hotspot.targetSceneId) throw createStoreError(400, "只有场景热点可以指定 targetSceneId");
  if (hotspot.type !== "link" && hotspot.targetUrl) throw createStoreError(400, "只有外链热点可以指定 targetUrl");
  if (hotspot.type === "scene" && hotspot.targetSceneId === currentSceneId) throw createStoreError(400, "场景热点不能指向自身");
}

async function getHotspot(id) {
  const row = db().prepare("SELECT id, scene_id, type, title, description, target_url, target_scene_id, yaw, pitch, created_at, updated_at FROM hotspots WHERE id=?").get(id);
  return row ? hotspotFromRow(row) : null;
}

async function listSceneHotspots(sceneId) {
  return db().prepare("SELECT id, scene_id, type, title, description, target_url, target_scene_id, yaw, pitch, created_at, updated_at FROM hotspots WHERE scene_id=? ORDER BY created_at ASC, id ASC")
    .all(sceneId).map(hotspotFromRow);
}

function nextReleaseVersion(maxVersion) {
  return (Number(maxVersion) || 0) + 1;
}

async function createRelease(projectId, input, options) {
  const projectPackage = await getProjectPackage(projectId, { includeReleases: false });
  if (!projectPackage) throw createStoreError(404, "项目不存在");
  const galleryItems = options && options.galleryItems || [];
  const report = projectDelivery.analyzeProject(projectPackage, galleryItems, require("./sqlite").STORAGE_DIR);
  if (report.summary.error > 0) {
    const error = createStoreError(422, "项目存在阻止发布的问题");
    error.report = report;
    throw error;
  }
  const snapshot = await projectDelivery.createReleaseSnapshot(projectPackage, galleryItems, require("./sqlite").STORAGE_DIR);
  const missingSnapshotAssets = snapshot.assets.filter(function findMissingAsset(asset) {
    return asset.status === "missing";
  });
  if (missingSnapshotAssets.length) {
    missingSnapshotAssets.forEach(function reportMissingAsset(asset) {
      report.checks.push({
        id: "ASSET_MISSING_DURING_PUBLISH",
        level: "error",
        title: "资源在生成发布清单时不可用",
        detail: "资源“" + (asset.name || asset.id) + "”缺失或无法读取，请检查后重试。",
        entityId: asset.id
      });
    });
    report.summary.error += missingSnapshotAssets.length;
    report.score = Math.max(0, report.score - missingSnapshotAssets.length * 20);
    report.ready = false;
    const error = createStoreError(422, "项目资源在生成发布清单期间不可用");
    error.report = report;
    throw error;
  }
  const release = {
    id: makeId("release"),
    projectId: projectId,
    name: String((input && input.name) || "发布版本").trim() || "发布版本",
    version: 0,
    createdAt: now(),
    snapshot: snapshot
  };
  transaction(function insertVersion(database) {
    const currentProject = database.prepare("SELECT updated_at FROM projects WHERE id=?").get(projectId);
    if (!currentProject) throw createStoreError(404, "项目不存在");
    if (currentProject.updated_at !== projectPackage.project.updatedAt) {
      throw createStoreError(409, "项目内容在生成发布快照期间发生变化，请重试");
    }
    const row = database.prepare("SELECT COALESCE(MAX(CAST(version AS INTEGER)), 0) AS max_version FROM releases WHERE project_id=?").get(projectId);
    release.version = nextReleaseVersion(row.max_version);
    database.prepare("INSERT INTO releases (id, project_id, name, version, snapshot, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(release.id, release.projectId, release.name, release.version, JSON.stringify(release.snapshot), release.createdAt);
  });
  return release;
}

async function getRelease(id) {
  const row = db().prepare("SELECT id, project_id, name, version, snapshot, created_at FROM releases WHERE id=?").get(id);
  return row ? releaseFromRow(row) : null;
}

async function getProjectPackage(projectId, options) {
  const project = await getProject(projectId);
  if (!project) return null;
  const scenes = db().prepare("SELECT id, project_id, panorama_id, name, initial_yaw, initial_pitch, initial_fov, created_at, updated_at FROM scenes WHERE project_id=? ORDER BY rowid ASC")
    .all(projectId).map(sceneFromRow);
  const hotspots = scenes.length
    ? db().prepare("SELECT h.id, h.scene_id, h.type, h.title, h.description, h.target_url, h.target_scene_id, h.yaw, h.pitch, h.created_at, h.updated_at FROM hotspots h JOIN scenes s ON s.id=h.scene_id WHERE s.project_id=? ORDER BY h.created_at ASC, h.id ASC").all(projectId).map(hotspotFromRow)
    : [];
  const releases = options && options.includeReleases === false ? [] : (await listProjectReleases(projectId)).map(releaseSummary);
  return { project: project, scenes: scenes, hotspots: hotspots, releases: releases };
}

function releaseSummary(release) {
  return {
    id: release.id,
    projectId: release.projectId,
    name: release.name,
    version: release.version,
    createdAt: release.createdAt,
    integrityDigest: release.snapshot && release.snapshot.integrity ? release.snapshot.integrity.digest : null
  };
}

async function listProjectReleases(projectId) {
  return db().prepare("SELECT id, project_id, name, version, snapshot, created_at FROM releases WHERE project_id=? ORDER BY version DESC")
    .all(projectId).map(releaseFromRow);
}

function planProjectImport(projectPackage) {
  const source = projectPackage;
  if (!isRecord(source) || !isRecord(source.project) || typeof source.project.name !== "string" || !source.project.name.trim()) {
    throw createStoreError(400, "导入数据必须包含有效的项目名称");
  }
  const scenesInput = source.scenes === undefined ? [] : source.scenes;
  const hotspotsInput = source.hotspots === undefined ? [] : source.hotspots;
  if (!Array.isArray(scenesInput) || !Array.isArray(hotspotsInput)) throw createStoreError(400, "导入数据的 scenes 和 hotspots 必须是数组");

  const project = normalizeProject({ name: source.project.name, description: source.project.description });
  const sceneMap = new Map();
  const scenes = scenesInput.map(function planScene(sceneInput) {
    if (!isRecord(sceneInput) || typeof sceneInput.id !== "string" || !sceneInput.id.trim()) throw createStoreError(400, "导入场景必须包含有效且唯一的 ID");
    const sourceId = sceneInput.id;
    if (sceneMap.has(sourceId)) throw createStoreError(400, "导入数据包含重复的场景 ID");
    const scene = normalizeScene(Object.assign({}, sceneInput, { id: makeId("scene"), projectId: project.id }));
    sceneMap.set(sourceId, scene.id);
    return scene;
  });
  const hotspotIds = new Set();
  const hotspots = hotspotsInput.map(function planHotspot(hotspotInput) {
    if (!isRecord(hotspotInput) || typeof hotspotInput.id !== "string" || !hotspotInput.id.trim()) throw createStoreError(400, "导入热点必须包含有效且唯一的 ID");
    if (hotspotIds.has(hotspotInput.id)) throw createStoreError(400, "导入数据包含重复的热点 ID");
    hotspotIds.add(hotspotInput.id);
    if (typeof hotspotInput.sceneId !== "string" || !sceneMap.has(hotspotInput.sceneId)) throw createStoreError(400, "导入热点所属场景不存在");
    const mappedTarget = hotspotInput.targetSceneId ? sceneMap.get(hotspotInput.targetSceneId) : null;
    if (hotspotInput.type === "scene" && !mappedTarget) throw createStoreError(400, "导入场景热点必须指向已导入的场景");
    if (hotspotInput.type !== "scene" && hotspotInput.targetSceneId) throw createStoreError(400, "只有场景热点可以指定 targetSceneId");
    const hotspot = normalizeHotspot(Object.assign({}, hotspotInput, {
      id: makeId("hotspot"),
      sceneId: sceneMap.get(hotspotInput.sceneId),
      targetSceneId: mappedTarget
    }));
    validateHotspotFields(hotspot, hotspot.sceneId);
    return hotspot;
  });
  return { project: project, scenes: scenes, hotspots: hotspots };
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function importProject(projectPackage) {
  const plan = planProjectImport(projectPackage);
  transaction(function insertImportedProject(database) {
    insertProject(database, plan.project);
    plan.scenes.forEach(function insertImportedScene(scene) { insertScene(database, scene); });
    plan.hotspots.forEach(function insertImportedHotspot(hotspot) { insertHotspot(database, hotspot); });
  });
  return getProjectPackage(plan.project.id);
}

function projectFromRow(row) {
  return { id: row.id, name: row.name, description: row.description || "", createdAt: row.created_at, updatedAt: row.updated_at };
}

function sceneFromRow(row) {
  return {
    id: row.id, projectId: row.project_id, panoramaId: row.panorama_id || null, name: row.name,
    initialYaw: numberOrNull(row.initial_yaw), initialPitch: numberOrNull(row.initial_pitch), initialFov: numberOrNull(row.initial_fov),
    createdAt: row.created_at, updatedAt: row.updated_at
  };
}

function hotspotFromRow(row) {
  return {
    id: row.id, sceneId: row.scene_id, type: row.type, title: row.title, description: row.description || "",
    targetUrl: row.target_url || null, targetSceneId: row.target_scene_id || null, yaw: Number(row.yaw), pitch: Number(row.pitch),
    createdAt: row.created_at, updatedAt: row.updated_at
  };
}

function releaseFromRow(row) {
  return { id: row.id, projectId: row.project_id, name: row.name, version: Number(row.version), snapshot: JSON.parse(row.snapshot), createdAt: row.created_at };
}

module.exports = {
  DB_DRIVER,
  initialize,
  listProjects,
  createProject,
  updateProject,
  deleteProject,
  getProject,
  createScene,
  updateScene,
  deleteScene,
  getScene,
  listProjectScenes,
  createHotspot,
  updateHotspot,
  deleteHotspot,
  getHotspot,
  listSceneHotspots,
  createRelease,
  getRelease,
  getProjectPackage,
  listProjectReleases,
  importProject,
  planProjectImport
};
