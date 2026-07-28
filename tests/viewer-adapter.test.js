const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "frontend", "panorama-viewer.js"), "utf8");
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

class FakeElement {
  constructor() { this.dataset = {}; this.listeners = {}; this.children = []; this.attributes = {}; }
  replaceChildren() { this.children = []; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter((item) => item !== fn); }
  setAttribute(key, value) { this.attributes[key] = value; }
  dispatch(type, event = {}) { for (const fn of [...(this.listeners[type] || [])]) fn(Object.assign({ type, target: this, preventDefault() {}, stopPropagation() {} }, event)); }
  closest() { return null; }
}

const document = {
  hidden: false,
  listeners: {},
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter((item) => item !== fn); },
  dispatch(type) { for (const fn of [...(this.listeners[type] || [])]) fn({ type }); }
};
let timerId = 0;
const timers = new Map();
const intervals = new Map();
const clearedTimers = new Set();
const clearedIntervals = new Set();

class FakeViewer {
  static instances = [];
  constructor(config) {
    this.config = config;
    this.listeners = {};
    this.position = { yaw: config.defaultYaw, pitch: config.defaultPitch };
    this.zoomLevel = config.defaultZoomLvl;
    this.destroyed = false;
    this.calls = [];
    this.requests = [];
    this.contextLosses = 0;
    this.renderer = { renderer: { domElement: new FakeElement(), capabilities: { maxTextureSize: 8192 }, forceContextLoss: () => { this.contextLosses += 1; } } };
    this.state = { textureData: null };
    this.textureLoader = { blobToImage: async (blob) => { this.decodedBlob = blob; return blob; } };
    this.dataHelper = {
      sphericalCoordsToViewerCoords: (position) => ({ x: Math.round(position.yaw * 10), y: Math.round(position.pitch * 10) }),
      isPointVisible: () => true
    };
    FakeViewer.instances.push(this);
  }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  emit(type) { for (const fn of this.listeners[type] || []) fn({ type }); }
  getPosition() { return { ...this.position }; }
  getZoomLevel() { return this.zoomLevel; }
  getPanorama(path) { return path; }
  setPanorama(path) {
    const request = deferred();
    this.requests.push({ path, ...request });
    return request.promise.then((loaded) => {
      if (loaded !== false) this.state.textureData = { panoData: { fullWidth: path === "one" ? 2048 : 4096, fullHeight: 1024 } };
      return loaded;
    });
  }
  rotate(position) { this.position = { ...position }; this.emit("position-updated"); }
  zoom(level) { this.zoomLevel = level; this.emit("zoom-updated"); }
  animate(options) { this.calls.push(["animate", options]); this.position = { yaw: options.yaw, pitch: options.pitch }; this.zoomLevel = options.zoom; }
  stopAnimation() { this.calls.push(["stopAnimation"]); }
  autoSize() { this.calls.push(["autoSize"]); }
  needsUpdate() { this.calls.push(["needsUpdate"]); }
  destroy() { this.destroyed = true; }
}

const window = {
  XinTPSV: { Viewer: FakeViewer },
  document,
  matchMedia: () => ({ matches: false }),
  Blob,
  setInterval(callback) { const id = ++timerId; intervals.set(id, callback); return id; },
  clearInterval(id) { clearedIntervals.add(id); intervals.delete(id); },
  setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id; },
  clearTimeout(id) { clearedTimers.add(id); timers.delete(id); }
};
vm.runInNewContext(source, { window }, { filename: "panorama-viewer.js" });
const api = window.XinTPanoramaViewer;
const element = new FakeElement();
const contextEvents = [];
const viewEvents = [];
const controller = api.create({ element, onContextState: (status) => contextEvents.push(status), onViewChange: (view) => viewEvents.push(view) });
assert.equal(controller.getEngine(), "psv");
assert.equal(element.dataset.viewerEngine, undefined, "A dormant facade must not create a renderer before configuration and panorama loading");
assert.equal(controller.getMaxTextureSize(), 4096);
assert.equal(controller.getAutorotate(), false);
assert.equal(FakeViewer.instances.length, 0, "PSV must stay unconstructed until a panorama is requested");
assert.equal("setTexture" in controller, false);
assert.equal("setComparePanorama" in controller, false);
assert.equal("setCompareEnabled" in controller, false);

