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
const tick = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

class FakeElement {
  constructor() { this.dataset = {}; this.listeners = {}; this.children = []; this.attributes = {}; this.clientWidth = 1200; this.clientHeight = 700; }
  replaceChildren() { this.children = []; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter((item) => item !== fn); }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key] ?? null; }
  dispatch(type, event = {}) { for (const fn of [...(this.listeners[type] || [])]) fn(Object.assign({ type, target: this, preventDefault() {}, stopPropagation() {} }, event)); }
  closest() { return null; }
}

const document = {
  hidden: false,
  listeners: {},
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter((item) => item !== fn); },
  dispatch(type, event = {}) { for (const fn of [...(this.listeners[type] || [])]) fn(Object.assign({ type }, event)); }
};
const windowListeners = {};
const rafs = new Map();
const timers = new Map();
const revokedUrls = [];
let timerId = 0;
let rafId = 0;
let imageId = 0;
const images = [];
const mediaQueries = [];
const fakeURL = {
  createObjectURL() { return "blob:fake-" + (++imageId); },
  revokeObjectURL(url) { revokedUrls.push(url); }
};
class FakeImage {
  constructor() { this.onload = null; this.onerror = null; this.onabort = null; this._src = ""; images.push(this); }
  set src(value) { this._src = value; }
  get src() { return this._src; }
  succeed() { if (this.onload) this.onload(); }
  fail() { if (this.onerror) this.onerror(new Error("decode failure")); }
}

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
    this.animations = [];
    this.contextLosses = 0;
    this.pixelRatio = 1;
    const renderer = {
      domElement: new FakeElement(),
      capabilities: { maxTextureSize: 8192 },
      forceContextLoss: () => { this.contextLosses += 1; },
      getPixelRatio: () => this.pixelRatio,
      setPixelRatio: (ratio) => { this.pixelRatio = ratio; this.calls.push(["setPixelRatio", ratio]); }
    };
    this.renderer = { renderer };
    this.state = { textureData: null };
    this.textureLoader = { blobToImage: async (blob) => blob };
    this.dataHelper = {
      sphericalCoordsToViewerCoords: (position) => ({ x: Math.round(position.yaw * 10), y: Math.round(position.pitch * 10) }),
      isPointVisible: () => true
    };
    FakeViewer.instances.push(this);
  }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter((item) => item !== fn); }
  emit(type, event = {}) { for (const fn of [...(this.listeners[type] || [])]) fn(Object.assign({ type }, event)); }
  getPosition() { return { ...this.position }; }
  getZoomLevel() { return this.zoomLevel; }
  setPanorama(url) {
    const request = { url, ...deferred() };
    this.requests.push(request);
    return request.promise.then((loaded) => {
      if (loaded !== false) this.state.textureData = { panoData: { fullWidth: url === "one" ? 2048 : 4096, fullHeight: 1024 } };
      return loaded;
    });
  }
  rotate(position) { this.position = { ...position }; this.emit("position-updated"); }
  zoom(level) { this.zoomLevel = level; this.emit("zoom-updated"); }
  animate(options) {
    const animation = { options, ...deferred() };
    this.animations.push(animation);
    this.calls.push(["animate", options]);
    this.position = { yaw: options.yaw, pitch: options.pitch };
    this.zoomLevel = options.zoom;
    return animation.promise;
  }
  stopAnimation() { this.calls.push(["stopAnimation"]); }
  stopAll() { this.calls.push(["stopAll"]); }
  autoSize() { this.calls.push(["autoSize"]); }
  needsUpdate() { this.calls.push(["needsUpdate"]); }
  destroy() { this.destroyed = true; }
}

