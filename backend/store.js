const fs = require("fs");
const path = require("path");

const STORAGE_DIR = path.resolve(process.env.PANORAMA_STORAGE_DIR || path.join(__dirname, "storage"));
const GALLERY_FILE = path.join(STORAGE_DIR, "gallery.json");
const DB_DRIVER = normalizeDbDriver(process.env.PANORAMA_DB || process.env.PANORAMA_DB_DRIVER || "json");
const MYSQL_TABLE = normalizeMysqlIdentifier(process.env.PANORAMA_MYSQL_TABLE || "panoramas", "panoramas");
const MYSQL_INIT_SQL_FILE = path.join(__dirname, "sql", "init-mysql-data.sql");

let galleryCache = null;
let galleryCacheMtimeMs = 0;
let mysqlPool = null;
let initialized = false;

function normalizeDbDriver(value) {
  const normalized = String(value || "json").trim().toLowerCase();
  return normalized === "mysql" ? "mysql" : "json";
}

function normalizeMysqlIdentifier(value, fallback) {
  const normalized = String(value || fallback).trim();
  return /^[A-Za-z0-9_]+$/.test(normalized) ? normalized : fallback;
}

function ensureStorage() {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }

  if (!fs.existsSync(GALLERY_FILE)) {
    fs.writeFileSync(GALLERY_FILE, JSON.stringify({ items: [] }, null, 2), "utf8");
  }
}

function cloneItems(items) {
  return items.map(function cloneItem(item) {
    return Object.assign({}, item);
  });
}

function normalizeItem(item) {
  return {
    id: String(item.id || makeId("item")),
    panoramaNo: Number(item.panoramaNo) || null,
    name: String(item.name || item.title || "未命名全景图"),
    description: String(item.description || ""),
    sourceType: String(item.sourceType || "database-record"),
    originalUrl: item.originalUrl || null,
    viewerPath: String(item.viewerPath || item.imageUrl || item.url || ""),
    thumbnailPath: item.thumbnailPath || item.viewerPath || item.imageUrl || item.url || null,
    size: item.size === undefined || item.size === null ? null : Number(item.size),
    width: item.width === undefined || item.width === null ? null : Number(item.width),
    height: item.height === undefined || item.height === null ? null : Number(item.height),
    createdAt: item.createdAt || new Date().toISOString()
  };
}

function normalizeGalleryItems(items) {
  const normalizedItems = Array.isArray(items) ? items.map(normalizeItem) : [];
  const usedNos = {};
  let nextPanoramaNo = 1001;
  let changed = false;

  normalizedItems.forEach(function collectExistingNos(item) {
    const numericValue = Number(item && item.panoramaNo);
    if (Number.isFinite(numericValue) && numericValue > 0) {
      usedNos[numericValue] = true;
      nextPanoramaNo = Math.max(nextPanoramaNo, numericValue + 1);
    }
  });

  normalizedItems.forEach(function assignMissingNo(item, index) {
    const numericValue = Number(item && item.panoramaNo);
    if (Number.isFinite(numericValue) && numericValue > 0) {
      return;
    }

    while (usedNos[nextPanoramaNo]) {
      nextPanoramaNo += 1;
    }

    normalizedItems[index] = Object.assign({}, item, {
      panoramaNo: nextPanoramaNo
    });
    usedNos[nextPanoramaNo] = true;
    nextPanoramaNo += 1;
    changed = true;
  });

  return {
    changed: changed,
    items: normalizedItems
  };
}

function saveJsonGallery(items) {
  const normalizedItems = Array.isArray(items) ? cloneItems(items) : [];
  fs.writeFileSync(GALLERY_FILE, JSON.stringify({ items: normalizedItems }, null, 2), "utf8");
  galleryCache = normalizedItems;
  galleryCacheMtimeMs = fs.statSync(GALLERY_FILE).mtimeMs;
  return cloneItems(galleryCache);
}

async function initialize() {
  if (initialized) {
    return;
  }

  if (DB_DRIVER === "mysql") {
    await initializeMysql();
  } else {
    ensureStorage();
  }

  initialized = true;
}

