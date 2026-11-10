const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { applyRuntimeConfig } = require("../lib/runtime-config");

applyRuntimeConfig(process.argv.slice(2));

async function main() {
  const sourceOption = readOption("--from");
  const storageDir = path.resolve(process.env.PANORAMA_STORAGE_DIR || path.join(__dirname, "..", "backend", "storage"));
  if (!sourceOption) throw new Error("请使用 --from <备份目录> 指定恢复来源");
  if (!process.argv.includes("--confirm")) throw new Error("恢复会覆盖当前存储数据；确认后请附加 --confirm");

  const sourceDir = path.resolve(sourceOption);
  if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
    throw new Error("恢复来源不存在或不是目录: " + sourceDir);
  }
  const canonicalSource = canonicalize(sourceDir);
  const canonicalStorage = canonicalize(storageDir);
  if (contains(canonicalSource, canonicalStorage) || contains(canonicalStorage, canonicalSource)) {
    throw new Error("恢复来源与当前存储目录不能相同，也不能互相包含");
  }

  const manifestPath = path.join(sourceDir, "backup-manifest.json");
  if (!fs.existsSync(manifestPath)) throw new Error("恢复来源缺少 backup-manifest.json: " + sourceDir);
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new Error("备份清单格式无效: " + error.message);
  }
  if (manifest.application !== "xint-panorama-system") throw new Error("备份清单的应用标识无效");
  const sourceDatabase = path.join(sourceDir, "panorama.sqlite");
  const legacyJson = ["gallery.json", "catalog.json"].some(function hasLegacyData(name) {
    return fs.existsSync(path.join(sourceDir, name));
  });
  if (manifest.format === "xint-panorama-backup-v1") {
    if (!fs.existsSync(sourceDatabase)) throw new Error("SQLite 备份缺少 panorama.sqlite");
    checkDatabase(sourceDatabase);
  } else if (!legacyJson || fs.existsSync(sourceDatabase)) {
    throw new Error("不支持此备份格式；旧 JSON 备份必须包含 gallery.json 或 catalog.json，SQLite 备份需使用 xint-panorama-backup-v1");
  }

  const storageParent = path.dirname(storageDir);
  fs.mkdirSync(storageParent, { recursive: true });
  const stageDir = fs.mkdtempSync(path.join(storageParent, ".panorama-restore-"));
  const previousDir = storageDir + ".pre-restore-" + Date.now();
  let movedPrevious = false;
  try {
    fs.cpSync(sourceDir, stageDir, {
      recursive: true,
      filter: function excludeBackupOnlyFiles(source) {
        const base = path.basename(source).toLowerCase();
        if (path.resolve(source) === path.join(sourceDir, "protected-previews")) return false;
        return base !== "backup-manifest.json" && !/-wal$|-shm$|-journal$/.test(base);
      }
    });
    if (manifest.format === "xint-panorama-backup-v1") {
      checkDatabase(path.join(stageDir, "panorama.sqlite"));
    } else {
      await migrateAndValidateLegacy(stageDir);
      checkDatabase(path.join(stageDir, "panorama.sqlite"));
    }

    if (fs.existsSync(storageDir)) {
      fs.renameSync(storageDir, previousDir);
      movedPrevious = true;
    }
    fs.renameSync(stageDir, storageDir);
    if (manifest.format === "xint-panorama-backup-v1") {
      console.log("SQLite 备份恢复完成: " + storageDir);
    } else {
      console.log("旧 JSON 备份已迁移并恢复到 SQLite: " + storageDir);
    }
    if (movedPrevious) console.log("原存储目录保留在: " + previousDir);
  } catch (error) {
    if (fs.existsSync(stageDir)) fs.rmSync(stageDir, { recursive: true, force: true });
    if (movedPrevious && !fs.existsSync(storageDir) && fs.existsSync(previousDir)) {
      try {
        fs.renameSync(previousDir, storageDir);
      } catch (rollbackError) {
        throw new Error(error.message + "；恢复旧存储目录失败: " + rollbackError.message + "。原目录保留在: " + previousDir);
      }
    }
    throw error;
  }
}

async function migrateAndValidateLegacy(stageDir) {
  const previousStorageDir = process.env.PANORAMA_STORAGE_DIR;
  process.env.PANORAMA_STORAGE_DIR = stageDir;
  const storePath = require.resolve("../backend/store");
  const sqlitePath = require.resolve("../backend/sqlite");
  delete require.cache[storePath];
  delete require.cache[sqlitePath];
  try {
    const store = require("../backend/store");
    await store.initialize();
    await store.readGallery();
    store.closeDatabase();
  } finally {
    process.env.PANORAMA_STORAGE_DIR = previousStorageDir;
    delete require.cache[storePath];
    delete require.cache[sqlitePath];
  }
}

function checkDatabase(filePath) {
  const database = new DatabaseSync(filePath, { readOnly: true });
  try {
    const result = database.prepare("PRAGMA quick_check").get();
    if (!result || result.quick_check !== "ok") throw new Error("SQLite quick_check 失败: " + filePath);
    const version = Number(database.prepare("PRAGMA user_version").get().user_version || 0);
    if (version < 1) throw new Error("SQLite schema 版本无效: " + filePath);
    const tables = new Set(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(function getName(row) { return row.name; }));
    ["panoramas", "projects", "scenes", "hotspots", "releases"].forEach(function requireTable(name) {
      if (!tables.has(name)) throw new Error("SQLite 缺少表 " + name + ": " + filePath);
    });
  } finally {
    database.close();
  }
}

function canonicalize(value) {
  let resolved = path.resolve(value);
  const tail = [];
  while (!fs.existsSync(resolved)) {
    const parent = path.dirname(resolved);
    if (parent === resolved) break;
    tail.unshift(path.basename(resolved));
    resolved = parent;
  }
  return path.resolve(fs.realpathSync(resolved), ...tail);
}

function contains(parent, candidate) {
  const relative = path.relative(normalize(parent), normalize(candidate));
  return relative === "" || (relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative));
}

function normalize(value) {
  const result = path.resolve(value);
  return process.platform === "win32" ? result.toLowerCase() : result;
}

function readOption(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : null;
}

main().catch(function reportError(error) {
  console.error(error.message);
  process.exitCode = 1;
});