const window = {
  XinTPSV: { Viewer: FakeViewer, createGenerationGuardedAdapter: () => class {} },
  document,
  matchMedia: () => {
    const query = { matches: false, listeners: [], addEventListener(type, fn) { this.listeners.push(fn); }, removeEventListener(type, fn) { this.listeners = this.listeners.filter((item) => item !== fn); }, dispatch(matches) { this.matches = matches; this.listeners.forEach((fn) => fn({ matches })); } };
    mediaQueries.push(query);
    return query;
  },
  Blob,
  Image: FakeImage,
  URL: fakeURL,
  devicePixelRatio: 3,
  addEventListener(type, fn) { (windowListeners[type] ||= []).push(fn); },
  removeEventListener(type, fn) { windowListeners[type] = (windowListeners[type] || []).filter((item) => item !== fn); },
  dispatch(type, event = {}) { for (const fn of [...(windowListeners[type] || [])]) fn(Object.assign({ type }, event)); },
  requestAnimationFrame(callback) { const id = ++rafId; rafs.set(id, callback); return id; },
  cancelAnimationFrame(id) { rafs.delete(id); },
  flushRaf() { const entries = [...rafs.entries()]; rafs.clear(); entries.forEach(([, callback]) => callback()); },
  setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
  clearTimeout(id) { timers.delete(id); }
};
vm.runInNewContext(source, { window }, { filename: "panorama-viewer.js" });
const api = window.XinTPanoramaViewer;

