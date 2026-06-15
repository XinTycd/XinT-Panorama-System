const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const STORAGE_DIR = path.resolve(process.env.PANORAMA_STORAGE_DIR || path.join(__dirname, "storage"));
const DATABASE_FILE = path.join(STORAGE_DIR, "panorama.sqlite");
const DB_DRIVER = "sqlite";
const GALLERY_FILE = path.join(STORAGE_DIR, "gallery.json");
const CATALOG_FILE = path.join(STORAGE_DIR, "catalog.json");
const SCHEMA_VERSION = 3;

let database = null;
let transactionActive = false;

function readJsonIfPresent(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  try {
    return JSON.parse(raw || "{}");
  } catch (error) {
    throw new Error("无法解析迁移文件 " + filePath + ": " + error.message);
  }
}

function ensureUniqueIds(items, label) {
  const seen = new Set();
  for (const item of items) {
    if (!item || item.id === undefined || item.id === null || String(item.id) === "") {
      throw new Error(label + " 中存在缺少 id 的记录");
    }
    const id = String(item.id);
    if (seen.has(id)) throw new Error(label + " 中存在重复 id: " + id);
    seen.add(id);
  }
}

function galleryItemsWithNumbers(items) {
  const result = items.map(function copy(item) { return Object.assign({}, item); });
  const used = new Set();
  let next = 1;
  for (const item of result) {
    if (item.panoramaNo === undefined || item.panoramaNo === null || item.panoramaNo === "") continue;
    const number = Number(item.panoramaNo);
    if (!Number.isFinite(number) || number <= 0 || !Number.isInteger(number)) {
      throw new Error("gallery.json 中 panoramaNo 必须是正整数: " + item.id);
    }
    if (used.has(number)) throw new Error("gallery.json 中存在重复 panoramaNo: " + number);
    used.add(number);
    next = Math.max(next, number + 1);
  }
  for (const item of result) {
    if (item.panoramaNo !== undefined && item.panoramaNo !== null && item.panoramaNo !== "") continue;
    while (used.has(next)) next += 1;
    item.panoramaNo = next;
    used.add(next++);
  }
  return result;
}

