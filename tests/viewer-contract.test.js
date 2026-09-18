const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "frontend", "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "frontend", "app.js"), "utf8");
const adapterSource = fs.readFileSync(path.join(root, "frontend", "panorama-viewer.js"), "utf8");
const legacySource = fs.readFileSync(path.join(root, "frontend", "viewer", "legacy-viewer.js"), "utf8");
const css = fs.readFileSync(path.join(root, "frontend", "styles.css"), "utf8");
const widget = fs.readFileSync(path.join(root, "backend", "public", "widget.html"), "utf8");
const backend = fs.readFileSync(path.join(root, "backend", "index.js"), "utf8");
const buildScript = fs.readFileSync(path.join(root, "scripts", "viewer-assets.js"), "utf8");
const demoSvg = fs.readFileSync(path.join(root, "backend", "public", "demo-panorama.svg"), "utf8");

const htmlIds = Array.from(html.matchAll(/\sid="([^"]+)"/g), (match) => match[1]);
assert.deepEqual(htmlIds.filter((id, index) => htmlIds.indexOf(id) !== index), [], "Viewer page must not contain duplicate DOM ids");
const referencedIds = Array.from(app.matchAll(/document\.getElementById\("([^"]+)"\)/g), (match) => match[1]);
assert.deepEqual(referencedIds.filter((id) => !htmlIds.includes(id)), [], "Every app DOM reference must exist in index.html");

["hotspotLayer", "viewerState", "viewerStateAction", "directorBtn", "autorotateBtn", "fullscreenBtn", "customizeToolbarBtn", "resolutionText"].forEach((id) => {
  assert(htmlIds.includes(id), `Missing retained viewer control: ${id}`);
});
assert(!["compass", "sceneRail", "yawText", "pitchText", "fovText", "bearingText"].some((id) => htmlIds.includes(id)), "Viewer HUD and floating scene rail must be removed from the DOM");
assert(!/compare|projection-switcher|mode-button|viewer-vignette|viewer-grid/i.test(html + css + app), "Removed compare and projection controls must not remain in the console");
assert(!/compare|mode-button|modebar/i.test(widget), "Widget must not retain removed projection or comparison controls");
assert(app.includes("requestedController.setPanorama(imageUrl)"), "Console scene loading must use the captured controller so async URL resolution cannot target a replacement engine");
assert(app.includes("connectionId !== state.connectionId || requestId !== state.requestId"), "Console loads must be scoped to active connection and request");
assert(app.includes("scene.id === state.currentSceneId && scene.panoramaId === currentItem.id"), "Project scene navigation must retain scene identity");
assert(widget.includes("var controller = state.viewerController") && widget.includes("controller.setPanorama(resolveItemViewerUrl(item, apiBase))"), "Widget must load resolved source URLs through the captured adapter instance");
assert(widget.includes('params.get("autorotate") === "1"'), "Widget autorotation must require explicit autorotate=1");
assert(html.includes("./vendor/psv.bundle.js") && html.includes("./vendor/psv.css"), "Console must load local PSV runtime and CSS");
assert(widget.includes("/assets/psv.bundle.js") && widget.includes("/assets/psv.css"), "Widget must load the same local PSV runtime and CSS");
assert(html.includes("./viewer/legacy-viewer.js") && html.includes("./vendor/three.min.js"), "Console must include the local compatibility renderer");
assert(widget.includes("/assets/legacy-viewer.js") && widget.includes("/assets/three.min.js"), "Widget must include the local compatibility renderer");
assert(adapterSource.includes('options.engine || "psv"') && adapterSource.includes('=== "legacy"'), "Facade must select one configured engine per instance");
assert(legacySource.includes("new THREE.SphereGeometry(500, 72, 48)") && legacySource.includes("geometry.scale(-1, 1, 1)"), "Compatibility renderer must use the original inward-facing sphere geometry");
assert(!/createProjectionMaterial|createCrystalStage|CanvasTexture\(.*placeholder/i.test(legacySource), "Compatibility renderer must remain a single standard sphere");
assert(!/setTimeout|setInterval/.test(legacySource) && legacySource.includes("director: false"), "Legacy engine must disable automatic demo capabilities and timers");
assert(css.includes(".viewer-panel.is-legacy #zoomInBtn") && css.includes("display: grid !important"), "Legacy console must force only zoom buttons visible despite toolbar preferences");
assert(/\.viewer-panel\.is-legacy #fullscreenBtn\s*\{\s*display:\s*none !important/.test(css), "Legacy console must hide fullscreen so only zoom controls remain");
assert(css.includes("border-radius: 8px") && css.includes("background: #111"), "Viewer canvas must use neutral dark surfaces and conventional corners");
assert(!/viewer-signature|viewer-help|viewer-resolution|viewer-topline|scene-rail|spatial-compass|viewer-telemetry/.test(html + css), "Viewer HUD overlays and floating scene rail must not be shipped");
assert(html.includes('id="fullscreenBtn" class="viewer-action"') && html.includes('id="customizeToolbarBtn" class="viewer-action viewer-more-button"'), "Fullscreen and more tools must live in the accessible viewer toolbar");
assert(html.includes('class="viewer-toolbar" role="toolbar"') && html.includes('aria-label="全景查看工具"'), "Console controls must expose a labeled toolbar landmark");
assert(html.includes('data-embed-preset="all"') && html.includes('data-embed-preset="compact"') && html.includes('data-embed-preset="none"'), "Embed console must expose only its three named control presets");
assert(!html.includes("embedControlsInput") && !html.includes("embedHiddenControlsInput"), "Embed console must not expose hand-edited control tokens");
assert(app.includes('state.viewerEngine === "legacy" && ["r", "d", " "]'), "Legacy keyboard shortcuts must not invoke hidden reset or demo controls");
assert(widget.includes(".viewer-shell.is-legacy #zoomOutBtn") && widget.includes("statusIsFeedback"), "Legacy widget must show zoom controls and retain loading/error feedback");
assert(!/viewer-top|brand-signature|panoramaNoText|resolutionText/.test(widget), "Widget must not display brand, number, or resolution HUD");
assert(widget.includes('aria-label="全景查看工具"') && widget.includes('aria-live="polite"'), "Widget must expose a labeled icon toolbar and accessible feedback");
assert.match(app, /function renderSceneRail\(\)\s*\{\s*\/\/ Scene navigation stays in the library and project panels\./, "App must not create a hidden floating scene rail or thumbnails");
assert.match(demoSvg, /<svg\b[^>]*\bwidth="4096"[^>]*\bheight="2048"/, "Built-in SVG panorama needs explicit intrinsic dimensions for PSV image decoding");
assert(backend.includes("/assets/psv.bundle.js") && backend.includes("/assets/psv.css"), "Backend must serve the local PSV bundle and stylesheet");
assert(fs.statSync(path.join(root, "frontend", "vendor", "psv.bundle.js")).size > 100000, "Built PSV bundle must exist in the deliverable tree");
assert(fs.existsSync(path.join(root, "frontend", "vendor", "PSV-LICENSE")) && fs.existsSync(path.join(root, "frontend", "vendor", "THREE-LICENSE")), "Third party licenses must be copied into the vendor tree");
assert(buildScript.includes("@photo-sphere-viewer") && buildScript.includes("index.css"), "Vendor build must bundle PSV and copy its CSS");

const context = { window: {} };
vm.runInNewContext(adapterSource, context, { filename: "panorama-viewer.js" });
const viewer = context.window.XinTPanoramaViewer;
assert(viewer, "Viewer facade must be exported");
["setPanorama", "getView", "setView", "zoomBy", "resetView", "setAutorotate", "toggleAutorotate", "playDirector", "stopDirector", "project", "getEngine", "dispose"].forEach((name) => {
  assert.match(adapterSource, new RegExp(`\\b${name}\\s*:`), `PSV facade is missing ${name}`);
});
assert.deepEqual(Array.from(viewer.modes, (mode) => mode.key), ["expand"]);
assert.equal(viewer.normalizeMode("little-planet"), "expand");
assert.equal(viewer.normalizeMode("crystal-ball"), "expand");
assert.equal(viewer.normalizeMode("unknown-mode"), "expand");
for (const yaw of [-720, -361, -90, 0, 90, 180, 359, 721]) {
  const psvYaw = viewer.viewMapping.oldYawToPsvYaw(yaw);
  assert(Math.abs(viewer.viewMapping.psvYawToOldYaw(psvYaw) - ((yaw % 360 + 360) % 360)) < 1e-9, `Yaw mapping round-trip failed for ${yaw}`);
}
for (const fov of [30, 36, 75, 90, 105]) {
  const zoom = viewer.viewMapping.fovToZoom(fov);
  assert(Math.abs(viewer.viewMapping.zoomToFov(zoom) - fov) < 1e-9, `Vertical FOV mapping round-trip failed for ${fov}`);
}
assert.equal(viewer.viewMapping.oldYawToPsvYaw(0), Math.PI);
assert.equal(viewer.viewMapping.oldYawToPsvYaw(180), 0);

console.log("Viewer contract tests passed");