(async () => {
  const element = new FakeElement();
  const contextEvents = [];
  const viewEvents = [];
  const controller = api.create({ element, onContextState: (status) => contextEvents.push(status), onViewChange: (view) => viewEvents.push(view) });
  assert.equal(controller.getEngine(), "psv");
  assert.equal(element.dataset.viewerEngine, undefined, "The facade stays dormant until a panorama is loaded");
  assert.equal(controller.getMaxTextureSize(), 4096);
  assert.equal(FakeViewer.instances.length, 0);

  const first = controller.setPanorama("one");
  const instance = FakeViewer.instances[0];
  assert.equal(controller.setPanorama("one"), first, "Synchronous duplicate URL requests share one result");
  await tick();
  assert.equal(instance.requests.length, 1);
  instance.requests[0].resolve(true);
  const firstResult = await first;
  assert.equal(firstResult.originalWidth, 2048);
  assert.equal((await controller.setPanorama("one")).url, "one", "A successfully loaded current URL is reused");

  const svgBlob = new Blob(['<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>']);
  const svgPromise = instance.textureLoader.blobToImage(svgBlob);
  await tick();
  assert.equal(images.at(-1).src, "blob:fake-1");
  assert.equal(revokedUrls.length, 0);
  images.at(-1).succeed();
  assert.equal((await svgPromise).src, "blob:fake-1");
  assert.deepEqual(revokedUrls, ["blob:fake-1"], "Successful decode revokes its temporary URL");

  const badPromise = instance.textureLoader.blobToImage(new Blob(["bad image"]));
  await tick();
  const badImage = images.at(-1);
  badImage.fail();
  await assert.rejects(badPromise, /could not be decoded/);
  assert.equal(revokedUrls.at(-1), badImage.src, "Decode failure also revokes its URL");

  const sameTickA = controller.setPanorama("A");
  const sameTickB = controller.setPanorama("B");
  const sameTickA2 = controller.setPanorama("A");
  await tick();
  assert.deepEqual(instance.requests.slice(1).map((request) => request.url), ["A"], "Only the latest queued same-tick request starts a network load");
  assert.equal((await sameTickB).stale, true);
  instance.requests[1].resolve(true);
  assert.equal((await sameTickA).stale, true);
  assert.equal((await sameTickA2).url, "A");

  const oldLoad = controller.setPanorama("old");
  await tick();
  const newLoad = controller.setPanorama("new");
  await tick();
  instance.requests[3].resolve(true);
  assert.equal((await newLoad).url, "new");
  instance.requests[2].resolve(true);
  assert.equal((await oldLoad).stale, true, "Late completion is stale after a newer request");

  const failedLoad = controller.setPanorama("failed");
  await tick();
  instance.requests[4].reject(new Error("network error"));
  await assert.rejects(failedLoad, /network error/);
  const retry = controller.setPanorama("failed");
  await tick();
  instance.requests[5].resolve(true);
  assert.equal((await retry).url, "failed", "Failed requests can be retried");

  const interrupted = controller.setPanorama("interrupted");
  await tick();
  instance.requests[6].resolve(false);
  await tick();
  const retryTick = [...timers.entries()].find(([, timer]) => timer.delay === 0);
  assert(retryTick, "An aborted latest request schedules one next-task retry");
  timers.delete(retryTick[0]);
  retryTick[1].callback();
  await tick();
  instance.requests[7].resolve(false);
  await assert.rejects(interrupted, /request was interrupted/);
  assert.equal(instance.requests.filter((request) => request.url === "interrupted").length, 2, "Abort retry is bounded to one attempt");

  const decodePending = instance.textureLoader.blobToImage(new Blob(["decode pending"]));
  await tick();
  const pendingImage = images.at(-1);
  const pendingUrl = pendingImage.src;
  const decodeRejected = assert.rejects(decodePending, (error) => error.name === "AbortError");
  controller.clear();
  await decodeRejected;
  assert.equal(revokedUrls.at(-1), pendingUrl, "Clear aborts a pending decode and revokes the URL");

  const afterClear = controller.setPanorama("after-clear");
  await tick();
  const freshInstance = FakeViewer.instances.at(-1);
  freshInstance.requests[0].resolve(true);
  await afterClear;
  const motion = mediaQueries.at(-1);
  assert.equal(controller.setAutorotate(true), true);
  freshInstance.emit("before-render", { elapsed: 16 });
  freshInstance.emit("before-render", { elapsed: 1000 });
  assert(controller.getView().yaw !== 180, "Automatic rotation uses bounded elapsed time from before-render");
  const afterRotation = controller.getView().yaw;
  freshInstance.emit("before-render", { elapsed: 1000 });
  assert(Math.abs(controller.getView().yaw - afterRotation) < 1, "Long frame gaps are capped at 100 ms");
  motion.dispatch(true);
  assert.equal(controller.getAutorotate(), false, "Dynamic reduced-motion preference stops rotation");
  assert.equal(controller.playDirector([{ yaw: 0 }]), false, "Reduced motion disables director playback");
  motion.dispatch(false);

  assert.equal(controller.setAutorotate(true), true);
  const beforeSkip = controller.getView().yaw;
  freshInstance.emit("before-render", { elapsed: 100 });
  assert.equal(controller.getView().yaw, beforeSkip, "The first frame after enabling rotation does not jump");
  freshInstance.emit("before-render", { elapsed: 100 });
  assert.notEqual(controller.getView().yaw, beforeSkip);
  controller.setAutorotate(false);

  let prevented = false;
  freshInstance.renderer.renderer.domElement.dispatch("webglcontextlost", { preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.deepEqual(contextEvents, ["lost"]);
  freshInstance.renderer.renderer.domElement.dispatch("webglcontextrestored");
  assert.deepEqual(contextEvents, ["lost", "restored"]);

  const beforeKey = controller.getView().fov;
  element.dispatch("keydown", { key: "+" });
  assert(controller.getView().fov < beforeKey, "Plus key zooms in");
  const afterKey = controller.getView().fov;
  element.dispatch("keydown", { key: "+", ctrlKey: true });
  assert.equal(controller.getView().fov, afterKey, "Modified plus shortcuts are ignored");

  const notificationsBefore = viewEvents.length;
  controller.setView({ yaw: 10 });
  controller.setView({ yaw: 20 });
  controller.zoomBy(1);
  window.flushRaf();
  assert.equal(viewEvents.length, notificationsBefore + 1, "View updates coalesce into one animation-frame notification");

  const animationController = api.create({ element: new FakeElement() });
  const animationLoad = animationController.setPanorama("animation");
  await tick();
  const animationViewer = FakeViewer.instances.at(-1);
  animationViewer.requests[0].resolve(true);
  await animationLoad;
  animationController.playDirector([{ yaw: 10, duration: 100, hold: 0 }, { yaw: 20 }], { loop: true });
  animationViewer.animations[0].resolve(false);
  await tick();
  assert.equal(animationController.isDirectorPlaying(), false, "A cancelled animate result stops the director");
  assert.equal(timers.size, 0);

  const directorController = api.create({ element: new FakeElement() });
  const directorLoad = directorController.setPanorama("director");
  await tick();
  const directorViewer = FakeViewer.instances.at(-1);
  directorViewer.requests[0].resolve(true);
  await directorLoad;
  directorController.playDirector([{ yaw: 1, duration: 10, hold: 0 }, { yaw: 2 }], { loop: false });
  directorViewer.animations[0].resolve(true);
  await tick();
  const zeroHoldTimer = [...timers.entries()].at(-1);
  assert.equal(zeroHoldTimer[1].delay, 0, "A zero hold is honored");
  zeroHoldTimer[1].callback();
  assert.equal(directorViewer.animations.length, 2, "Next director frame starts only after animation completion and hold");
  directorViewer.renderer.renderer.domElement.dispatch("webglcontextlost", { preventDefault() {} });
  assert.equal(directorController.isDirectorPlaying(), false, "Context loss stops director playback");

  const disposeController = api.create({ element: new FakeElement() });
  const disposeLoad = disposeController.setPanorama("dispose-pending");
  await tick();
  const disposeViewer = FakeViewer.instances.at(-1);
  const decodeOnDispose = disposeViewer.textureLoader.blobToImage(new Blob(["pending"]));
  await tick();
  const disposeImage = images.at(-1);
  const disposeUrl = disposeImage.src;
  const decodeAbort = assert.rejects(decodeOnDispose, (error) => error.name === "AbortError");
  disposeController.dispose();
  await decodeAbort;
  assert.equal(revokedUrls.at(-1), disposeUrl);
  assert.equal((await disposeLoad).stale, true);
  const instanceCount = FakeViewer.instances.length;
  disposeController.resize();
  disposeController.clear();
  assert.equal(FakeViewer.instances.length, instanceCount, "Disposed public operations cannot create another viewer");

  const bfcacheElement = new FakeElement();
  const bfcacheController = api.create({ element: bfcacheElement });
  const bfcacheLoad = bfcacheController.setPanorama("bfcache");
  await tick();
  const bfcacheViewer = FakeViewer.instances.at(-1);
  bfcacheViewer.requests[0].resolve(true);
  await bfcacheLoad;
  const pixelRatioViewer = bfcacheViewer.renderer.renderer;
  assert(pixelRatioViewer.getPixelRatio() <= 2, "DPR is capped at 2");
  assert(pixelRatioViewer.getPixelRatio() ** 2 * 1200 * 700 <= 4000000, "Drawing buffer is capped at four million pixels");
  bfcacheElement.clientWidth = 4000;
  bfcacheElement.clientHeight = 2000;
  bfcacheViewer.emit("size-updated");
  assert(pixelRatioViewer.getPixelRatio() ** 2 * 4000 * 2000 <= 4000000.01, "A size change reapplies the four million pixel budget");
  assert.equal(bfcacheElement.clientWidth, 4000, "Backing-buffer scaling does not alter CSS dimensions");
  window.dispatch("pagehide", { persisted: true });
  assert.equal(bfcacheViewer.destroyed, false, "Persisted pagehide suspends without destroying the viewer");
  window.dispatch("pageshow", { persisted: true });
  assert.equal(bfcacheViewer.destroyed, false);
  window.dispatch("pagehide", { persisted: false });
  assert.equal(bfcacheViewer.destroyed, true, "A normal pagehide disposes the viewer");

  const esbuild = require("esbuild");
  const psvBundle = await esbuild.build({ entryPoints: [path.join(__dirname, "..", "frontend", "viewer", "psv-entry.js")], bundle: true, format: "iife", globalName: "XinTPSV", write: false, target: ["es2020"] });
  const psvContext = {
    console, Event, EventTarget, CustomEvent,
    window: { devicePixelRatio: 1, navigator: { userAgent: "", platform: "" }, addEventListener() {}, removeEventListener() {} },
    navigator: { userAgent: "", platform: "" },
    document: { createElement() { return { style: {}, getContext() { return {}; } }; }, documentElement: { style: {} } },
    setInterval() { return 1; }, clearInterval() {}, requestAnimationFrame() { return 1; }, cancelAnimationFrame() {}, URL, Blob, performance
  };
  vm.runInNewContext(psvBundle.outputFiles[0].text, psvContext);
  assert.equal(psvContext.XinTPSV.Cache.enabled, false, "Built PSV entry disables the global blob cache at initialization");
  assert(viewEvents.length > 0);
  console.log("Viewer adapter behavior tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