function createSchema(db) {
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS panoramas (
      id TEXT PRIMARY KEY,
      panorama_no INTEGER NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      source_type TEXT NOT NULL,
      original_url TEXT,
      viewer_path TEXT NOT NULL,
      thumbnail_path TEXT,
      size INTEGER,
      width INTEGER,
      height INTEGER,
      created_at TEXT NOT NULL,
      group_name TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scenes (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      panorama_id TEXT,
      name TEXT NOT NULL,
      initial_yaw REAL,
      initial_pitch REAL,
      initial_fov REAL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS hotspots (
      id TEXT PRIMARY KEY,
      scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      target_url TEXT,
      target_scene_id TEXT,
      yaw REAL,
      pitch REAL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS releases (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      version INTEGER NOT NULL,
      snapshot TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(project_id, version)
    );
    CREATE INDEX IF NOT EXISTS idx_scenes_project_id ON scenes(project_id);
    CREATE INDEX IF NOT EXISTS idx_hotspots_scene_id ON hotspots(scene_id);
    CREATE INDEX IF NOT EXISTS idx_releases_project_id ON releases(project_id);
    CREATE TABLE IF NOT EXISTS panorama_number_sequence (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      high_water INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS panorama_groups (
      name TEXT PRIMARY KEY
    );
  `);
}

function importLegacyData(db) {
  const gallery = readJsonIfPresent(GALLERY_FILE);
  const catalog = readJsonIfPresent(CATALOG_FILE);
  const galleryRows = gallery === null ? [] : gallery.items;
  if (gallery !== null && !Array.isArray(galleryRows)) throw new Error("gallery.json 的 items 必须是数组");
  const panoramas = galleryItemsWithNumbers(galleryRows || []);
  ensureUniqueIds(panoramas, "gallery.json");
  const projects = catalog === null ? [] : (catalog.projects || []);
  const scenes = catalog === null ? [] : (catalog.scenes || []);
  const hotspots = catalog === null ? [] : (catalog.hotspots || []);
  const releases = catalog === null ? [] : (catalog.releases || []);
  for (const [rows, key] of [[projects, "projects"], [scenes, "scenes"], [hotspots, "hotspots"], [releases, "releases"]]) {
    if (!Array.isArray(rows)) throw new Error("catalog.json 的 " + key + " 必须是数组");
    ensureUniqueIds(rows, "catalog.json " + key);
  }

  const insertPanorama = db.prepare(`INSERT INTO panoramas
    (id, panorama_no, name, description, source_type, original_url, viewer_path, thumbnail_path, size, width, height, created_at, group_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const item of panoramas) insertPanorama.run(
    String(item.id), item.panoramaNo, String(item.name || item.title || "未命名全景图"), String(item.description || ""),
    String(item.sourceType || "database-record"), item.originalUrl || null, String(item.viewerPath || item.imageUrl || item.url || ""),
    item.thumbnailPath || item.viewerPath || item.imageUrl || item.url || null,
    item.size == null ? null : Number(item.size), item.width == null ? null : Number(item.width),
    item.height == null ? null : Number(item.height), String(item.createdAt || new Date().toISOString()),
    String(item.group == null ? "" : item.group).trim()
  );

  const insertProject = db.prepare("INSERT INTO projects (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)");
  for (const item of projects) insertProject.run(String(item.id), String(item.name || ""), String(item.description || ""), String(item.createdAt || ""), String(item.updatedAt || item.createdAt || ""));
  const insertScene = db.prepare(`INSERT INTO scenes
    (id, project_id, panorama_id, name, initial_yaw, initial_pitch, initial_fov, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const item of scenes) insertScene.run(String(item.id), String(item.projectId || ""), item.panoramaId == null ? null : String(item.panoramaId), String(item.name || ""), item.initialYaw ?? null, item.initialPitch ?? null, item.initialFov ?? null, String(item.createdAt || ""), String(item.updatedAt || item.createdAt || ""));
  const insertHotspot = db.prepare(`INSERT INTO hotspots
    (id, scene_id, type, title, description, target_url, target_scene_id, yaw, pitch, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const item of hotspots) insertHotspot.run(String(item.id), String(item.sceneId || ""), String(item.type || ""), String(item.title || ""), String(item.description || ""), item.targetUrl || null, item.targetSceneId || null, item.yaw ?? null, item.pitch ?? null, String(item.createdAt || ""), String(item.updatedAt || item.createdAt || ""));
  const insertRelease = db.prepare(`INSERT INTO releases
    (id, project_id, name, version, snapshot, created_at) VALUES (?, ?, ?, ?, ?, ?)`);
  for (const item of releases) insertRelease.run(String(item.id), String(item.projectId || ""), String(item.name || ""), String(item.version || ""), typeof item.snapshot === "string" ? item.snapshot : JSON.stringify(item.snapshot), String(item.createdAt || ""));
}

function getDatabase() {
  if (database) return database;
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  database = new DatabaseSync(DATABASE_FILE, { timeout: 5000 });
  try {
    createSchema(database);
    transaction(function migrate(db) {
      const version = Number(db.prepare("PRAGMA user_version").get().user_version || 0);
      if (version > SCHEMA_VERSION) {
        throw new Error("SQLite 数据库版本 " + version + " 高于当前支持版本 " + SCHEMA_VERSION);
      }
      if (version < SCHEMA_VERSION) {
        if (version < 1) importLegacyData(db);
        if (version < 2) {
          const columns = db.prepare("PRAGMA table_info(panoramas)").all().map((row) => row.name);
          if (!columns.includes("group_name")) db.exec("ALTER TABLE panoramas ADD COLUMN group_name TEXT NOT NULL DEFAULT ''");
        }
        if (version < 3) {
          db.exec("UPDATE panoramas SET group_name=trim(group_name) WHERE group_name<>trim(group_name)");
          db.exec("INSERT OR IGNORE INTO panorama_groups(name) SELECT DISTINCT group_name FROM panoramas WHERE group_name<>''");
        }
        const maxNo = Number(db.prepare("SELECT COALESCE(MAX(panorama_no), 0) AS max_no FROM panoramas").get().max_no || 0);
        db.prepare("INSERT INTO panorama_number_sequence (id, high_water) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET high_water = MAX(high_water, excluded.high_water)")
          .run(maxNo);
        db.exec("PRAGMA user_version = " + SCHEMA_VERSION);
      } else {
        const row = db.prepare("SELECT high_water FROM panorama_number_sequence WHERE id=1").get();
        if (!row) {
          const maxNo = Number(db.prepare("SELECT COALESCE(MAX(panorama_no), 0) AS max_no FROM panoramas").get().max_no || 0);
          db.prepare("INSERT INTO panorama_number_sequence (id, high_water) VALUES (1, ?)").run(maxNo);
        }
      }
    });
    return database;
  } catch (error) {
    database.close();
    database = null;
    throw error;
  }
}

function transaction(callback) {
  const db = getDatabase();
  if (transactionActive) throw new Error("SQLite nested transaction is not supported");
  db.exec("BEGIN IMMEDIATE");
  transactionActive = true;
  try {
    const result = callback(db);
    if (result && typeof result.then === "function") throw new Error("SQLite transaction callback must be synchronous");
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch (_) { /* transaction may already have ended */ }
    throw error;
  } finally {
    transactionActive = false;
  }
}

function closeDatabase() {
  if (database) database.close();
  database = null;
  transactionActive = false;
}

module.exports = { STORAGE_DIR, DATABASE_FILE, DB_DRIVER, getDatabase, transaction, closeDatabase };
