const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const embedSource = fs.readFileSync(path.join(root, "backend", "public", "embed.js"), "utf8");
const widgetHtml = fs.readFileSync(path.join(root, "backend", "public", "widget.html"), "utf8");

const controlKeys = [
  "status",
  "previous",
  "next",
  "autorotate",
  "zoom-in",
  "zoom-out",
  "focus",
  "director",
  "reset",
  "fullscreen"
];

controlKeys.forEach((key) => {
  assert(embedSource.includes(`${JSON.stringify(key)}: true`) || embedSource.includes(`${key}: true`));
  assert(widgetHtml.includes(`data-control="${key}"`), `Widget control is missing ${key}`);
});

["brand", "panorama-no", "resolution"].forEach((removedHudToken) => {
  assert(embedSource.includes(`${JSON.stringify(removedHudToken)}: true`) || embedSource.includes(`${removedHudToken}: true`), `Legacy embed token ${removedHudToken} must remain accepted`);
  assert(!widgetHtml.includes(`data-control="${removedHudToken}"`), `Removed HUD token ${removedHudToken} must not render a widget control`);
});

["all", "compact", "default", "none"].forEach((special) => {
  assert(embedSource.includes(`${special}: true`), `Embed whitelist is missing ${special}`);
  assert(widgetHtml.includes(`token === "${special}"`), `Widget parser is missing ${special}`);
});

assert(embedSource.includes("data-controls"));
assert(embedSource.includes("data-hide-controls"));
assert(widgetHtml.includes('params.get("controls")'));
assert(widgetHtml.includes('params.get("hideControls")'));
assert(!embedSource.includes('"mode-planet": true'));
assert(!widgetHtml.includes('data-control="mode-planet"'));

const attributes = {
  "data-api": "http://127.0.0.1:7310",
  "data-target": "target",
  "data-controls": "brand,zoom-in,unknown,<script>,ALL",
  "data-hide-controls": "resolution,unknown"
};
const container = {
  clientWidth: 800,
  innerHTML: "",
  child: null,
  appendChild(node) {
    this.child = node;
  }
};
const script = {
  src: "http://127.0.0.1:7310/embed.js",
  parentNode: { insertBefore() {} },
  nextSibling: null,
  getAttribute(name) {
    return attributes[name] || null;
  }
};
const document = {
  currentScript: script,
  getElementById(id) {
    return id === "target" ? container : null;
  },
  createElement(tagName) {
    assert.equal(tagName, "iframe");
    return { style: {} };
  }
};

vm.runInNewContext(embedSource, {
  document,
  window: { addEventListener() {} },
  ResizeObserver: undefined,
  encodeURIComponent
});

assert(container.child, "Embed script must create an iframe");
const iframeUrl = new URL(container.child.src);
assert.equal(iframeUrl.searchParams.get("controls"), "brand,zoom-in,all");
assert.equal(iframeUrl.searchParams.get("hideControls"), "resolution");
assert(!container.child.src.includes("script"), "Unknown control tokens must not reach the widget URL");

function createWidgetElement(document) {
  const attributes = new Map();
  const handlers = new Map();
  const use = createUseElement();
  const element = {
    hidden: false,
    title: "",
    textContent: "",
    style: {},
    offsetWidth: 240,
    offsetHeight: 112,
    parentNode: null,
    classList: { toggle() {} },
    addEventListener(name, listener) { handlers.set(name, listener); },
    dispatch(name, event) { return handlers.get(name)?.(event); },
    click() { return handlers.get("click")?.(); },
    getAttribute(name) { return attributes.get(name) || null; },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    querySelector(selector) { return selector === "use" ? use : null; },
    querySelectorAll() { return []; },
    contains(target) {
      while (target) {
        if (target === element) return true;
        target = target.parentNode;
      }
      return false;
    },
    focus() { document.activeElement = element; },
    blur() { if (document.activeElement === element) document.activeElement = null; }
  };
  return element;
}

function createUseElement() {
  const attributes = new Map();
  return {
    getAttribute(name) { return attributes.get(name) || null; },
    setAttribute(name, value) { attributes.set(name, String(value)); }
  };
}

