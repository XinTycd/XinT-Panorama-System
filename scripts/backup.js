const fs = require("fs");
const path = require("path");
const { DatabaseSync, backup } = require("node:sqlite");
const { applyRuntimeConfig } = require("../lib/runtime-config");

applyRuntimeConfig(process.argv.slice(2));

async function main() {
  const sourceDir = path.resolve(process.env.PANORAMA_STORAGE_DIR || path.join(__dirname, "..", "backend", "storage"));
  const outputRoot = path.resolve(readOption("--output") || path.join(__dirname, "..", "backups"));
  const backupName = "backup-" + new Date().toISOString().replace(/[:.]/g, "-");
  const targetDir = path.join(outputRoot, backupName);
  let stagingDir = null;

  if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
    throw new Error("存储目录不存在或不是目录: " + sourceDir);
  }
  const canonicalSource = canonicalize(sourceDir);
  if (contains(canonicalSource, canonicalize(outputRoot)) || contains(canonicalSource, canonicalize(targetDir))) {
    throw new Error("备份目录不能位于当前存储目录内");
  }

  const databasePath = path.join(sourceDir, "panorama.sqlite");
  if (!fs.existsSync(databasePath)) throw new Error("SQLite 数据库不存在: " + databasePath);
  await checkDatabase(databasePath);

  fs.mkdirSync(outputRoot, { recursive: true });
  stagingDir = fs.mkdtempSync(path.join(outputRoot, "." + backupName + ".staging-"));
  let sourceDatabase = null;
  try {
    fs.cpSync(sourceDir, stagingDir, {
      recursive: true,
      filter: function excludeDatabaseAndTransientFiles(source) {
        const base = path.basename(source).toLowerCase();
        if (path.resolve(source) === path.join(sourceDir, "protected-previews")) return false;
        return base !== "panorama.sqlite" && !/-wal$|-shm$|-journal$/.test(base);
      }
    });
    sourceDatabase = new DatabaseSync(databasePath, { readOnly: true });
    await backup(sourceDatabase, path.join(stagingDir, "panorama.sqlite"));
    sourceDatabase.close();
    sourceDatabase = null;
    await checkDatabase(path.join(stagingDir, "panorama.sqlite"));
    fs.writeFileSync(path.join(stagingDir, "backup-manifest.json"), JSON.stringify({
      format: "xint-panorama-backup-v1",
      createdAt: new Date().toISOString(),
      sourceDir: canonicalSource,
      application: "xint-panorama-system",
      database: "panorama.sqlite",
      media: "uploads"
    }, null, 2), "utf8");
    fs.renameSync(stagingDir, targetDir);
    stagingDir = null;
    console.log("备份完成: " + targetDir);
  } catch (error) {
    if (sourceDatabase) sourceDatabase.close();
    if (stagingDir && fs.existsSync(stagingDir)) fs.rmSync(stagingDir, { recursive: true, force: true });
    throw error;
  }
}

async function checkDatabase(filePath) {
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