async function initializeMysql() {
  const mysql = loadMysqlDriver();
  mysqlPool = mysql.createPool(getMysqlOptions());
  await mysqlPool.query(
    "CREATE TABLE IF NOT EXISTS `" + MYSQL_TABLE + "` (" +
      "`id` VARCHAR(191) NOT NULL PRIMARY KEY," +
      "`panorama_no` INT NOT NULL UNIQUE," +
      "`name` VARCHAR(255) NOT NULL," +
      "`description` TEXT NULL," +
      "`source_type` VARCHAR(64) NOT NULL," +
      "`original_url` TEXT NULL," +
      "`viewer_path` TEXT NOT NULL," +
      "`thumbnail_path` TEXT NULL," +
      "`size` BIGINT NULL," +
      "`width` INT NULL," +
      "`height` INT NULL," +
      "`created_at` VARCHAR(64) NOT NULL," +
      "INDEX `idx_created_at` (`created_at`)" +
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  );
  await importMysqlInitialDataIfEmpty();
}

async function importMysqlInitialDataIfEmpty() {
  const rows = await mysqlPool.query("SELECT COUNT(*) AS total FROM `" + MYSQL_TABLE + "`");
  const total = Number(rows[0] && rows[0][0] && rows[0][0].total) || 0;

  if (total > 0) {
    console.log("MySQL 初始数据已存在，跳过导入");
    return;
  }

  try {
    const sql = readMysqlInitialDataSql();
    await mysqlPool.query(sql);
    console.log("MySQL 初始数据已导入: " + MYSQL_INIT_SQL_FILE);
  } catch (error) {
    console.warn("MySQL 初始数据自动导入失败: " + error.message);
    console.warn("请手动导入初始数据 SQL 文件: " + MYSQL_INIT_SQL_FILE);
  }
}

function readMysqlInitialDataSql() {
  const sql = fs.readFileSync(MYSQL_INIT_SQL_FILE, "utf8");
  if (MYSQL_TABLE === "panoramas") {
    return sql;
  }
  return sql.replace(/`panoramas`/g, "`" + MYSQL_TABLE + "`");
}

function loadMysqlDriver() {
  try {
    return require("mysql2/promise");
  } catch (error) {
    throw new Error("MySQL 模式需要可用的 MySQL 客户端驱动，并连接 config.json 中配置的外部 MySQL 服务器；如不使用 MySQL，请将 database.driver 改为 json");
  }
}

function getMysqlOptions() {
  if (process.env.PANORAMA_MYSQL_URL) {
    return process.env.PANORAMA_MYSQL_URL;
  }

  return {
    host: process.env.PANORAMA_MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.PANORAMA_MYSQL_PORT || 3306),
    user: process.env.PANORAMA_MYSQL_USER || "root",
    password: process.env.PANORAMA_MYSQL_PASSWORD || "",
    database: process.env.PANORAMA_MYSQL_DATABASE || "xint_panorama",
    waitForConnections: true,
    connectionLimit: Number(process.env.PANORAMA_MYSQL_CONNECTION_LIMIT || 10),
    charset: "utf8mb4"
  };
}

async function readGallery() {
  await initialize();
  if (DB_DRIVER === "mysql") {
    return readMysqlGallery();
  }
  return readJsonGallery();
}

function readJsonGallery() {
  ensureStorage();
  const fileStat = fs.statSync(GALLERY_FILE);
  if (galleryCache && galleryCacheMtimeMs === fileStat.mtimeMs) {
    return cloneItems(galleryCache);
  }

  const raw = fs.readFileSync(GALLERY_FILE, "utf8");
  const parsed = JSON.parse(raw || '{"items":[]}');
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  const normalized = normalizeGalleryItems(items);

  if (normalized.changed) {
    return saveJsonGallery(normalized.items);
  }

  galleryCache = cloneItems(normalized.items);
  galleryCacheMtimeMs = fileStat.mtimeMs;
  return cloneItems(galleryCache);
}

async function readMysqlGallery() {
  const rows = await mysqlPool.query(
    "SELECT id, panorama_no, name, description, source_type, original_url, viewer_path, thumbnail_path, size, width, height, created_at " +
      "FROM `" + MYSQL_TABLE + "` ORDER BY panorama_no ASC"
  );
  return rows[0].map(rowToItem);
}

async function writeGallery(items) {
  await initialize();
  const normalized = normalizeGalleryItems(items).items;
  if (DB_DRIVER === "mysql") {
    await replaceMysqlGallery(normalized);
    return normalized;
  }
  return saveJsonGallery(normalized);
}

