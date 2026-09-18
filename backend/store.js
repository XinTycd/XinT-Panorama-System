const { STORAGE_DIR, DATABASE_FILE, DB_DRIVER, getDatabase, transaction, closeDatabase } = require("./sqlite");

function makeId(prefix) {
  return [prefix || "item", Date.now().toString(36), Math.random().toString(36).slice(2, 8)].join("-");
}

function normalizeItem(item) {
  if (item.group !== undefined && item.group !== null && typeof item.group !== "string") {
    const error = new Error("group 必须是字符串");
    error.statusCode = 400;
    throw error;
  }
  const group = String(item.group == null ? "" : item.group).trim();
  if (Array.from(group).length > 64) {
    const error = new Error("group 最长为 64 个字符");
    error.statusCode = 400;
    throw error;
  }
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
    createdAt: item.createdAt || new Date().toISOString(),
    group: group
  };
}

function normalizeGalleryItems(items) {
  const normalizedItems = Array.isArray(items) ? items.map(normalizeItem) : [];
  const usedNos = new Set();
  let nextPanoramaNo = 1;
  let changed = false;
  for (const item of normalizedItems) {
    const n = Number(item.panoramaNo);
    if (Number.isFinite(n) && n > 0) {
      if (!Number.isInteger(n)) throw new Error("panoramaNo 必须是正整数: " + item.id);
      if (usedNos.has(n)) throw new Error("panoramaNo 已存在: " + n);
      usedNos.add(n);
      nextPanoramaNo = Math.max(nextPanoramaNo, n + 1);
    }
  }
  for (let i = 0; i < normalizedItems.length; i += 1) {
    const n = Number(normalizedItems[i].panoramaNo);
    if (Number.isFinite(n) && n > 0) continue;
    while (usedNos.has(nextPanoramaNo)) nextPanoramaNo += 1;
    normalizedItems[i].panoramaNo = nextPanoramaNo;
    usedNos.add(nextPanoramaNo++);
    changed = true;
  }
  return { changed, items: normalizedItems };
}

function dbItemToGalleryItem(row) {
  return {
    id: row.id,
    panoramaNo: Number(row.panorama_no),
    name: row.name,
    description: row.description || "",
    sourceType: row.source_type,
    originalUrl: row.original_url,
    viewerPath: row.viewer_path,
    thumbnailPath: row.thumbnail_path,
    size: row.size == null ? null : Number(row.size),
    width: row.width == null ? null : Number(row.width),
    height: row.height == null ? null : Number(row.height),
    createdAt: row.created_at,
    group: row.group_name || ""
  };
}

function selectGallery(db) {
  return db.prepare("SELECT id, panorama_no, name, description, source_type, original_url, viewer_path, thumbnail_path, size, width, height, created_at, group_name FROM panoramas ORDER BY panorama_no ASC").all().map(dbItemToGalleryItem);
}

function currentHighWater(db) {
  const state = db.prepare("SELECT high_water FROM panorama_number_sequence WHERE id=1").get();
  if (state) return Number(state.high_water) || 0;
  return Number(db.prepare("SELECT COALESCE(MAX(panorama_no), 0) AS max_no FROM panoramas").get().max_no) || 0;
}

function reserveNextPanoramaNo(db) {
  const next = currentHighWater(db) + 1;
  db.prepare("INSERT INTO panorama_number_sequence (id, high_water) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET high_water=excluded.high_water").run(next);
  return next;
}

function raisePanoramaHighWater(db, panoramaNo) {
  const number = Number(panoramaNo);
  if (!Number.isInteger(number) || number <= 0) return;
  db.prepare("INSERT INTO panorama_number_sequence (id, high_water) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET high_water=MAX(high_water, excluded.high_water)").run(number);
}

function validateGroup(db, group) {
  if (!group) return;
  if (!db.prepare("SELECT name FROM panorama_groups WHERE name=?").get(group)) {
    const error = new Error("请先创建所选分组，或将图片设为未分组");
    error.statusCode = 400;
    throw error;
  }
}