async function runWidgetImageResolutionCase({ item, expectedUrl, query, engine = "psv", app = { name: "Test Panorama", version: "9.8.7", repositoryUrl: "https://example.test/project" } }) {
  const documentHandlers = new Map();
  const document = {
    activeElement: null,
    fullscreenElement: null,
    fullscreenEnabled: false,
    documentElement: {},
    createElement(tag) { return { tag }; },
    head: { appendChild(asset) {
      assets.push(asset.src || asset.href);
      queueMicrotask(asset.onload);
    } },
    getElementById(id) { return elements[id]; },
    querySelector(selector) { return selector === ".viewer-shell" ? viewerShell : selector === ".toolbar" ? toolbar : null; },
    querySelectorAll(selector) { return selector === "[data-control]" ? controls : []; },
    addEventListener(name, handler) { documentHandlers.set(name, handler); },
    dispatch(name, event) { return documentHandlers.get(name)?.(event); }
  };
  const ids = ["viewer", "statusText", "prevBtn", "nextBtn", "autorotateBtn", "zoomOutBtn", "zoomInBtn", "focusBtn", "directorBtn", "resetBtn", "fullscreenBtn", "systemContextMenu", "systemNameText", "systemVersionText", "githubRepoLink"];
  const elements = Object.fromEntries(ids.map((id) => [id, createWidgetElement(document)]));
  const toolbar = createWidgetElement(document);
  const viewerShell = createWidgetElement(document);
  elements.systemContextMenu.hidden = true;
  const controls = ["statusText", "prevBtn", "nextBtn", "autorotateBtn", "zoomOutBtn", "zoomInBtn", "focusBtn", "directorBtn", "resetBtn", "fullscreenBtn"].map((id) => elements[id]);
  ["status", "previous", "next", "autorotate", "zoom-out", "zoom-in", "focus", "director", "reset", "fullscreen"].forEach((name, index) => {
    controls[index].setAttribute("data-control", name);
  });
  toolbar.querySelectorAll = () => controls;
  elements.githubRepoLink.parentNode = elements.systemContextMenu;
  elements.githubRepoLink.href = "https://github.com/XinTycd/XinT-Panorama-System";
  const initialFocus = createWidgetElement(document);
  document.activeElement = initialFocus;
  const calls = [];
  const requests = [];
  const assets = [];
  let playing = false;
  const windowHandlers = new Map();
  const widgetScript = widgetHtml.match(/<script>\s*([\s\S]*?)\s*<\/script>/g).at(-1).replace(/^<script>\s*|\s*<\/script>$/g, "");
  vm.runInNewContext(widgetScript, {
    URLSearchParams,
    location: { search: query, origin: "https://panorama.example" },
    document,
    window: { innerWidth: 800, innerHeight: 600, addEventListener(name, handler) { windowHandlers.set(name, handler); } },
    fetch(url) {
      requests.push(url);
      if (url.endsWith("/api/config")) return Promise.resolve({ ok: true, json: async () => {
        assert(requests.some((url) => url.includes("/api/panoramas/by-no")), "Image metadata starts without waiting for config");
        return { app, viewer: { engine } };
      } });
      if (url.includes("/api/panoramas/by-no")) return Promise.resolve({ ok: true, json: async () => ({ item }) });
      throw new Error(`Unexpected widget request: ${url}`);
    },
    XinTPanoramaViewer: {
      create(options) {
        assert.equal(options.engine, engine);
        return {
          getMaxTextureSize() { return 4096; },
          getAutorotate() { return false; },
          getView() { return { fov: 75 }; },
          isDirectorPlaying() { return playing; },
          playDirector() { playing = true; return true; },
          stopDirector() { playing = false; },
          setAutorotate() {},
          setPanorama(url) { calls.push(url); return Promise.resolve({}); },
          clear() {},
          dispose() {}
        };
      }
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(calls, [expectedUrl]);
  assert.deepEqual(assets, engine === "legacy"
    ? ["/assets/three.min.js", "/assets/legacy-viewer.js"]
    : ["/assets/psv.css", "/assets/psv.bundle.js"]);
  assert.equal(elements.systemNameText.textContent, app && app.name || "芯添全景系统");
  assert.equal(elements.systemVersionText.textContent, app && app.version ? "版本 v" + app.version.replace(/^v/i, "") : "版本待获取");
  assert.equal(elements.githubRepoLink.href, app && app.repositoryUrl || "https://github.com/XinTycd/XinT-Panorama-System");

  if (query.includes("controls=none")) assert.equal(toolbar.hidden, true, "none preset hides the toolbar without disabling context menus");
  if (query.includes("controls=compact")) {
    assert.deepEqual(controls.filter((control) => !control.hidden).map((control) => control.getAttribute("data-control")),
      ["autorotate", "zoom-out", "zoom-in", "fullscreen"]);
  }
  const canvasTarget = { parentNode: viewerShell, closest() { return null; } };
  let prevented = false;
  viewerShell.dispatch("contextmenu", { target: canvasTarget, clientX: 795, clientY: 595, preventDefault() { prevented = true; } });
  assert.equal(prevented, true, "right-click in the viewer prevents the browser context menu");
  assert.equal(elements.systemContextMenu.hidden, false, "right-click opens the system menu in the frame");
  assert.equal(elements.githubRepoLink.focused, undefined);
  assert.equal(elements.systemContextMenu.style.left, "548px", "menu is clamped to the frame's right edge");
  assert.equal(elements.systemContextMenu.style.top, "476px", "menu is clamped to the frame's bottom edge");
  assert.equal(document.activeElement, elements.githubRepoLink, "the repository link is keyboard reachable");
  document.dispatch("keydown", { key: "Escape", preventDefault() {} });
  assert.equal(elements.systemContextMenu.hidden, true, "Escape closes the menu");
  assert.equal(document.activeElement, initialFocus, "Escape restores the previous focus");

  viewerShell.dispatch("contextmenu", { target: canvasTarget, clientX: 20, clientY: 20, preventDefault() {} });
  document.dispatch("click", { target: createWidgetElement(document) });
  assert.equal(elements.systemContextMenu.hidden, true, "an outside click closes the menu");

  prevented = false;
  const inputTarget = { parentNode: viewerShell, closest(selector) { return selector.includes("input") ? this : null; } };
  viewerShell.dispatch("contextmenu", { target: inputTarget, clientX: 30, clientY: 30, preventDefault() { prevented = true; } });
  assert.equal(prevented, false, "editable targets keep the browser context menu");
  assert.equal(elements.systemContextMenu.hidden, true);

  viewerShell.dispatch("contextmenu", { target: canvasTarget, clientX: 20, clientY: 20, preventDefault() {} });
  document.dispatch("scroll", { target: elements.githubRepoLink });
  assert.equal(elements.systemContextMenu.hidden, false, "scrolling inside a small menu does not close it");
  document.dispatch("scroll", { target: createWidgetElement(document) });
  assert.equal(elements.systemContextMenu.hidden, true, "scroll closes the menu");
  viewerShell.dispatch("contextmenu", { target: canvasTarget, clientX: 20, clientY: 20, preventDefault() {} });
  windowHandlers.get("resize")();
  assert.equal(elements.systemContextMenu.hidden, true, "resize closes the menu");
  viewerShell.dispatch("contextmenu", { target: canvasTarget, clientX: 20, clientY: 20, preventDefault() {} });
  windowHandlers.get("blur")();
  assert.equal(elements.systemContextMenu.hidden, true, "leaving the frame closes the menu");

  if (engine === "psv") {
    elements.directorBtn.click();
    assert.equal(elements.directorBtn.querySelector("use").getAttribute("href"), "/assets/icons.svg#pause");
    assert.equal(elements.directorBtn.getAttribute("aria-pressed"), "true");
    elements.directorBtn.click();
    assert.equal(elements.directorBtn.querySelector("use").getAttribute("href"), "/assets/icons.svg#play");
    document.fullscreenElement = viewerShell;
    documentHandlers.get("fullscreenchange")();
    assert.equal(elements.fullscreenBtn.querySelector("use").getAttribute("href"), "/assets/icons.svg#exit-fullscreen");
    document.fullscreenElement = null;
    documentHandlers.get("fullscreenchange")();
    assert.equal(elements.fullscreenBtn.querySelector("use").getAttribute("href"), "/assets/icons.svg#fullscreen");
  }
}

(async () => {
  await runWidgetImageResolutionCase({
    item: { name: "Local", viewerPath: "/media/panorama.jpg", viewerUrl: "http://internal:7210/media/panorama.jpg" },
    expectedUrl: "https://panorama.example/media/panorama.jpg",
    query: "?api=https%3A%2F%2Fpanorama.example&panoramaNo=1&controls=none"
  });
  await runWidgetImageResolutionCase({
    item: { name: "Remote", viewerPath: "https://cdn.example/panorama.jpg", viewerUrl: "http://internal/old.jpg" },
    expectedUrl: "https://cdn.example/panorama.jpg",
    query: "?panoramaNo=1",
    engine: "legacy"
  });
  await runWidgetImageResolutionCase({
    item: { name: "Legacy response", viewerUrl: "http://legacy.example/panorama.jpg" },
    expectedUrl: "http://legacy.example/panorama.jpg",
    query: "?panoramaNo=1&controls=compact",
    app: null
  });
  console.log("Embed control and widget URL resolution tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
