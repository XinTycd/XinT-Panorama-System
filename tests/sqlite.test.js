const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

function loadFreshModules(storageDir) {
  process.env.PANORAMA_STORAGE_DIR = storageDir;
  for (const name of ["../backend/sqlite", "../backend/store"]) {
    const resolved = require.resolve(name);
    delete require.cache[resolved];
  }
  return { sqlite: require("../backend/sqlite"), store: require("../backend/store") };
}

async function run() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "xint-sqlite-test-"));
  const source = path.join(root, "source");
  fs.mkdirSync(source, { recursive: true });
  const galleryData = {
    items: [
      { id: "legacy-a", panoramaNo: 1, name: "A", group: "  已分组  ", sourceType: "uploaded-base64", viewerPath: "/media/uploads/a.jpg", thumbnailPath: "/media/uploads/a.jpg", createdAt: "2024-01-01T00:00:00.000Z" },
      { id: "legacy-b", name: "B", sourceType: "remote-url", originalUrl: "https://example.com/pano.jpg", viewerPath: "/api/panoramas/proxy?url=x", createdAt: "2024-01-02T00:00:00.000Z" }
    ]
  };
  const releaseSnapshot = { format: "xint-panorama-project@1", scenes: [{ id: "scene-legacy", panoramaId: "deleted-panorama" }] };
  const catalogData = {
    projects: [{ id: "project-legacy", name: "Legacy", description: "", createdAt: "2024-01-01T00:00:00.000Z", updatedAt: "2024-01-01T00:00:00.000Z" }],
    scenes: [{ id: "scene-legacy", projectId: "project-legacy", panoramaId: "deleted-panorama", name: "old scene", initialYaw: null, initialPitch: null, initialFov: null, createdAt: "2024-01-01T00:00:00.000Z", updatedAt: "2024-01-01T00:00:00.000Z" }],
    hotspots: [{ id: "hotspot-legacy", sceneId: "scene-legacy", type: "link", title: "", description: "", targetUrl: "https://example.com", targetSceneId: "missing-scene", yaw: 1.5, pitch: -2, createdAt: "2024-01-01T00:00:00.000Z", updatedAt: "2024-01-01T00:00:00.000Z" }],
    releases: [{ id: "release-legacy", projectId: "project-legacy", name: "v1", version: 1, snapshot: releaseSnapshot, createdAt: "2024-01-01T00:00:00.000Z" }]
  };
  const galleryFile = path.join(source, "gallery.json");
  const catalogFile = path.join(source, "catalog.json");
  fs.writeFileSync(galleryFile, "\uFEFF" + JSON.stringify(galleryData), "utf8");
  fs.writeFileSync(catalogFile, JSON.stringify(catalogData), "utf8");
  const originalGallery = fs.readFileSync(galleryFile);
  const originalCatalog = fs.readFileSync(catalogFile);

  try {
    const firstDir = source;
    const { sqlite, store } = loadFreshModules(firstDir);
    await store.initialize();
    await store.initialize();
    const items = await store.readGallery();
    assert.deepStrictEqual(items.map((item) => item.panoramaNo), [1, 2]);
    assert.strictEqual(items[1].id, "legacy-b");
    assert.strictEqual(items[0].group, "已分组");
    assert.strictEqual(items[1].group, "");
    const db = sqlite.getDatabase();
    assert.strictEqual(db.prepare("SELECT COUNT(*) AS n FROM projects").get().n, 1);
    assert.strictEqual(db.prepare("SELECT panorama_id FROM scenes WHERE id = 'scene-legacy'").get().panorama_id, "deleted-panorama");
    assert.strictEqual(db.prepare("SELECT target_scene_id FROM hotspots WHERE id = 'hotspot-legacy'").get().target_scene_id, "missing-scene");
    assert.deepStrictEqual(JSON.parse(db.prepare("SELECT snapshot FROM releases WHERE id='release-legacy'").get().snapshot), releaseSnapshot);
    assert.strictEqual(db.prepare("PRAGMA user_version").get().user_version, 3);
    assert.deepStrictEqual(db.prepare("SELECT name FROM panorama_groups ORDER BY name").all().map((row) => row.name), ["已分组"]);
    const afterMigration = { id: "post-migration", name: "After migration", viewerPath: "/after" };
    await store.upsertItem(afterMigration);
    assert.strictEqual(afterMigration.panoramaNo, 3);
    await store.deleteItem("post-migration");
    const afterDelete = { id: "post-delete", name: "After delete", viewerPath: "/after-delete" };
    await store.upsertItem(afterDelete);
    assert.strictEqual(afterDelete.panoramaNo, 4);
    await store.writeGallery([]);
    const afterClear = { id: "post-clear", name: "After clear", viewerPath: "/after-clear" };
    await store.upsertItem(afterClear);
    assert.strictEqual(afterClear.panoramaNo, 5);
    assert.deepStrictEqual(fs.readFileSync(galleryFile), originalGallery);
    assert.deepStrictEqual(fs.readFileSync(catalogFile), originalCatalog);
    sqlite.closeDatabase();

    // Removing source files and reopening the same DB must not re-import or restore deleted rows.
    fs.unlinkSync(galleryFile);
    fs.unlinkSync(catalogFile);
    const reopened = loadFreshModules(firstDir);
    await reopened.store.writeGallery([]);
    await reopened.store.initialize();
    assert.deepStrictEqual(await reopened.store.readGallery(), []);
    assert.strictEqual(reopened.sqlite.getDatabase().prepare("SELECT COUNT(*) AS n FROM projects").get().n, 1);
    reopened.sqlite.closeDatabase();

    // A version-1 SQLite catalog upgrades in place and adds an empty group column.
    const versionOneDir = path.join(root, "version-one");
    fs.mkdirSync(versionOneDir, { recursive: true });
    const DatabaseSync = require("node:sqlite").DatabaseSync;
    const versionOneDb = new DatabaseSync(path.join(versionOneDir, "panorama.sqlite"));
    versionOneDb.exec(`CREATE TABLE panoramas (
      id TEXT PRIMARY KEY, panorama_no INTEGER NOT NULL UNIQUE, name TEXT NOT NULL, description TEXT,
      source_type TEXT NOT NULL, original_url TEXT, viewer_path TEXT NOT NULL, thumbnail_path TEXT,
      size INTEGER, width INTEGER, height INTEGER, created_at TEXT NOT NULL
    );
    INSERT INTO panoramas (id, panorama_no, name, source_type, viewer_path, created_at)
    VALUES ('version-one-item', 9, 'Old item', 'database-record', '/old', '2024-01-01T00:00:00.000Z');
    PRAGMA user_version = 1;`);
    versionOneDb.close();
    const upgraded = loadFreshModules(versionOneDir);
    const upgradedItems = await upgraded.store.readGallery();
    assert.strictEqual(upgradedItems[0].group, "");
    assert.strictEqual(upgraded.sqlite.getDatabase().prepare("PRAGMA user_version").get().user_version, 3);
    const afterVersionUpgrade = { id: "after-version-upgrade", name: "After upgrade", viewerPath: "/after-upgrade" };
    await upgraded.store.upsertItem(afterVersionUpgrade);
    assert.strictEqual(afterVersionUpgrade.panoramaNo, 10);
    upgraded.sqlite.closeDatabase();

    // A version-2 SQLite database registers existing non-empty group_name values.
    const versionTwoDir = path.join(root, "version-two");
    fs.mkdirSync(versionTwoDir, { recursive: true });
    const versionTwoDb = new DatabaseSync(path.join(versionTwoDir, "panorama.sqlite"));
    versionTwoDb.exec(`CREATE TABLE panoramas (
      id TEXT PRIMARY KEY, panorama_no INTEGER NOT NULL UNIQUE, name TEXT NOT NULL, description TEXT,
      source_type TEXT NOT NULL, original_url TEXT, viewer_path TEXT NOT NULL, thumbnail_path TEXT,
      size INTEGER, width INTEGER, height INTEGER, created_at TEXT NOT NULL, group_name TEXT NOT NULL DEFAULT ''
    );
    INSERT INTO panoramas (id, panorama_no, name, source_type, viewer_path, created_at, group_name)
    VALUES ('version-two-item', 12, 'Grouped item', 'database-record', '/old', '2024-01-01T00:00:00.000Z', ' legacy group ');
    PRAGMA user_version = 2;`);
    versionTwoDb.close();
    const upgradedV2 = loadFreshModules(versionTwoDir);
    const v2Item = (await upgradedV2.store.readGallery())[0];
    assert.strictEqual(v2Item.group, "legacy group");
    assert.deepStrictEqual(upgradedV2.sqlite.getDatabase().prepare("SELECT name FROM panorama_groups").all().map((row) => row.name), ["legacy group"]);
    assert.strictEqual(upgradedV2.sqlite.getDatabase().prepare("PRAGMA user_version").get().user_version, 3);
    upgradedV2.sqlite.closeDatabase();

    // Invalid legacy data rolls back all imported tables and leaves user_version unset for a retry.
    const brokenDir = path.join(root, "broken");
    fs.mkdirSync(brokenDir, { recursive: true });
    fs.writeFileSync(path.join(brokenDir, "gallery.json"), JSON.stringify({ items: [{ id: "dup", panoramaNo: 1 }, { id: "dup", panoramaNo: 2 }] }));
    fs.writeFileSync(path.join(brokenDir, "catalog.json"), JSON.stringify(catalogData));
    const broken = loadFreshModules(brokenDir);
    assert.throws(() => broken.sqlite.getDatabase(), /重复 id/);
    const inspect = new DatabaseSync(path.join(brokenDir, "panorama.sqlite"));
    assert.strictEqual(inspect.prepare("PRAGMA user_version").get().user_version, 0);
    assert.strictEqual(inspect.prepare("SELECT COUNT(*) AS n FROM projects").get().n, 0);
    inspect.close();
    fs.writeFileSync(path.join(brokenDir, "gallery.json"), JSON.stringify({ items: [{ id: "fixed", panoramaNo: 1 }] }));
    const repaired = loadFreshModules(brokenDir);
    assert.strictEqual((await repaired.store.readGallery()).length, 1);
    repaired.sqlite.closeDatabase();

    // Concurrent writes get atomic numbering/conflict behavior; same-URL updates retain one ID.
    const concurrentDir = path.join(root, "concurrent");
    const concurrent = loadFreshModules(concurrentDir);
    await Promise.all([
      concurrent.store.upsertItem({ id: "same-a", panoramaNo: 1, name: "one", sourceType: "remote-url", originalUrl: "https://example.com/same.jpg", viewerPath: "/one" }),
      concurrent.store.upsertItem({ id: "same-b", panoramaNo: 2, name: "two", sourceType: "remote-url", originalUrl: "https://example.com/same.jpg", viewerPath: "/two" })
    ]);
    const afterSameUrl = await concurrent.store.readGallery();
    assert.strictEqual(afterSameUrl.length, 1);
    assert.strictEqual(afterSameUrl[0].id, "same-a");
    const attempts = await Promise.allSettled([
      concurrent.store.upsertItem({ id: "conflict-a", panoramaNo: 8, name: "eight A", viewerPath: "/a" }),
      concurrent.store.upsertItem({ id: "conflict-b", panoramaNo: 8, name: "eight B", viewerPath: "/b" })
    ]);
    assert.strictEqual(attempts.filter((result) => result.status === "fulfilled").length, 1);
    const rejected = attempts.find((result) => result.status === "rejected");
    assert.strictEqual(rejected.reason.statusCode, 409);
    assert.strictEqual((await concurrent.store.readGallery()).length, 2);
    const media = require("../backend/media");
    const uploadsDir = path.join(concurrentDir, "uploads");
    fs.mkdirSync(uploadsDir, { recursive: true });
    const unicodeName = "旅行 全景.jpg";
    const unicodePath = path.join(uploadsDir, unicodeName);
    fs.writeFileSync(unicodePath, "image bytes");
    assert.strictEqual(media.safeLocalMediaPath("/media/uploads/" + encodeURIComponent(unicodeName)), unicodePath);
    assert.strictEqual(media.safeLocalMediaPath("/media/panorama.sqlite"), null);
    assert.strictEqual(media.safeLocalMediaPath("/media/uploads/missing.json"), null);
    const uploadA = await media.createUploadPathAsync("同毫秒图", ".jpg");
    const uploadB = await media.createUploadPathAsync("同毫秒图", ".jpg");
    assert.notStrictEqual(uploadA.absolutePath, uploadB.absolutePath);
    await uploadA.handle.close();
    await uploadB.handle.close();
    await fs.promises.rm(uploadA.absolutePath);
    await fs.promises.rm(uploadB.absolutePath);
    concurrent.sqlite.closeDatabase();
  } finally {
    delete process.env.PANORAMA_STORAGE_DIR;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

run().then(function done() {
  console.log("sqlite tests passed");
}).catch(function failed(error) {
  console.error(error);
  process.exitCode = 1;
});
