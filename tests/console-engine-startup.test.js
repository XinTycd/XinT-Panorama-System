const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "frontend", "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "frontend", "app.js"), "utf8");

function extractFunction(source, signature) {
  const start = source.indexOf(signature);
  assert(start >= 0, "Missing function " + signature);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error("Unterminated function " + signature);
}

const factorySource = extractFunction(app, "function createEngineAssetLoader(loadAsset)");
const createLoader = vm.runInNewContext("(" + factorySource + ")");
const loaded = [];
const loader = createLoader((tag, url) => {
  loaded.push([tag, url]);
  return Promise.resolve(url);
});

(async () => {
  await Promise.all([loader("psv"), loader("psv"), loader("psv")]);
  assert.deepEqual(loaded, [
    ["link", "./vendor/psv.css"],
    ["script", "./vendor/psv.bundle.js"]
  ], "Concurrent startup requests share the same in-flight PSV CSS and bundle loads");
  await loader("psv");
  assert.equal(loaded.length, 2, "A successful engine load is reused");

  await loader("legacy");
  assert.deepEqual(loaded.slice(2), [
    ["script", "./vendor/three.min.js"],
    ["script", "./viewer/legacy-viewer.js"]
  ], "Legacy Three dependency finishes before its adapter is appended");

  let attempts = 0;
  const retryLoader = createLoader((tag, url) => {
    attempts += 1;
    return url.endsWith("psv.bundle.js") && attempts <= 2
      ? Promise.reject(new Error("temporary load failure"))
      : Promise.resolve(url);
  });
  await assert.rejects(retryLoader("psv"), /temporary load failure/);
  await retryLoader("psv");
  assert.equal(attempts, 4, "A failed engine load clears its cache so a later attempt can retry both assets");

  assert(!/<script[^>]+src="\.\/(?:vendor\/(?:psv\.bundle\.js|three\.min\.js)|viewer\/legacy-viewer\.js)"/.test(html));
  assert(app.includes("Promise.all([loadAppInfo(connectionId), loadGallery(true)])"), "Startup fetches config and gallery metadata in parallel");
  assert(app.includes("switchId !== state.engineSwitchId") && app.includes("state.viewerController !== requestedController"), "Stale engine and panorama operations are guarded");
  const configLoader = extractFunction(app, "async function loadAppInfo(connectionId)");
  const applyConfigIndex = configLoader.indexOf("await applyViewerEngine(response.viewer, connectionId)");
  assert(applyConfigIndex >= 0 && configLoader.indexOf("if (connectionId !== state.connectionId) return;", applyConfigIndex) > applyConfigIndex, "A backend change during engine startup prevents stale config from updating the new connection");
  const engineSwitcher = extractFunction(app, "async function switchViewerEngine(engine, connectionId)");
  assert(engineSwitcher.indexOf("await ensureViewerEngineAssets(engine)") < engineSwitcher.indexOf("var item = state.currentIndex >= 0 ? state.items[state.currentIndex]"), "Engine switching captures the latest scene after slow asset loading");
  const sceneSelector = extractFunction(app, "async function selectScene(index)");
  assert(sceneSelector.indexOf("state.currentIndex = index") < sceneSelector.indexOf("await requestedController.setPanorama(imageUrl)"), "Scene selection records the newest choice before asynchronous image resolution");
  assert(sceneSelector.includes("requestId !== state.requestId || state.viewerController !== requestedController"), "Old scene loads cannot replace a newer selection or viewer instance");

  const connectBackend = extractFunction(app, "async function connectBackend(options)");
  const invalidConnectionState = { apiBase: "https://current.example" };
  let rejectedConnectionStatus = "";
  let rejectedConnectionFocused = false;
  const connectionContext = {
    state: { ...invalidConnectionState, settingsReady: true },
    refs: {
      connectBtn: { disabled: false },
      apiBaseInput: { value: "http://public.example", focus() { rejectedConnectionFocused = true; } },
      settingsStatus: { set textContent(value) { rejectedConnectionStatus = value; } }
    },
    window: { XinTI18n: {
      isSecureServiceUrl(value) { try { const url = new URL(value); return !url.username && !url.password && (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))); } catch { return false; } },
      t(key) { return key; }
    } }
  };
  await vm.runInNewContext("(" + connectBackend + ")", connectionContext)();
  assert.equal(invalidConnectionState.apiBase, "https://current.example", "An insecure HTTP backend does not replace the active service");
  assert.equal(rejectedConnectionStatus, "error.secureServiceUrl", "Console shows the secure-service guidance");
  assert.equal(rejectedConnectionFocused, true, "Console returns focus to the invalid address field");

  let psvLoadResolve;
  const initialized = [];
  const engineContext = {
    state: {
      connectionId: 8,
      engineSwitchId: 0,
      viewerController: null,
      viewerEngine: "psv",
      viewerConfigReady: false,
      items: [],
      currentIndex: -1
    },
    ensureViewerEngineAssets(engine) {
      return engine === "psv" ? new Promise((resolve) => { psvLoadResolve = resolve; }) : Promise.resolve();
    },
    initViewer(engine) {
      initialized.push(engine);
      engineContext.state.viewerController = { engine };
      return true;
    },
    setViewerState() {},
    selectScene() {}
  };
  engineContext.ensureViewerInitialized = vm.runInNewContext("(" + extractFunction(app, "async function ensureViewerInitialized(engine, connectionId)") + ")", engineContext);
  const olderPsvStart = engineContext.ensureViewerInitialized("psv", 8);
  const latestLegacyStart = engineContext.ensureViewerInitialized("legacy", 8);
  await latestLegacyStart;
  psvLoadResolve();
  await olderPsvStart;
  assert.deepEqual(initialized, ["legacy"], "A slower earlier engine load cannot replace the latest requested engine");

  let staleConfigResolve;
  let staleConfigApplied = false;
  const configContext = {
    state: { connectionId: 10, appInfo: { name: "Current", version: "new", repositoryUrl: "current" } },
    fetchJson: () => new Promise((resolve) => { staleConfigResolve = resolve; }),
    renderAppInfo() { staleConfigApplied = true; }
  };
  configContext.loadAppInfo = vm.runInNewContext("(" + configLoader + ")", configContext);
  const previousConnectionLoad = configContext.loadAppInfo(10);
  configContext.state.connectionId = 11;
  staleConfigResolve({ app: { name: "Old backend", version: "old", repositoryUrl: "old" } });
  await previousConnectionLoad;
  assert.equal(configContext.state.appInfo.name, "Current", "A slow config response from a previous backend cannot replace current app metadata");
  assert.equal(staleConfigApplied, false, "A stale backend response does not render old metadata");

  let retryAssetsResolve;
  const retrySelections = [];
  const retryContext = {
    state: { connectionId: 12, pendingViewerEngine: "psv", viewerEngine: "psv", viewerController: null, currentIndex: 0, items: [{ id: 1 }, { id: 2 }] },
    ensureViewerInitialized: () => new Promise((resolve) => { retryAssetsResolve = resolve; }),
    switchViewerEngine() {},
    selectScene(index) { retrySelections.push(index); }
  };
  retryContext.retryViewerEngine = vm.runInNewContext("(" + extractFunction(app, "async function retryViewerEngine()") + ")", retryContext);
  const retryOperation = retryContext.retryViewerEngine();
  retryContext.state.currentIndex = 1;
  retryAssetsResolve(true);
  await retryOperation;
  assert.deepEqual(retrySelections, [1], "Retry loads the latest selected panorama after engine assets finish loading");

  const failedAssets = [];
  const assetContext = {
    document: {
      createElement(tag) {
        return { tag, parentNode: null, setAttribute() {} };
      },
      head: {
        appendChild(asset) { asset.parentNode = this; failedAssets.push(asset); },
        removeChild(asset) { asset.parentNode = null; asset.removed = true; }
      }
    }
  };
  const loadAsset = vm.runInNewContext("(" + extractFunction(app, "function loadViewerAsset(tag, path)") + ")", assetContext);
  const failedAssetPromise = loadAsset("link", "./vendor/psv.css");
  failedAssets[0].onerror();
  await assert.rejects(failedAssetPromise, /无法加载查看器资源/);
  assert.equal(failedAssets[0].removed, true, "Failed stylesheet elements are removed so retries do not accumulate stale links");
  assert(html.indexOf("./panorama-viewer.js") < html.indexOf("./app.js"), "The viewer facade loads before app startup");
  console.log("Console engine startup tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
