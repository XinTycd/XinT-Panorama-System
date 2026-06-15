const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { DatabaseSync } = require("node:sqlite");

async function run() {
  const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "xint-ops-test-"));
  const storage = path.join(testRoot, "live");
  const backups = path.join(testRoot, "backups");
  const restored = path.join(testRoot, "restored");
  const legacyBackup = path.join(testRoot, "legacy-backup");
  const legacyRestored = path.join(testRoot, "legacy-restored");
  try {
    await createDatabase(storage);
    fs.mkdirSync(path.join(storage, "uploads"), { recursive: true });
    fs.writeFileSync(path.join(storage, "uploads", "asset.bin"), "media");
    const backupResult = runScript("backup.js", ["--output", backups], storage);
    assert.strictEqual(backupResult.status, 0, backupResult.stderr || backupResult.stdout);
    const backupDir = fs.readdirSync(backups).map((name) => path.join(backups, name)).find((name) => fs.statSync(name).isDirectory());
    assert.ok(backupDir);
    assert.ok(fs.existsSync(path.join(backupDir, "panorama.sqlite")));
    assert.strictEqual(fs.readFileSync(path.join(backupDir, "uploads", "asset.bin"), "utf8"), "media");
    assert.ok(!fs.readdirSync(backupDir).some((name) => /-wal$|-shm$|-journal$/.test(name)));

    fs.mkdirSync(restored, { recursive: true });
    fs.writeFileSync(path.join(restored, "old-marker"), "preserved");
    const restoreResult = runScript("restore.js", ["--from", backupDir, "--confirm"], restored);
    assert.strictEqual(restoreResult.status, 0, restoreResult.stderr || restoreResult.stdout);
    assert.ok(fs.existsSync(path.join(restored, "panorama.sqlite")));
    assert.strictEqual(fs.readFileSync(path.join(restored, "uploads", "asset.bin"), "utf8"), "media");
    const previous = fs.readdirSync(testRoot).map((name) => path.join(testRoot, name)).find((name) => name.startsWith(restored + ".pre-restore-"));
    assert.ok(previous && fs.existsSync(path.join(previous, "old-marker")));
    checkDatabase(path.join(restored, "panorama.sqlite"));

    fs.mkdirSync(legacyBackup, { recursive: true });
    fs.writeFileSync(path.join(legacyBackup, "backup-manifest.json"), JSON.stringify({ application: "xint-panorama-system" }));
    fs.writeFileSync(path.join(legacyBackup, "gallery.json"), JSON.stringify({ items: [
      { id: "legacy-item", panoramaNo: 1, name: "Legacy", sourceType: "remote-url", originalUrl: "https://example.test/pano.jpg", viewerPath: "https://example.test/pano.jpg" }
    ] }));
    fs.writeFileSync(path.join(legacyBackup, "catalog.json"), JSON.stringify({ projects: [], scenes: [], hotspots: [], releases: [] }));
    const legacyResult = runScript("restore.js", ["--from", legacyBackup, "--confirm"], legacyRestored);
    assert.strictEqual(legacyResult.status, 0, legacyResult.stderr || legacyResult.stdout);
    const database = new DatabaseSync(path.join(legacyRestored, "panorama.sqlite"), { readOnly: true });
    try {
      assert.strictEqual(database.prepare("SELECT name FROM panoramas WHERE id='legacy-item'").get().name, "Legacy");
    } finally {
      database.close();
    }
    console.log("Ops tests passed");
  } finally {
    const resolvedTemp = path.resolve(os.tmpdir());
    const resolvedRoot = path.resolve(testRoot);
    assert.ok(resolvedRoot.startsWith(resolvedTemp + path.sep), "test cleanup must remain under the OS temporary directory");
    fs.rmSync(testRoot, { recursive: true, force: true });
  }
}

async function createDatabase(storageDir) {
  fs.mkdirSync(storageDir, { recursive: true });
  const previous = process.env.PANORAMA_STORAGE_DIR;
  process.env.PANORAMA_STORAGE_DIR = storageDir;
  const sqlitePath = require.resolve("../backend/sqlite");
  const storePath = require.resolve("../backend/store");
  delete require.cache[sqlitePath];
  delete require.cache[storePath];
  const store = require("../backend/store");
  try {
    await store.initialize();
    await store.writeGallery([{ id: "test-item", panoramaNo: 1, name: "Test", sourceType: "remote-url", originalUrl: "https://example.test/pano.jpg", viewerPath: "https://example.test/pano.jpg" }]);
  } finally {
    store.closeDatabase();
    process.env.PANORAMA_STORAGE_DIR = previous;
    delete require.cache[sqlitePath];
    delete require.cache[storePath];
  }
}

function runScript(name, args, storageDir) {
  return spawnSync(process.execPath, [path.join(__dirname, "..", "scripts", name), ...args], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
    env: Object.assign({}, process.env, { PANORAMA_STORAGE_DIR: storageDir, PANORAMA_DB: "sqlite" })
  });
}

function checkDatabase(filePath) {
  const database = new DatabaseSync(filePath, { readOnly: true });
  try {
    assert.strictEqual(database.prepare("PRAGMA quick_check").get().quick_check, "ok");
    assert.ok(Number(database.prepare("PRAGMA user_version").get().user_version) >= 1);
  } finally {
    database.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