function insertItem(db, item) {
  const normalized = normalizeItem(item);
  validateGroup(db, normalized.group);
  db.prepare(`INSERT INTO panoramas
    (id, panorama_no, name, description, source_type, original_url, viewer_path, thumbnail_path, size, width, height, created_at, group_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    normalized.id, normalized.panoramaNo, normalized.name, normalized.description, normalized.sourceType,
    normalized.originalUrl, normalized.viewerPath, normalized.thumbnailPath, normalized.size,
    normalized.width, normalized.height, normalized.createdAt, normalized.group
  );
  raisePanoramaHighWater(db, normalized.panoramaNo);
  return normalized;
}

function conflictError(error) {
  if (error && (error.code === "ERR_SQLITE_CONSTRAINT_UNIQUE" || /UNIQUE constraint failed/.test(error.message))) {
    const conflict = new Error("panoramaNo 或 id 已存在");
    conflict.statusCode = 409;
    conflict.code = "GALLERY_CONFLICT";
    return conflict;
  }
  return error;
}

async function initialize() {
  getDatabase();
}

async function readGallery() {
  return selectGallery(getDatabase());
}

async function readItemByPanoramaNo(panoramaNo) {
  const number = Number(panoramaNo);
  if (!Number.isFinite(number)) return null;
  const row = getDatabase().prepare("SELECT id, panorama_no, name, description, source_type, original_url, viewer_path, thumbnail_path, size, width, height, created_at, group_name FROM panoramas WHERE panorama_no = ?").get(number);
  return row ? dbItemToGalleryItem(row) : null;
}

async function writeGallery(items) {
  try {
    return transaction(function replace(db) {
      const normalized = (Array.isArray(items) ? items : []).map(normalizeItem);
      const usedNumbers = new Set();
      db.exec("DELETE FROM panoramas");
      normalized.forEach(function each(item) {
        if (!item.panoramaNo) item.panoramaNo = reserveNextPanoramaNo(db);
        if (!Number.isInteger(item.panoramaNo) || item.panoramaNo <= 0) throw new Error("panoramaNo 必须是正整数: " + item.id);
        if (usedNumbers.has(item.panoramaNo)) throw new Error("panoramaNo 已存在: " + item.panoramaNo);
        usedNumbers.add(item.panoramaNo);
        validateGroup(db, item.group);
        insertItem(db, item);
      });
      return normalized;
    });
  } catch (error) {
    throw conflictError(error);
  }
}

function getNextPanoramaNo(items) {
  return currentHighWater(getDatabase()) + 1;
}

async function upsertItem(item, options) {
  const source = normalizeItem(item);
  const groupProvided = item && item.group !== undefined;
  const resequence = Boolean(options && !Array.isArray(options) && options.resequence);
  try {
    const savedItem = transaction(function upsert(db) {
      if (resequence) {
        const ordered = db.prepare("SELECT id FROM panoramas ORDER BY panorama_no ASC, rowid ASC").all();
        db.exec("UPDATE panoramas SET panorama_no = -rowid");
        const setNo = db.prepare("UPDATE panoramas SET panorama_no = ? WHERE id = ?");
        ordered.forEach(function setSequence(row, index) { setNo.run(index + 1, row.id); });
      }
      const existing = source.originalUrl
        ? db.prepare("SELECT * FROM panoramas WHERE id = ? OR original_url = ? ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END LIMIT 1").get(source.id, source.originalUrl, source.id)
        : db.prepare("SELECT * FROM panoramas WHERE id = ?").get(source.id);
      const oldItem = existing ? dbItemToGalleryItem(existing) : null;
      if (oldItem) {
        source.id = oldItem.id;
        if (!source.panoramaNo) source.panoramaNo = oldItem.panoramaNo;
        if (!groupProvided) source.group = oldItem.group;
      } else if (!source.panoramaNo) {
        source.panoramaNo = reserveNextPanoramaNo(db);
      }
      const normalized = normalizeGalleryItems([source]).items[0];
      validateGroup(db, normalized.group);
      if (oldItem) {
        db.prepare(`UPDATE panoramas SET panorama_no=?, name=?, description=?, source_type=?, original_url=?, viewer_path=?, thumbnail_path=?, size=?, width=?, height=?, created_at=?, group_name=? WHERE id=?`).run(
          normalized.panoramaNo, normalized.name, normalized.description, normalized.sourceType, normalized.originalUrl,
          normalized.viewerPath, normalized.thumbnailPath, normalized.size, normalized.width, normalized.height, normalized.createdAt, normalized.group, oldItem.id
        );
        raisePanoramaHighWater(db, normalized.panoramaNo);
      } else {
        insertItem(db, normalized);
      }
      return normalized;
    });
    Object.assign(item, savedItem);
    return item;
  } catch (error) {
    throw conflictError(error);
  }
}

async function updateItem(id, changes) {
  try {
    return transaction(function update(db) {
      const row = db.prepare("SELECT * FROM panoramas WHERE id = ?").get(String(id));
      if (!row) return null;
      const current = dbItemToGalleryItem(row);
      const updated = normalizeItem(Object.assign({}, current, changes || {}, { id: current.id }));
      if (!Number.isInteger(updated.panoramaNo) || updated.panoramaNo <= 0) {
        const error = new Error("panoramaNo 必须是正整数");
        error.statusCode = 400;
        throw error;
      }
      validateGroup(db, updated.group);
      db.prepare(`UPDATE panoramas SET panorama_no=?, name=?, description=?, source_type=?, original_url=?, viewer_path=?, thumbnail_path=?, size=?, width=?, height=?, created_at=?, group_name=? WHERE id=?`).run(
        updated.panoramaNo, updated.name, updated.description, updated.sourceType, updated.originalUrl,
        updated.viewerPath, updated.thumbnailPath, updated.size, updated.width, updated.height, updated.createdAt, updated.group, current.id
      );
      raisePanoramaHighWater(db, updated.panoramaNo);
      return updated;
    });
  } catch (error) {
    throw conflictError(error);
  }
}

async function deleteItem(id) {
  return transaction(function deletePanorama(db) {
    const row = db.prepare("SELECT * FROM panoramas WHERE id=?").get(String(id));
    if (!row) return null;
    const referenceCount = Number(db.prepare("SELECT COUNT(*) AS count FROM scenes WHERE panorama_id=?").get(String(id)).count);
    if (referenceCount > 0) {
      const error = new Error("该全景图仍被项目场景引用，不能删除图库记录");
      error.statusCode = 409;
      error.references = referenceCount;
      throw error;
    }
    db.prepare("DELETE FROM panoramas WHERE id=?").run(String(id));
    return dbItemToGalleryItem(row);
  });
}

async function listGroups() {
  const database = getDatabase();
  const ungroupedCount = Number(database.prepare("SELECT COUNT(*) AS count FROM panoramas WHERE group_name=''").get().count);
  const groups = database.prepare(`SELECT g.name, COUNT(p.id) AS count
    FROM panorama_groups g LEFT JOIN panoramas p ON p.group_name=g.name
    GROUP BY g.name ORDER BY g.name COLLATE NOCASE ASC, g.name ASC`).all()
    .map((row) => ({ name: row.name, count: Number(row.count) }));
  return [{ name: "", count: ungroupedCount }].concat(groups);
}

async function createGroup(value) {
  if (typeof value !== "string") {
    const error = new Error("name 必须是字符串");
    error.statusCode = 400;
    throw error;
  }
  const name = value.trim();
  if (!name) {
    const error = new Error("分组名称不能为空");
    error.statusCode = 400;
    throw error;
  }
  if (Array.from(name).length > 64) {
    const error = new Error("分组名称最长为 64 个字符");
    error.statusCode = 400;
    throw error;
  }
  return transaction(function insertGroup(database) {
    if (database.prepare("SELECT name FROM panorama_groups WHERE name=?").get(name)) {
      const error = new Error("分组名称已存在");
      error.statusCode = 409;
      throw error;
    }
    database.prepare("INSERT INTO panorama_groups(name) VALUES (?)").run(name);
    return { name: name, count: 0 };
  });
}

async function deleteGroup(value) {
  const name = String(value || "").trim();
  if (!name) {
    const error = new Error("name 必须指定已有分组");
    error.statusCode = 400;
    throw error;
  }
  return transaction(function removeGroup(database) {
    if (!database.prepare("SELECT name FROM panorama_groups WHERE name=?").get(name)) return null;
    const result = database.prepare("UPDATE panoramas SET group_name='' WHERE group_name=?").run(name);
    database.prepare("DELETE FROM panorama_groups WHERE name=?").run(name);
    return { name: name, movedToUngrouped: Number(result.changes) };
  });
}

function getStoreInfo() {
  return { driver: DB_DRIVER };
}

module.exports = {
  STORAGE_DIR,
  DATABASE_FILE,
  DB_DRIVER,
  initialize,
  readGallery,
  readItemByPanoramaNo,
  writeGallery,
  getNextPanoramaNo,
  normalizeGalleryItems,
  makeId,
  upsertItem,
  updateItem,
  deleteItem,
  listGroups,
  createGroup,
  deleteGroup,
  getStoreInfo,
  closeDatabase
};
