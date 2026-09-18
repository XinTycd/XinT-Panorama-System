const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "frontend", "project-scene-actions.js"), "utf8");
const window = {};
vm.runInNewContext(source, { window, AbortController, setTimeout, clearTimeout });
const createActions = window.XinTProjectSceneActions.create;

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function createHarness(options = {}) {
  const serverPackage = clone(options.projectPackage || {
    project: { id: "project-a", name: "Nested project package" },
    scenes: [
      { id: "scene-current", projectId: "project-a", panoramaId: "panorama-1", name: "Current" },
      { id: "scene-other", projectId: "project-a", panoramaId: "panorama-1", name: "Other scene, same image" }
    ],
    hotspots: [
      { id: "hot-current", sceneId: "scene-current", type: "info" },
      { id: "hot-other", sceneId: "scene-other", type: "info" },
      { id: "hot-link-to-current", sceneId: "scene-other", type: "scene", targetSceneId: "scene-current" }
    ],
    releases: []
  });
  const state = {
    connectionId: 3,
    projectRequestId: 8,
    currentProjectId: "project-a",
    currentProject: clone(serverPackage),
    currentSceneId: options.currentSceneId === undefined ? "scene-current" : options.currentSceneId,
    activeHotspotId: options.activeHotspotId === undefined ? "hot-current" : options.activeHotspotId,
    projects: [{ id: "project-a", name: "Nested project package" }],
    items: [{ id: "panorama-1", panoramaNo: 10 }]
  };
  const calls = [];
  const messages = { scene: "", status: "" };
  const controls = { disabled: false };
  let deleteFailure = options.deleteFailure || null;
  const actions = createActions({
    state,
    timeoutMs: options.timeoutMs || 15000,
    confirm: () => true,
    setSceneStatus(value) { messages.scene = value; },
    setStatus(value) { messages.status = value; },
    setProjectDeleteButtonsDisabled(value) { controls.disabled = value; },
    renderProjects() { calls.push("render-projects"); },
    renderProjectScenes() { calls.push("render-scenes"); },
    renderSpatialHotspots() { calls.push("render-hotspots"); },
    async request(url, requestOptions = {}) {
      calls.push({ url, options: requestOptions });
      if (url.startsWith("/api/scenes/") && requestOptions.method === "DELETE") {
        if (deleteFailure) {
          const error = deleteFailure;
          deleteFailure = null;
          throw error;
        }
        const sceneId = decodeURIComponent(url.split("/").pop());
        serverPackage.scenes = serverPackage.scenes.filter((scene) => scene.id !== sceneId);
        serverPackage.hotspots = serverPackage.hotspots.filter((hotspot) =>
          hotspot.sceneId !== sceneId && !(hotspot.type === "scene" && hotspot.targetSceneId === sceneId)
        );
        return { ok: true };
      }
      if (url === "/api/projects/project-a") return { project: clone(serverPackage) };
      if (url === "/api/projects?limit=100") return { items: [{ id: "project-a", name: "Nested project package" }] };
      throw new Error("Unexpected request: " + url);
    }
  });
  return { state, actions, calls, messages, controls, serverPackage };
}

async function testNestedProjectPackageDeletion() {
  const h = createHarness();
  await h.actions.deleteScene({ id: "scene-current", name: "Current" });
  assert.equal(h.state.currentProject.project.id, "project-a", "Nested project metadata is retained");
  assert.deepEqual(h.state.currentProject.scenes.map((scene) => scene.id), ["scene-other"], "Only the requested scene is removed");
  assert.equal(h.state.currentProject.scenes[0].panoramaId, "panorama-1", "Another scene using the same gallery image remains");
  assert.deepEqual(h.state.currentProject.hotspots, [{ id: "hot-other", sceneId: "scene-other", type: "info" }], "Deleted scene hotspots and inbound links are removed");
  assert.equal(h.state.items.length, 1, "Gallery panorama resource remains intact");
  assert.equal(h.state.currentProjectId, "project-a", "Project remains selected");
  assert.equal(h.state.currentSceneId, null, "Deleting the current scene clears its scene selection");
  assert.equal(h.state.activeHotspotId, null, "Deleting the current scene clears its active hotspot");
  assert.equal(h.messages.scene, "场景及关联热点已删除。");
  assert.equal(h.messages.status, "项目场景已删除");
  assert.equal(h.controls.disabled, false);
  assert(h.calls.some((call) => call.url === "/api/projects/project-a"), "Deletion refreshes the nested project package");
  assert(h.calls.some((call) => call.url === "/api/projects?limit=100"), "Deletion refreshes the project list");
}

async function testNonCurrentDeletionPreservesSelection() {
  const h = createHarness({ currentSceneId: "scene-current", activeHotspotId: "hot-current" });
  await h.actions.deleteScene({ id: "scene-other", name: "Other scene" });
  assert.equal(h.state.currentSceneId, "scene-current", "Deleting another scene keeps the current scene selected");
  assert.equal(h.state.activeHotspotId, "hot-current", "Deleting another scene does not clear the current hotspot selection");
  assert(h.state.currentProject.hotspots.some((hotspot) => hotspot.id === "hot-current"));
  assert.equal(h.state.items[0].id, "panorama-1");
}

async function testFailureCanRetry() {
  const h = createHarness({ deleteFailure: Object.assign(new Error("backend unavailable"), { status: 503 }) });
  await h.actions.deleteScene({ id: "scene-current", name: "Current" });
  assert.equal(h.controls.disabled, false, "A failed delete restores its action buttons");
  assert.match(h.messages.scene, /删除场景失败：backend unavailable/);
  assert(h.state.currentProject.scenes.some((scene) => scene.id === "scene-current"), "A failed delete leaves scene data intact");
  await h.actions.deleteScene({ id: "scene-current", name: "Current" });
  assert(!h.state.currentProject.scenes.some((scene) => scene.id === "scene-current"), "The failed action can be retried successfully");
}

