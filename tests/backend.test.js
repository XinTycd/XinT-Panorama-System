const assert = require("assert");
const fs = require("fs");
const http = require("http");
const path = require("path");
const packageInfo = require("../package.json");

const TEST_STORAGE_DIR = path.join(__dirname, ".tmp", "storage-" + process.pid + "-" + Date.now());
process.env.PANORAMA_STORAGE_DIR = TEST_STORAGE_DIR;

const { createServer } = require("../backend/index");
const { writeGallery, closeDatabase } = require("../backend/store");
const { verifyReleaseSnapshot } = require("../backend/project-delivery");

function request(port, pathname, options) {
  const payload = options && options.body ? options.body : null;
  return new Promise(function resolveRequest(resolve, reject) {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: port,
        path: pathname,
        method: (options && options.method) || "GET",
        headers: payload
          ? {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(payload)
            }
          : {}
      },
      function onResponse(res) {
        const chunks = [];
        res.on("data", function onData(chunk) {
          chunks.push(chunk);
        });
        res.on("end", function onEnd() {
          resolve({
            statusCode: res.statusCode,
            body: Buffer.concat(chunks).toString("utf8"),
            headers: res.headers
          });
        });
      }
    );

    req.on("error", function onRequestError(error) {
      error.requestPath = pathname;
      reject(error);
    });
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

async function run() {
  await writeGallery([]);
  const server = createServer();

  await new Promise(function start(resolve) {
    server.listen(0, "127.0.0.1", resolve);
  });

  const port = server.address().port;

  try {
    const deletePreflight = await request(port, "/api/projects/some-id", { method: "OPTIONS" });
    assert.strictEqual(deletePreflight.statusCode, 204);
    assert.match(deletePreflight.headers["access-control-allow-methods"], /DELETE/);

    const health = await request(port, "/api/health");
    assert.strictEqual(health.statusCode, 200);
    assert.ok(JSON.parse(health.body).ok);

    const config = await request(port, "/api/config");
    const configPayload = JSON.parse(config.body);
    assert.strictEqual(config.statusCode, 200);
    assert.strictEqual(configPayload.app.name, "XinT 全景系统");
    assert.strictEqual(configPayload.app.version, packageInfo.version);
    assert.strictEqual(configPayload.app.repositoryUrl, "https://github.com/XinTycd/XinT-Panorama-System");
    assert.deepStrictEqual(configPayload.viewer, { engine: "psv", forcedByEnvironment: false });
    const saveViewerEngine = await request(port, "/api/settings/viewer", { method: "PUT", body: JSON.stringify({ engine: "legacy" }) });
    assert.strictEqual(saveViewerEngine.statusCode, 200);
    assert.strictEqual(JSON.parse(saveViewerEngine.body).viewer.engine, "legacy");
    const savedViewerConfig = await request(port, "/api/config");
    assert.strictEqual(JSON.parse(savedViewerConfig.body).viewer.engine, "legacy");
    const invalidViewerEngine = await request(port, "/api/settings/viewer", { method: "PUT", body: JSON.stringify({ engine: "planet" }) });
    assert.strictEqual(invalidViewerEngine.statusCode, 400);
    const legacyScript = await request(port, "/assets/legacy-viewer.js");
    assert.strictEqual(legacyScript.statusCode, 200);
    const threeScript = await request(port, "/assets/three.min.js");
    assert.strictEqual(threeScript.statusCode, 200);

    const demo = await request(port, "/api/gallery/seed-demo", {
      method: "POST",
      body: JSON.stringify({})
    });
    assert.strictEqual(demo.statusCode, 200);
    const demoPayload = JSON.parse(demo.body);
    assert.ok((demoPayload.items || []).length >= 1);
    assert.strictEqual(demoPayload.items[0].panoramaNo, 1);

    const createBuildingGroup = await request(port, "/api/gallery/groups", {
      method: "POST", body: JSON.stringify({ name: "  建筑  " })
    });
    assert.strictEqual(createBuildingGroup.statusCode, 201);
    assert.deepStrictEqual(JSON.parse(createBuildingGroup.body).group, { name: "建筑", count: 0 });
    const duplicateBuildingGroup = await request(port, "/api/gallery/groups", {
      method: "POST", body: JSON.stringify({ name: "建筑" })
    });
    assert.strictEqual(duplicateBuildingGroup.statusCode, 409);
    const createInteriorGroup = await request(port, "/api/gallery/groups", {
      method: "POST", body: JSON.stringify({ name: "室内" })
    });
    assert.strictEqual(createInteriorGroup.statusCode, 201);
    const createEmptyGroup = await request(port, "/api/gallery/groups", {
      method: "POST", body: JSON.stringify({ name: "空组" })
    });
    assert.strictEqual(createEmptyGroup.statusCode, 201);

    const uploadsDir = path.join(TEST_STORAGE_DIR, "uploads");
    const uploadsBeforeFailedGroup = fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir).sort() : [];
    const failedGroupedUpload = await request(port, "/api/panoramas/upload-base64", {
      method: "POST",
      body: JSON.stringify({
        name: "invalid-group-upload",
        group: "not-created",
        dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9nK3sAAAAASUVORK5CYII="
      })
    });
    assert.strictEqual(failedGroupedUpload.statusCode, 400);
    assert.deepStrictEqual(fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir).sort() : [], uploadsBeforeFailedGroup);

    const upload = await request(port, "/api/panoramas/upload-base64", {
      method: "POST",
      body: JSON.stringify({
        name: "unit-test",
        description: "initial description",
        panoramaNo: 2,
        resequence: true,
        dataUrl:
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9nK3sAAAAASUVORK5CYII="
      })
    });
    assert.strictEqual(upload.statusCode, 200);
    const uploadPayload = JSON.parse(upload.body);
    assert.strictEqual(uploadPayload.item.panoramaNo, 2);
    assert.strictEqual(uploadPayload.item.description, "initial description");
    assert.ok(Array.isArray(uploadPayload.items), "Upload responses include the gallery by default");

    const databaseRecord = await request(port, "/api/panoramas/create", {
      method: "POST",
      body: JSON.stringify({
        title: "database-panorama",
        imageUrl: "https://example.com/panorama.jpg",
        panoramaNo: 2001,
        group: "  建筑  "
      })
    });
    assert.strictEqual(databaseRecord.statusCode, 200);
    const databasePayload = JSON.parse(databaseRecord.body);
    assert.strictEqual(databasePayload.item.panoramaNo, 2001);
    assert.strictEqual(databasePayload.item.name, "database-panorama");
    assert.strictEqual(databasePayload.item.sourceType, "database-record");
    assert.strictEqual(databasePayload.item.group, "建筑");

    const missingGroupItem = await request(port, "/api/panoramas/create", {
      method: "POST",
      body: JSON.stringify({ imageUrl: "https://example.com/missing-group.jpg", group: "not-created" })
    });
    assert.strictEqual(missingGroupItem.statusCode, 400);
    assert.strictEqual(JSON.parse(missingGroupItem.body).message.includes("先创建"), true);

    const updateGroup = await request(port, "/api/panoramas/update", {
      method: "POST",
      body: JSON.stringify({ id: databasePayload.item.id, panoramaNo: 2001, group: " 室内 " })
    });
    assert.strictEqual(updateGroup.statusCode, 200);
    assert.strictEqual(JSON.parse(updateGroup.body).item.group, "室内");
    const duplicateImageAddress = await request(port, "/api/panoramas/create", {
      method: "POST",
      body: JSON.stringify({ imageUrl: "https://example.com/panorama.jpg", name: "same address" })
    });
    assert.strictEqual(duplicateImageAddress.statusCode, 200);
    assert.strictEqual(JSON.parse(duplicateImageAddress.body).item.id, databasePayload.item.id);
    assert.strictEqual(JSON.parse(duplicateImageAddress.body).item.group, "室内");
    const groupsAfterUpdates = JSON.parse((await request(port, "/api/gallery/groups")).body).items;
    assert.deepStrictEqual(groupsAfterUpdates.find((group) => group.name === "建筑"), { name: "建筑", count: 0 });
    assert.deepStrictEqual(groupsAfterUpdates.find((group) => group.name === "室内"), { name: "室内", count: 1 });
    assert.deepStrictEqual(groupsAfterUpdates.find((group) => group.name === ""), { name: "", count: 2 });
    const deleteInteriorGroup = await request(port, "/api/gallery/groups?name=" + encodeURIComponent("室内"), { method: "DELETE" });
    assert.strictEqual(deleteInteriorGroup.statusCode, 200);
    assert.deepStrictEqual(JSON.parse(deleteInteriorGroup.body).group, { name: "室内", movedToUngrouped: 1 });
    assert.strictEqual((await request(port, "/api/gallery/groups?name=" + encodeURIComponent("室内"), { method: "DELETE" })).statusCode, 404);
    assert.strictEqual(JSON.parse((await request(port, "/api/panoramas/by-no?no=2001")).body).item.group, "");
    const groupsAfterDelete = JSON.parse((await request(port, "/api/gallery/groups")).body).items;
    assert.deepStrictEqual(groupsAfterDelete.find((group) => group.name === ""), { name: "", count: 3 });
    assert.deepStrictEqual(groupsAfterDelete.find((group) => group.name === "空组"), { name: "空组", count: 0 });
    const invalidLongGroup = await request(port, "/api/panoramas/update", {
      method: "POST",
      body: JSON.stringify({ id: databasePayload.item.id, panoramaNo: 2001, group: "g".repeat(65) })
    });
    assert.strictEqual(invalidLongGroup.statusCode, 400);

    const autoNumberOne = await request(port, "/api/panoramas/create", {
      method: "POST",
      body: JSON.stringify({ imageUrl: "/media/uploads/auto-one.jpg" })
    });
    assert.strictEqual(autoNumberOne.statusCode, 200);
    const autoNumberOneItem = JSON.parse(autoNumberOne.body).item;
    assert.strictEqual(autoNumberOneItem.panoramaNo, 2002);
    const deleteAutoNumberOne = await request(port, "/api/panoramas/" + autoNumberOneItem.id, { method: "DELETE" });
    assert.strictEqual(deleteAutoNumberOne.statusCode, 200);
    const autoNumberTwo = await request(port, "/api/panoramas/create", {
      method: "POST",
      body: JSON.stringify({ imageUrl: "/media/uploads/auto-two.jpg" })
    });
    assert.strictEqual(JSON.parse(autoNumberTwo.body).item.panoramaNo, 2003);

    const gallery = await request(port, "/api/gallery");
    const galleryPayload = JSON.parse(gallery.body);
    assert.ok(galleryPayload.items.length >= 3);

    const byNo = await request(port, "/api/panoramas/by-no?no=" + uploadPayload.item.panoramaNo);
    const byNoPayload = JSON.parse(byNo.body);
    assert.strictEqual(byNo.statusCode, 200);
    assert.strictEqual(byNoPayload.item.panoramaNo, uploadPayload.item.panoramaNo);

    const update = await request(port, "/api/panoramas/update", {
      method: "POST",
      body: JSON.stringify({
        id: uploadPayload.item.id,
        panoramaNo: 3001,
        name: "updated-panorama",
        description: "updated description"
      })
    });
    const updatePayload = JSON.parse(update.body);
    assert.strictEqual(update.statusCode, 200);
    assert.strictEqual(updatePayload.item.panoramaNo, 3001);
    assert.strictEqual(updatePayload.item.name, "updated-panorama");
    assert.strictEqual(updatePayload.item.description, "updated description");

    const createProject = await request(port, "/api/projects", {
      method: "POST",
      body: JSON.stringify({
        name: "园区导览",
        description: "Core 0.2 项目测试"
      })
    });
    assert.strictEqual(createProject.statusCode, 201);
    const projectPayload = JSON.parse(createProject.body);
    assert.strictEqual(projectPayload.project.name, "园区导览");

    const projectList = await request(port, "/api/projects?limit=1&offset=0");
    const projectListPayload = JSON.parse(projectList.body);
    assert.strictEqual(projectList.statusCode, 200);
    assert.strictEqual(projectListPayload.total, 1);
    assert.strictEqual(projectListPayload.items.length, 1);
    const defaultProjectList = JSON.parse((await request(port, "/api/projects")).body);
    assert.strictEqual(defaultProjectList.limit, 20);

    const firstScene = await request(port, "/api/projects/" + projectPayload.project.id + "/scenes", {
      method: "POST",
      body: JSON.stringify({
        name: "入口大厅",
        panoramaId: uploadPayload.item.id,
        initialYaw: 0,
        initialPitch: 0,
        initialFov: 75
      })
    });
    assert.strictEqual(firstScene.statusCode, 201);
    const firstScenePayload = JSON.parse(firstScene.body);
    const referencedPanoramaDelete = await request(port, "/api/panoramas/" + uploadPayload.item.id, { method: "DELETE" });
    assert.strictEqual(referencedPanoramaDelete.statusCode, 409);
    assert.strictEqual(JSON.parse(referencedPanoramaDelete.body).references, 1);

    const invalidPanoramaUpdate = await request(port, "/api/scenes/" + firstScenePayload.scene.id, {
      method: "POST",
      body: JSON.stringify({ panoramaId: "missing-panorama" })
    });
    assert.strictEqual(invalidPanoramaUpdate.statusCode, 400);
    const clearPanorama = await request(port, "/api/scenes/" + firstScenePayload.scene.id, {
      method: "POST",
      body: JSON.stringify({ panoramaId: null })
    });
    assert.strictEqual(clearPanorama.statusCode, 200);
    assert.strictEqual(JSON.parse(clearPanorama.body).scene.panoramaId, null);
    await request(port, "/api/scenes/" + firstScenePayload.scene.id, {
      method: "POST",
      body: JSON.stringify({ panoramaId: uploadPayload.item.id })
    });

    const secondScene = await request(port, "/api/projects/" + projectPayload.project.id + "/scenes", {
      method: "POST",
      body: JSON.stringify({
        name: "展厅",
        panoramaId: databasePayload.item.id
      })
    });
    assert.strictEqual(secondScene.statusCode, 201);
    const secondScenePayload = JSON.parse(secondScene.body);

    const sceneHotspot = await request(port, "/api/scenes/" + firstScenePayload.scene.id + "/hotspots", {
      method: "POST",
      body: JSON.stringify({
        type: "scene",
        title: "进入展厅",
        targetSceneId: secondScenePayload.scene.id,
        yaw: 0.2,
        pitch: -0.1
      })
    });
    assert.strictEqual(sceneHotspot.statusCode, 201);
    assert.strictEqual(JSON.parse(sceneHotspot.body).hotspot.targetSceneId, secondScenePayload.scene.id);

    const diagnostics = await request(port, "/api/projects/" + projectPayload.project.id + "/diagnostics");
    const diagnosticsPayload = JSON.parse(diagnostics.body);
    assert.strictEqual(diagnostics.statusCode, 200);
    assert.strictEqual(diagnosticsPayload.report.ready, true);
    assert.strictEqual(diagnosticsPayload.report.offlineSafe, false);
    assert.ok(diagnosticsPayload.report.score >= 80);
    assert.ok(diagnosticsPayload.report.checks.some(function hasRemoteDependency(check) {
      return check.id === "REMOTE_ASSET_DEPENDENCY";
    }));

    const createOtherProject = await request(port, "/api/projects", {
      method: "POST",
      body: JSON.stringify({ name: "隔离项目" })
    });
    const otherProjectPayload = JSON.parse(createOtherProject.body);
    const emptyDiagnostics = await request(port, "/api/projects/" + otherProjectPayload.project.id + "/diagnostics");
    const emptyDiagnosticsPayload = JSON.parse(emptyDiagnostics.body);
    assert.strictEqual(emptyDiagnostics.statusCode, 200);
    assert.strictEqual(emptyDiagnosticsPayload.report.ready, false);
    assert.ok(emptyDiagnosticsPayload.report.checks.some(function hasEmptySceneError(check) {
      return check.id === "SCENES_EMPTY" && check.level === "error";
    }));

    const blockedRelease = await request(port, "/api/projects/" + otherProjectPayload.project.id + "/releases", {
      method: "POST",
      body: JSON.stringify({ name: "应被诊断阻止" })
    });
    assert.strictEqual(blockedRelease.statusCode, 422);
    assert.strictEqual(JSON.parse(blockedRelease.body).report.summary.error > 0, true);

    const otherScene = await request(port, "/api/projects/" + otherProjectPayload.project.id + "/scenes", {
      method: "POST",
      body: JSON.stringify({ name: "隔离场景", panoramaId: uploadPayload.item.id })
    });
    const otherScenePayload = JSON.parse(otherScene.body);
    const crossProjectHotspot = await request(port, "/api/scenes/" + firstScenePayload.scene.id + "/hotspots", {
      method: "POST",
      body: JSON.stringify({
        type: "scene",
        title: "非法跳转",
        targetSceneId: otherScenePayload.scene.id,
        yaw: 0,
        pitch: 0
      })
    });
    assert.strictEqual(crossProjectHotspot.statusCode, 400);

    const release = await request(port, "/api/projects/" + projectPayload.project.id + "/releases", {
      method: "POST",
      body: JSON.stringify({ name: "首发版本" })
    });
    assert.strictEqual(release.statusCode, 201);
    const releasePayload = JSON.parse(release.body);
    assert.strictEqual(releasePayload.release.version, 1);
    assert.strictEqual(releasePayload.release.snapshot.scenes.length, 2);
    assert.strictEqual(releasePayload.release.snapshot.assets.length, 2);
    assert.strictEqual(releasePayload.release.snapshot.integrity.algorithm, "sha256");
    assert.match(releasePayload.release.snapshot.integrity.digest, /^[a-f0-9]{64}$/);

    const releaseVerification = await request(
      port,
      "/api/releases/" + releasePayload.release.id + "/verify"
    );
    const releaseVerificationPayload = JSON.parse(releaseVerification.body);
    assert.strictEqual(releaseVerification.statusCode, 200);
    assert.strictEqual(releaseVerificationPayload.verification.verified, true);
    assert.strictEqual(releaseVerificationPayload.verification.snapshotVerified, true);
    assert.strictEqual(releaseVerificationPayload.verification.allAssetsVerified, false);
    assert.ok(releaseVerificationPayload.verification.assetResults.some(function unverifiedRemote(asset) {
      return asset.status === "remote" && asset.verified === null && asset.verification === "not-checked";
    }));

    const tamperedSnapshot = JSON.parse(JSON.stringify(releasePayload.release.snapshot));
    tamperedSnapshot.scenes[0].name = "被修改的场景";
    const tamperedVerification = await verifyReleaseSnapshot(tamperedSnapshot, TEST_STORAGE_DIR);
    assert.strictEqual(tamperedVerification.verified, false);
    assert.strictEqual(tamperedVerification.snapshotVerified, false);

    const secondRelease = await request(port, "/api/projects/" + projectPayload.project.id + "/releases", {
      method: "POST",
      body: JSON.stringify({ name: "第二个版本" })
    });
    assert.strictEqual(secondRelease.statusCode, 201);
    assert.strictEqual(JSON.parse(secondRelease.body).release.version, 2);

    const concurrentReleases = await Promise.all([
      request(port, "/api/projects/" + projectPayload.project.id + "/releases", {
        method: "POST", body: JSON.stringify({ name: "并发版本甲" })
      }),
      request(port, "/api/projects/" + projectPayload.project.id + "/releases", {
        method: "POST", body: JSON.stringify({ name: "并发版本乙" })
      })
    ]);
    assert.deepStrictEqual(concurrentReleases.map(function readVersion(result) {
      assert.strictEqual(result.statusCode, 201);
      return JSON.parse(result.body).release.version;
    }).sort(), [3, 4]);

    const projectExport = await request(port, "/api/projects/" + projectPayload.project.id + "/export");
    assert.strictEqual(projectExport.statusCode, 200);
    const exportPayload = JSON.parse(projectExport.body);
    const projectImport = await request(port, "/api/projects/import", {
      method: "POST",
      body: JSON.stringify(exportPayload)
    });
    assert.strictEqual(projectImport.statusCode, 201);
    const importPayload = JSON.parse(projectImport.body);
    assert.strictEqual(importPayload.project.scenes.length, 2);
    assert.strictEqual(importPayload.project.hotspots.length, 1);
    assert.notStrictEqual(importPayload.project.scenes[0].id, exportPayload.project.scenes[0].id);
    assert.deepStrictEqual(importPayload.project.releases, []);
    assert.strictEqual(importPayload.project.scenes[0].panoramaId, exportPayload.project.scenes[0].panoramaId);
    assert.notStrictEqual(importPayload.project.hotspots[0].id, exportPayload.project.hotspots[0].id);
    assert.notStrictEqual(importPayload.project.hotspots[0].sceneId, exportPayload.project.hotspots[0].sceneId);
    assert.notStrictEqual(importPayload.project.hotspots[0].targetSceneId, exportPayload.project.hotspots[0].targetSceneId);

    const countBeforeInvalidImport = JSON.parse((await request(port, "/api/projects")).body).total;
    const invalidImport = await request(port, "/api/projects/import", {
      method: "POST",
      body: JSON.stringify({
        project: { name: "不会写入" },
        scenes: [{ id: "source-scene", name: "源场景", panoramaId: "missing-assets-are-preserved" }],
        hotspots: [{ id: "bad-hotspot", sceneId: "unknown-scene", type: "info", yaw: 0, pitch: 0 }]
      })
    });
    assert.strictEqual(invalidImport.statusCode, 400);
    assert.strictEqual(JSON.parse((await request(port, "/api/projects")).body).total, countBeforeInvalidImport);

    const invalidJumpImport = await request(port, "/api/projects/import", {
      method: "POST",
      body: JSON.stringify({
        project: { name: "无效跳转项目" },
        scenes: [{ id: "scene-a", name: "场景 A" }],
        hotspots: [{ id: "hotspot-a", sceneId: "scene-a", type: "scene", targetSceneId: "scene-missing", yaw: 0, pitch: 0 }]
      })
    });
    assert.strictEqual(invalidJumpImport.statusCode, 400);
    assert.strictEqual(JSON.parse((await request(port, "/api/projects")).body).total, countBeforeInvalidImport);

    const missingAssetImport = await request(port, "/api/projects/import", {
      method: "POST",
      body: JSON.stringify({
        project: { name: "待补资源" },
        scenes: [{ id: "orphan-scene", name: "缺图场景", panoramaId: "missing-assets-are-preserved" }],
        hotspots: []
      })
    });
    assert.strictEqual(missingAssetImport.statusCode, 201);
    const missingAssetProjectId = JSON.parse(missingAssetImport.body).project.project.id;
    const missingAssetDiagnostics = JSON.parse((await request(port, "/api/projects/" + missingAssetProjectId + "/diagnostics")).body);
    assert.strictEqual(missingAssetDiagnostics.report.checks.some(function reportsBrokenAsset(check) {
      return check.id === "ASSET_REFERENCE_BROKEN";
    }), true);
    assert.strictEqual(JSON.parse((await request(port, "/api/projects/" + missingAssetProjectId)).body).project.scenes[0].panoramaId, "missing-assets-are-preserved");

    const unreachableSceneResponse = await request(port, "/api/projects/" + projectPayload.project.id + "/scenes", {
      method: "POST",
      body: JSON.stringify({ name: "孤立场景", panoramaId: databasePayload.item.id })
    });
    assert.strictEqual(unreachableSceneResponse.statusCode, 201);
    const unreachableSceneId = JSON.parse(unreachableSceneResponse.body).scene.id;
    const unreachableReport = JSON.parse((await request(port, "/api/projects/" + projectPayload.project.id + "/diagnostics")).body).report;
    assert.ok(unreachableReport.checks.some(function findsUnreachableScene(check) {
      return check.id === "SCENE_UNREACHABLE" && check.entityId === unreachableSceneId && check.level === "warning";
    }));
    assert.strictEqual(unreachableReport.stats.remoteDependencies, 1);

    const cascadeProjectResponse = await request(port, "/api/projects", {
      method: "POST",
      body: JSON.stringify({ name: "删除级联测试" })
    });
    const cascadeProject = JSON.parse(cascadeProjectResponse.body).project;
    const cascadeSceneAResponse = await request(port, "/api/projects/" + cascadeProject.id + "/scenes", {
      method: "POST", body: JSON.stringify({ name: "场景 A", panoramaId: uploadPayload.item.id })
    });
    const cascadeSceneBResponse = await request(port, "/api/projects/" + cascadeProject.id + "/scenes", {
      method: "POST", body: JSON.stringify({ name: "场景 B", panoramaId: uploadPayload.item.id })
    });
    const cascadeSceneA = JSON.parse(cascadeSceneAResponse.body).scene;
    const cascadeSceneB = JSON.parse(cascadeSceneBResponse.body).scene;
    await request(port, "/api/scenes/" + cascadeSceneA.id + "/hotspots", {
      method: "POST", body: JSON.stringify({ type: "scene", targetSceneId: cascadeSceneB.id, yaw: 0, pitch: 0 })
    });
    await request(port, "/api/scenes/" + cascadeSceneB.id + "/hotspots", {
      method: "POST", body: JSON.stringify({ type: "scene", targetSceneId: cascadeSceneA.id, yaw: 1, pitch: 1 })
    });
    const extraHotspotResponse = await request(port, "/api/scenes/" + cascadeSceneA.id + "/hotspots", {
      method: "POST", body: JSON.stringify({ type: "info", title: "待删除热点", yaw: 2, pitch: 2 })
    });
    const extraHotspotId = JSON.parse(extraHotspotResponse.body).hotspot.id;
    assert.strictEqual((await request(port, "/api/hotspots/" + extraHotspotId, { method: "DELETE" })).statusCode, 200);
    assert.strictEqual((await request(port, "/api/hotspots/" + extraHotspotId, { method: "DELETE" })).statusCode, 404);
    const cascadeReleaseResponse = await request(port, "/api/projects/" + cascadeProject.id + "/releases", {
      method: "POST", body: JSON.stringify({ name: "删除前快照" })
    });
    assert.strictEqual(cascadeReleaseResponse.statusCode, 201);
    const cascadeRelease = JSON.parse(cascadeReleaseResponse.body).release;
    const beforeSceneDelete = JSON.parse((await request(port, "/api/projects/" + cascadeProject.id)).body).project.project;
    const deleteCascadeScene = await request(port, "/api/scenes/" + cascadeSceneB.id, { method: "DELETE" });
    assert.strictEqual(deleteCascadeScene.statusCode, 200);
    const afterSceneDelete = JSON.parse((await request(port, "/api/projects/" + cascadeProject.id)).body).project;
    assert.strictEqual(afterSceneDelete.scenes.length, 1);
    assert.strictEqual(afterSceneDelete.hotspots.length, 0);
    assert.ok(afterSceneDelete.project.updatedAt > beforeSceneDelete.updatedAt);
    const preservedRelease = JSON.parse((await request(port, "/api/releases/" + cascadeRelease.id)).body).release;
    assert.strictEqual(preservedRelease.snapshot.scenes.length, 2);
    assert.strictEqual((await request(port, "/api/scenes/" + cascadeSceneB.id, { method: "DELETE" })).statusCode, 404);
    const deleteCascadeProject = await request(port, "/api/projects/" + cascadeProject.id, { method: "DELETE" });
    assert.strictEqual(deleteCascadeProject.statusCode, 200);
    assert.strictEqual((await request(port, "/api/projects/" + cascadeProject.id)).statusCode, 404);
    assert.strictEqual((await request(port, "/api/releases/" + cascadeRelease.id)).statusCode, 404);

    const unusedUploadResponse = await request(port, "/api/panoramas/upload-base64", {
      method: "POST",
      body: JSON.stringify({ name: "待删除文件", dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9nK3sAAAAASUVORK5CYII=" })
    });
    assert.strictEqual(unusedUploadResponse.statusCode, 200);
    const unusedUpload = JSON.parse(unusedUploadResponse.body).item;
    const retainedFilePath = path.join(TEST_STORAGE_DIR, "uploads", decodeURIComponent(unusedUpload.viewerPath.split("/").pop()));
    const deleteUnusedUpload = await request(port, "/api/panoramas/" + unusedUpload.id, { method: "DELETE" });
    assert.strictEqual(deleteUnusedUpload.statusCode, 200);
    assert.strictEqual(fs.existsSync(retainedFilePath), true);

    const blockedProxy = await request(port, "/api/panoramas/proxy?url=" + encodeURIComponent("http://127.0.0.1/secret"));
    assert.strictEqual(blockedProxy.statusCode, 403);

    const galleryClear = await request(port, "/api/gallery/clear", { method: "POST", body: JSON.stringify({}) });
    assert.strictEqual(galleryClear.statusCode, 200);
    assert.strictEqual(fs.existsSync(retainedFilePath), true);
    const groupsAfterClear = JSON.parse((await request(port, "/api/gallery/groups")).body).items;
    assert.deepStrictEqual(groupsAfterClear.filter((group) => group.name).map((group) => group.name).sort(), ["建筑", "空组"]);
    assert.deepStrictEqual(groupsAfterClear.filter((group) => group.name).map((group) => group.count), [0, 0]);
    const releaseAfterGalleryClear = await request(port, "/api/releases/" + releasePayload.release.id + "/verify");
    assert.strictEqual(releaseAfterGalleryClear.statusCode, 200);
    assert.strictEqual(JSON.parse(releaseAfterGalleryClear.body).verification.verified, true);

    const compactUpload = await request(port, "/api/panoramas/upload-base64?includeItems=0", {
      method: "POST",
      body: JSON.stringify({
        name: "compact-response",
        dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9nK3sAAAAASUVORK5CYII="
      })
    });
    assert.strictEqual(compactUpload.statusCode, 200);
    const compactUploadPayload = JSON.parse(compactUpload.body);
    assert.deepStrictEqual(Object.keys(compactUploadPayload).sort(), ["item", "ok"]);
    const compactByNo = await request(port, "/api/panoramas/by-no?no=" + compactUploadPayload.item.panoramaNo);
    assert.strictEqual(JSON.parse(compactByNo.body).item.id, compactUploadPayload.item.id);
    const deleteCompactUpload = await request(port, "/api/panoramas/" + compactUploadPayload.item.id, { method: "DELETE" });
    assert.strictEqual(deleteCompactUpload.statusCode, 200);

    console.log("Backend tests passed");
  } finally {
    await request(port, "/api/gallery/clear", {
      method: "POST",
      body: JSON.stringify({})
    });
    await writeGallery([]);
    await new Promise(function stop(resolve) {
      server.close(resolve);
    });
    closeDatabase();
    fs.rmSync(TEST_STORAGE_DIR, { recursive: true, force: true });
  }
}

run().catch(function onError(error) {
  console.error(error);
  process.exit(1);
});
