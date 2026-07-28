const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const facadeSource = fs.readFileSync(path.join(root, "frontend", "panorama-viewer.js"), "utf8");
const legacySource = fs.readFileSync(path.join(root, "frontend", "viewer", "legacy-viewer.js"), "utf8");
assert(!/setTimeout|setInterval/.test(legacySource), "Legacy viewer must not schedule automatic or director playback timers");
let nextId = 0;
const frames = new Map();
const document = {
  hidden: false,
  activeElement: null,
  listeners: {},
  addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); },
  removeEventListener(type, callback) { this.listeners[type] = (this.listeners[type] || []).filter((entry) => entry !== callback); },
  createElement() { return { getContext: () => ({ drawImage() {} }) }; }
};
class Element {
  constructor() { this.dataset = {}; this.listeners = {}; this.clientWidth = 800; this.clientHeight = 400; this.children = []; this.attributes = {}; this.style = {}; }
  replaceChildren(...children) { this.children = children; }
  addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); }
  removeEventListener(type, callback) { this.listeners[type] = (this.listeners[type] || []).filter((entry) => entry !== callback); }
  setAttribute(name, value) { this.attributes[name] = value; }
  contains(node) { return node === this; }
  getBoundingClientRect() { return { width: this.clientWidth, height: this.clientHeight }; }
  setPointerCapture() {}
  focus() { document.activeElement = this; }
}
class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  project() { this.x /= 500; this.y /= 500; this.z = 0; return this; }
  dot(other) { return this.x * other.x + this.y * other.y + this.z * other.z; }
}
class Camera {
  constructor(fov) { this.fov = fov; this.aspect = 1; this.position = { set() {} }; this.up = { set() {} }; }
  lookAt(target) { this.target = target; }
  updateProjectionMatrix() {}
  getWorldDirection(target) { return target.set(0, 0, -1); }
}
class Renderer {
  constructor() { this.capabilities = { maxTextureSize: 4096 }; this.domElement = new Element(); }
  setSize() {}
  render() {}
  dispose() { this.disposed = true; }
  forceContextLoss() { this.lost = true; }
}
class TextureLoader {
  static instances = [];
  constructor() { this.requests = []; TextureLoader.instances.push(this); }
  setCrossOrigin(value) { this.crossOrigin = value; }
  load(url, loaded, progress, failed) { this.requests.push({ url, loaded, failed }); }
}
class SphereGeometry { constructor() { this.scaleArgs = null; } scale(...args) { this.scaleArgs = args; } dispose() { this.disposed = true; } }
class MeshBasicMaterial { constructor() { this.color = { set() {} }; } dispose() { this.disposed = true; } }
class Scene { add(value) { this.child = value; } }
class Mesh { constructor(geometry, material) { this.geometry = geometry; this.material = material; } }
const THREE = {
  Vector3, PerspectiveCamera: Camera, WebGLRenderer: Renderer, SphereGeometry, MeshBasicMaterial, Scene, Mesh, TextureLoader,
  CanvasTexture: class { constructor(image) { this.image = image; } dispose() {} }, SRGBColorSpace: "srgb",
  MathUtils: { degToRad: (degrees) => degrees * Math.PI / 180 }
};
let psvInstances = 0;
class NeverPSV { constructor() { psvInstances += 1; throw new Error("wrong engine instantiated"); } }
const window = {
  document, THREE, XinTPSV: { Viewer: NeverPSV }, Blob,
  matchMedia: () => ({ matches: false }), ResizeObserver: class { observe() {} disconnect() {} },
  requestAnimationFrame(callback) { const id = ++nextId; frames.set(id, callback); return id; },
  cancelAnimationFrame(id) { frames.delete(id); },
  addEventListener() {}, removeEventListener() {}
};
const context = { window, ResizeObserver: window.ResizeObserver, performance: { now: () => 0 } };
vm.runInNewContext(legacySource, context, { filename: "legacy-viewer.js" });
vm.runInNewContext(facadeSource, context, { filename: "panorama-viewer.js" });

(async () => {
  const element = new Element();
  const viewer = window.XinTPanoramaViewer.create({ element, engine: "legacy" });
  assert.equal(viewer.getEngine(), "legacy");
  assert.equal(viewer.getCapabilities().director, false);
  assert.equal(viewer.getCapabilities().autorotate, false);
  assert.equal(viewer.getAutorotate(), false);
  assert.equal(viewer.setAutorotate(true), false);
  assert.equal(viewer.playDirector([{ yaw: 0, duration: 1000 }]), false);
  assert.equal(element.dataset.viewerEngine, "legacy");
  assert.equal(psvInstances, 0, "Configured legacy mode must not construct PSV");
  assert.deepEqual(element.children[0] && element.children[0].constructor.name, "Element");
  const geometry = new SphereGeometry();
  assert.equal(geometry.scaleArgs, null);
  const first = viewer.setPanorama("old");
  const second = viewer.setPanorama("new");
  const oldLoader = TextureLoader.instances[0];
  const newLoader = TextureLoader.instances[1];
  let disposedOldTexture = false;
  newLoader.requests[0].loaded({ image: { width: 2048, height: 1024 }, dispose() {} });
  assert.equal((await second).originalWidth, 2048);
  oldLoader.requests[0].loaded({ image: { width: 1024, height: 512 }, dispose() { disposedOldTexture = true; } });
  assert.equal((await first).stale, true);
  assert.equal(disposedOldTexture, true);
  viewer.setView({ yaw: 721, pitch: 20, fov: 62 });
  const view = viewer.getView();
  assert.equal(view.yaw, 1);
  assert.equal(view.pitch, 20);
  assert.equal(view.fov, 62);
  assert.equal(view.mode, "expand");
  assert.equal(viewer.project(0, 0).visible, false, "Spherical points behind the view should be hidden");
  viewer.clear();
  assert.equal(viewer.getView().fov, 62);
  viewer.dispose();
  viewer.dispose();
  assert.equal(element.dataset.viewerEngine, "disposed");
  assert.equal(document.listeners.visibilitychange.length, 0);
  assert.equal(psvInstances, 0);
  console.log("Legacy viewer behavior tests passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