(async () => {
  const first = controller.setPanorama("one");
  assert.equal(FakeViewer.instances.length, 1, "The configured PSV renderer is created on the first real load");
  const instance = FakeViewer.instances[0];
  assert.equal(element.dataset.viewerEngine, "psv");
  assert.equal(controller.getMaxTextureSize(), 8192);
  const svgBlob = new Blob(['<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>']);
  await instance.textureLoader.blobToImage(svgBlob);
  assert.equal(instance.decodedBlob.type, "image/svg+xml", "Headerless streamed SVG blobs need a MIME type before PSV turns them into images");
  const otherBlob = new Blob(["not-svg"]);
  await instance.textureLoader.blobToImage(otherBlob);
  assert.equal(instance.decodedBlob, otherBlob, "The MIME workaround must pass non-SVG blobs through unchanged");
  assert.equal(instance.requests[0].path, "one", "PSV receives the URL directly");
  instance.requests[0].resolve(true);
  const firstResult = await first;
  assert.equal(firstResult.originalWidth, 2048);
  assert.equal(firstResult.originalHeight, 1024);

  const oldLoad = controller.setPanorama("old");
  const newLoad = controller.setPanorama("new");
  instance.requests[2].resolve(true);
  const newResult = await newLoad;
  assert.equal(newResult.url, "new");
  instance.requests[1].resolve(true);
  assert.equal((await oldLoad).stale, true, "A late response must not replace the newer URL");

  const failedLoad = controller.setPanorama("failed");
  instance.requests[3].reject(new Error("network error"));
  await assert.rejects(failedLoad, /network error/);
  const retried = controller.setPanorama("retry");
  instance.requests[4].resolve(true);
  assert.equal((await retried).url, "retry", "A failed load must be retryable");

  const aborted = controller.setPanorama("aborted");
  instance.requests[5].resolve(false);
  await assert.rejects(aborted, /aborted/);

  controller.setView({ yaw: 721, pitch: 16, fov: 61 });
  const view = controller.getView();
  assert.equal(view.yaw, 1);
  assert(Math.abs(view.pitch - 16) < 1e-9);
  assert(Math.abs(view.fov - 61) < 1e-9);
  const projected = controller.project(90, 10);
  assert.equal(projected.x, Math.round(api.viewMapping.oldYawToPsvYaw(90) * 10));
  assert.equal(projected.y, Math.round(10 * Math.PI / 180 * 10));
  assert.equal(projected.visible, true);

  assert.equal(controller.playDirector([{ yaw: 0, pitch: 0, fov: 75, duration: 900, hold: 100 }], { loop: true }), true);
  assert.equal(controller.isDirectorPlaying(), true);
  const timer = [...timers.keys()].at(-1);
  element.dispatch("pointerdown");
  assert.equal(controller.isDirectorPlaying(), false, "User interaction must stop director playback");
  assert(clearedTimers.has(timer), "Stopping director playback must clear its hold timer");
  assert.equal(controller.playDirector([{ yaw: 0, duration: 900 }], { loop: true }), true);
  const directorTimer = [...timers.keys()].at(-1);
  document.hidden = true;
  document.dispatch("visibilitychange");
  assert.equal(controller.isDirectorPlaying(), false, "Hidden pages stop director playback");
  assert(clearedTimers.has(directorTimer));
  document.hidden = false;
  document.dispatch("visibilitychange");

  const canvas = instance.renderer.renderer.domElement;
  let prevented = false;
  canvas.dispatch("webglcontextlost", { preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.deepEqual(contextEvents, ["lost"]);
  canvas.dispatch("webglcontextrestored");
  assert.deepEqual(contextEvents, ["lost", "restored"]);
  assert(instance.calls.some(([name]) => name === "needsUpdate"));

  const saved = controller.getView();
  controller.clear();
  assert.equal(instance.destroyed, true);
  assert.equal(instance.contextLosses, 1);
  assert.deepEqual(element.children, []);
  assert.equal(controller.getView().yaw, saved.yaw);
  const afterClear = controller.setPanorama("after-clear");
  assert.equal(FakeViewer.instances.length, 2, "clear creates a fresh PSV instance on demand");
  FakeViewer.instances[1].requests[0].resolve(true);
  await afterClear;
  const finalInstance = FakeViewer.instances[1];
  controller.dispose();
  assert.equal(finalInstance.destroyed, true);
  assert.equal(finalInstance.contextLosses, 1);
  assert.equal(element.dataset.viewerEngine, "disposed");
  assert.equal(document.listeners.visibilitychange.length, 0);
  await assert.rejects(controller.setPanorama("after-dispose"), /disposed/);
  assert.equal(FakeViewer.instances.length, 2, "disposed facades cannot recreate a renderer");
  assert(viewEvents.length > 0);
  console.log("Viewer adapter behavior tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