async function replaceMysqlGallery(items) {
  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query("DELETE FROM `" + MYSQL_TABLE + "`");
    for (const item of items) {
      await upsertMysqlItem(item, connection);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function getNextPanoramaNo(items) {
  const currentMax = items.reduce(function findMax(maxValue, item) {
    const numericValue = Number(item && item.panoramaNo);
    if (!Number.isFinite(numericValue)) {
      return maxValue;
    }
    return Math.max(maxValue, numericValue);
  }, 1000);

  return currentMax + 1;
}

function makeId(prefix) {
  return [
    prefix || "item",
    Date.now().toString(36),
    Math.random().toString(36).slice(2, 8)
  ].join("-");
}

async function upsertItem(item, currentItems) {
  await initialize();
  const items = Array.isArray(currentItems) ? cloneItems(currentItems) : await readGallery();
  const normalizedItem = normalizeItem(item);
  const index = items.findIndex(function findExisting(existing) {
    return existing.id === normalizedItem.id || (existing.originalUrl && existing.originalUrl === normalizedItem.originalUrl);
  });

  if (index >= 0) {
    if (!normalizedItem.panoramaNo && items[index].panoramaNo) {
      normalizedItem.panoramaNo = items[index].panoramaNo;
    }
    items[index] = normalizedItem;
  } else {
    if (!normalizedItem.panoramaNo) {
      normalizedItem.panoramaNo = getNextPanoramaNo(items);
    }
    items.push(normalizedItem);
  }

  const normalizedItems = normalizeGalleryItems(items).items;
  const savedItem = normalizedItems.find(function findSavedItem(existing) {
    return existing.id === normalizedItem.id;
  }) || normalizedItem;

  if (DB_DRIVER === "mysql") {
    await upsertMysqlItem(savedItem);
  } else {
    saveJsonGallery(normalizedItems);
  }

  Object.assign(item, savedItem);
  return item;
}

async function upsertMysqlItem(item, connection) {
  const executor = connection || mysqlPool;
  await executor.query(
    "INSERT INTO `" + MYSQL_TABLE + "` " +
      "(id, panorama_no, name, description, source_type, original_url, viewer_path, thumbnail_path, size, width, height, created_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) " +
      "ON DUPLICATE KEY UPDATE " +
      "panorama_no=VALUES(panorama_no), name=VALUES(name), description=VALUES(description), source_type=VALUES(source_type), " +
      "original_url=VALUES(original_url), viewer_path=VALUES(viewer_path), thumbnail_path=VALUES(thumbnail_path), " +
      "size=VALUES(size), width=VALUES(width), height=VALUES(height), created_at=VALUES(created_at)",
    itemToRowValues(item)
  );
}

function rowToItem(row) {
  return normalizeItem({
    id: row.id,
    panoramaNo: row.panorama_no,
    name: row.name,
    description: row.description,
    sourceType: row.source_type,
    originalUrl: row.original_url,
    viewerPath: row.viewer_path,
    thumbnailPath: row.thumbnail_path,
    size: row.size,
    width: row.width,
    height: row.height,
    createdAt: row.created_at
  });
}

function itemToRowValues(item) {
  const normalized = normalizeItem(item);
  return [
    normalized.id,
    normalized.panoramaNo,
    normalized.name,
    normalized.description,
    normalized.sourceType,
    normalized.originalUrl,
    normalized.viewerPath,
    normalized.thumbnailPath,
    normalized.size,
    normalized.width,
    normalized.height,
    normalized.createdAt
  ];
}

function getStoreInfo() {
  return {
    driver: DB_DRIVER,
    storageDir: DB_DRIVER === "json" ? STORAGE_DIR : null,
    galleryFile: DB_DRIVER === "json" ? GALLERY_FILE : null,
    mysqlTable: DB_DRIVER === "mysql" ? MYSQL_TABLE : null,
    mysqlInitSqlFile: DB_DRIVER === "mysql" ? MYSQL_INIT_SQL_FILE : null
  };
}

module.exports = {
  STORAGE_DIR,
  GALLERY_FILE,
  DB_DRIVER,
  MYSQL_TABLE,
  MYSQL_INIT_SQL_FILE,
  ensureStorage,
  initialize,
  readGallery,
  writeGallery,
  getNextPanoramaNo,
  normalizeGalleryItems,
  makeId,
  upsertItem,
  getStoreInfo
};