async function testNotFoundDeleteSynchronizesState() {
  const h = createHarness({ deleteFailure: Object.assign(new Error("场景不存在"), { status: 404 }) });
  h.serverPackage.scenes = h.serverPackage.scenes.filter((scene) => scene.id !== "scene-current");
  h.serverPackage.hotspots = h.serverPackage.hotspots.filter((hotspot) => hotspot.sceneId !== "scene-current");
  await h.actions.deleteScene({ id: "scene-current", name: "Current" });
  assert(!h.state.currentProject.scenes.some((scene) => scene.id === "scene-current"));
  assert.equal(h.messages.scene, "场景已不存在，项目列表已同步。");
}

async function testRefreshFailureKeepsOptimisticRemoval() {
  const harness = createHarness();
  const state = harness.state;
  const messages = harness.messages;
  const request = async (url, requestOptions) => {
    if (url === "/api/scenes/scene-current") {
      harness.serverPackage.scenes = harness.serverPackage.scenes.filter((scene) => scene.id !== "scene-current");
      return { ok: true };
    }
    if (url === "/api/projects/project-a") throw new Error("refresh unavailable");
    if (url === "/api/projects?limit=100") return { items: [{ id: "project-a" }] };
    throw new Error(url);
  };
  const wrapped = createActions({
    state,
    request,
    confirm: () => true,
    setSceneStatus(value) { messages.scene = value; },
    setStatus(value) { messages.status = value; },
    setProjectDeleteButtonsDisabled() {},
    renderProjects() {}, renderProjectScenes() {}, renderSpatialHotspots() {}
  });
  await wrapped.deleteScene({ id: "scene-current", name: "Current" });
  assert(!state.currentProject.scenes.some((scene) => scene.id === "scene-current"), "Refresh failure must not restore the deleted scene");
  assert.match(messages.scene, /场景已删除，但项目刷新失败：refresh unavailable/);
}

async function testStaleDeleteAfterProjectSwitch() {
  let completeDelete;
  const h = createHarness();
  let getCalls = 0;
  let deleteCalls = 0;
  const actions = createActions({
    state: h.state,
    confirm: () => true,
    setSceneStatus(value) { h.messages.scene = value; },
    setStatus(value) { h.messages.status = value; },
    setProjectDeleteButtonsDisabled(value) { h.controls.disabled = value; },
    renderProjects() {}, renderProjectScenes() {}, renderSpatialHotspots() {},
    request(url) {
      if (url === "/api/scenes/scene-current") {
        deleteCalls += 1;
        return new Promise((resolve) => { completeDelete = resolve; });
      }
      getCalls += 1;
      throw new Error("stale project must not refresh");
    }
  });
  const pending = actions.deleteScene({ id: "scene-current", name: "Current" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(await actions.deleteScene({ id: "scene-current", name: "Current" }), false, "An in-flight project deletion rejects duplicate requests");
  assert.equal(deleteCalls, 1);
  assert.equal(h.controls.disabled, true, "Delete controls remain disabled while the request is active");
  h.state.connectionId += 1;
  h.state.projectRequestId += 1;
  h.state.currentProjectId = "project-b";
  h.state.currentProject = { project: { id: "project-b" }, scenes: [{ id: "scene-b" }], hotspots: [] };
  h.state.currentSceneId = "scene-b";
  h.messages.scene = "";
  completeDelete({ ok: true });
  assert.equal(await pending, false);
  assert.equal(getCalls, 0, "A stale deletion does not refresh or mutate the replacement project");
  assert.deepEqual(h.state.currentProject.scenes, [{ id: "scene-b" }]);
  assert.equal(h.state.currentSceneId, "scene-b");
}

async function testDeleteTimeoutRestoresControls() {
  const state = {
    connectionId: 1,
    projectRequestId: 2,
    currentProjectId: "project-timeout",
    currentProject: {
      project: { id: "project-timeout" },
      scenes: [{ id: "scene-timeout" }],
      hotspots: []
    },
    currentSceneId: null,
    activeHotspotId: null,
    projects: []
  };
  let status = "";
  let buttonsDisabled = false;
  const actions = createActions({
    state,
    timeoutMs: 5,
    confirm: () => true,
    setSceneStatus(value) { status = value; },
    setStatus() {},
    setProjectDeleteButtonsDisabled(value) { buttonsDisabled = value; },
    renderProjects() {}, renderProjectScenes() {}, renderSpatialHotspots() {},
    request(_url, requestOptions) {
      return new Promise((_resolve, reject) => requestOptions.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
    }
  });
  await actions.deleteScene({ id: "scene-timeout", name: "Timeout" });
  assert.match(status, /删除场景失败：请求超时/);
  assert.equal(buttonsDisabled, false);
  assert.equal(state.currentProject.scenes.length, 1, "Timeout must not optimistically remove a scene before DELETE succeeds");
}

async function main() {
  await testNestedProjectPackageDeletion();
  await testNonCurrentDeletionPreservesSelection();
  await testFailureCanRetry();
  await testNotFoundDeleteSynchronizesState();
  await testRefreshFailureKeepsOptimisticRemoval();
  await testStaleDeleteAfterProjectSwitch();
  await testDeleteTimeoutRestoresControls();
  console.log("Project scene action behavior tests passed");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
