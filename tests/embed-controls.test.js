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
assert(widgetHtml.includes('window.parent.location.origin === window.location.origin'), "The small widget control API is exposed only to a same-origin parent");
assert(widgetHtml.includes("setControlPreset: applyControlPreset"));
assert(!widgetHtml.includes("postMessage("), "Preset changes do not use cross-origin messaging");
assert(!embedSource.includes('"mode-planet": true'));
assert(!widgetHtml.includes('data-control="mode-planet"'));

const attributes = {
  "data-api": "http://127.0.0.1:7310",
  "data-target": "target",
  "data-controls": "brand,zoom-in,unknown,<script>,ALL",
  "data-hide-controls": "resolution,unknown",
  "data-lang": "en"
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
  encodeURIComponent,
  URL
});

assert(container.child, "Embed script must create an iframe");
const iframeUrl = new URL(container.child.src);
assert.equal(iframeUrl.searchParams.get("controls"), "brand,zoom-in,all");
assert.equal(iframeUrl.searchParams.get("hideControls"), "resolution");
assert.equal(iframeUrl.searchParams.get("lang"), "en", "embed.js forwards an explicitly supported language to the widget");
assert(!container.child.src.includes("script"), "Unknown control tokens must not reach the widget URL");

for (const unsafeApi of ["http://panorama.example", "http://localhost.evil", "https://user:pass@panorama.example"]) {
  const unsafeContainer = {
    child: null,
    textContent: "",
    setAttribute(name, value) { this[name] = value; },
    appendChild(node) { this.child = node; }
  };
  const unsafeScript = {
    src: "https://panorama.example/embed.js",
    parentNode: { insertBefore() {} },
    nextSibling: null,
    getAttribute(name) { return name === "data-api" ? unsafeApi : name === "data-target" ? "target" : null; }
  };
  const unsafeDocument = {
    currentScript: unsafeScript,
    getElementById() { return unsafeContainer; },
    createElement() { throw new Error("Insecure embed must not create an iframe"); }
  };
  vm.runInNewContext(embedSource, { document: unsafeDocument, window: { addEventListener() {} }, URL, encodeURIComponent });
  assert.equal(unsafeContainer.child, null, "embed.js rejects an unsafe API URL before creating an iframe");
  assert.match(unsafeContainer.textContent, /HTTPS/);
  assert.equal(unsafeContainer.role, "status");
}

function createWidgetElement(document) {
  const attributes = new Map();
  const handlers = new Map();
  const use = createUseElement();
  const element = {
    hidden: false,
    dataset: {},
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
    removeAttribute(name) { attributes.delete(name); },
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

async function runWidgetImageResolutionCase({ item, expectedUrl, query, engine = "psv", app = { name: "Test Panorama", version: "9.8.7", repositoryUrl: "https://example.test/project" }, expectInsecureService = false }) {
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
  const widgetWindow = {
    XinTI18n: null,
    innerWidth: 800,
    innerHeight: 600,
    location: { origin: "https://panorama.example" },
    parent: { location: { origin: "https://panorama.example" } },
    addEventListener(name, handler) { windowHandlers.set(name, handler); }
  };
  let currentLanguage = new URLSearchParams(query).get("lang") || "zh-CN";
  const i18n = {
    isSecureServiceUrl(value) {
      try {
        const url = new URL(value);
        if (url.username || url.password || url.search || url.hash) return false;
        if (url.protocol === "https:") return true;
        return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname.toLowerCase());
      } catch { return false; }
    },
    getLanguage() { return currentLanguage; },
    translateMessage(message) { return String(message); },
    t(key, params) {
      if (key === "error.secureServiceUrl") return "Secure service required";
      if (key === "widget.version") return currentLanguage === "en" ? "Version v" + params.version : "版本 v" + params.version;
      if (key === "widget.versionPending") return currentLanguage === "en" ? "Version unavailable" : "版本待获取";
      if (key === "widget.ready") return currentLanguage === "en" ? "Ready: " + params.name : "已就绪: " + params.name;
      if (key === "widget.loading") return currentLanguage === "en" ? "Loading..." : "加载中...";
      if (key === "widget.loadingPanorama") return currentLanguage === "en" ? "Loading panorama" : "正在加载全景图片";
      if (key === "widget.autorotate") return currentLanguage === "en" ? "Auto rotate" : "自动旋转";
      if (key === "widget.stopAutorotate") return currentLanguage === "en" ? "Stop auto-rotate" : "停止旋转";
      if (key === "widget.director") return currentLanguage === "en" ? "Play tour" : "自动演示";
      if (key === "widget.stopDirector") return currentLanguage === "en" ? "Stop tour" : "停止自动演示";
      if (key === "widget.fullscreen") return currentLanguage === "en" ? "Fullscreen" : "全屏预览";
      if (key === "widget.exitFullscreen") return currentLanguage === "en" ? "Exit fullscreen" : "退出全屏";
      if (key === "widget.focusView") return currentLanguage === "en" ? "Focus view" : "聚焦视野";
      if (key === "widget.exitFocus") return currentLanguage === "en" ? "Exit focus" : "退出聚焦";
      return key;
    }
  };
  widgetWindow.XinTI18n = i18n;
  const widgetScript = widgetHtml.match(/<script>\s*([\s\S]*?)\s*<\/script>/g).at(-1).replace(/^<script>\s*|\s*<\/script>$/g, "");
  vm.runInNewContext(widgetScript, {
    URLSearchParams,
    location: { search: query, origin: "https://panorama.example" },
    document,
    window: widgetWindow,
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
          toggleAutorotate() { return true; },
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
  assert.deepEqual(calls, expectInsecureService ? [] : [expectedUrl]);
  assert.deepEqual(assets, expectInsecureService ? [] : engine === "legacy"
    ? ["/assets/three.min.js", "/assets/legacy-viewer.js"]
    : ["/assets/psv.css", "/assets/psv.bundle.js"]);
  if (expectInsecureService) {
    assert.equal(requests.length, 0, "An insecure widget API parameter is rejected before config or panorama requests");
    assert.equal(elements.statusText.textContent, "Secure service required");
    return;
  }
  assert.equal(elements.systemNameText.textContent, app && app.name || "芯添全景系统");
  assert.equal(elements.systemVersionText.textContent, app && app.version ? i18n.t("widget.version", { version: app.version.replace(/^v/i, "") }) : i18n.t("widget.versionPending"));
  assert.equal(elements.githubRepoLink.href, app && app.repositoryUrl || "https://github.com/XinTycd/XinT-Panorama-System");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(elements.statusText.dataset.state, "ready");
  if (app && app.version) {
    const configRequestCount = requests.filter((url) => url.endsWith("/api/config")).length;
    currentLanguage = "zh-CN";
    windowHandlers.get("xint-language-change")();
    assert.equal(elements.systemVersionText.textContent, "版本 v" + app.version.replace(/^v/i, ""));
    currentLanguage = "en";
    windowHandlers.get("xint-language-change")();
    assert.equal(elements.systemVersionText.textContent, "Version v" + app.version.replace(/^v/i, ""));
    currentLanguage = "zh-TW";
    windowHandlers.get("xint-language-change")();
    assert.equal(elements.systemVersionText.textContent, "版本 v" + app.version.replace(/^v/i, ""));
    assert.equal(requests.filter((url) => url.endsWith("/api/config")).length, configRequestCount, "Locale changes reuse the stored app version without another request");
    assert.deepEqual(calls, [expectedUrl], "Locale changes do not rebuild or reload the viewer");
  }
  if (item.name === "项目") {
    currentLanguage = "en";
    windowHandlers.get("xint-language-change")();
    assert.equal(elements.statusText.textContent, "Ready: 项目");
    currentLanguage = "zh-TW";
    windowHandlers.get("xint-language-change")();
    assert.equal(elements.statusText.textContent, "已就绪: 项目", "a resource named like a UI term remains unchanged when the widget language changes");
  }

  if (query.includes("controls=none")) assert.equal(toolbar.hidden, true, "none preset hides the toolbar without disabling context menus");
  if (query.includes("controls=compact")) {
    assert.deepEqual(controls.filter((control) => !control.hidden).map((control) => control.getAttribute("data-control")),
      ["autorotate", "zoom-out", "zoom-in", "fullscreen"]);
  }
  if (query.includes("hideControls=zoom-in")) assert.equal(elements.zoomInBtn.hidden, true, "Legacy hideControls remains effective at widget startup");
  assert(widgetWindow.XinTPanoramaWidget, "Same-origin parent receives the narrow preset API");
  assert.equal(widgetWindow.XinTPanoramaWidget.setControlPreset("invalid"), false, "The preset API rejects arbitrary control input");
  assert.equal(widgetWindow.XinTPanoramaWidget.setControlPreset("all"), true);
  assert.equal(elements.statusText.hidden, true, "Applying a preset keeps the ready status hidden");
  if (engine === "psv") {
    assert.equal(elements.autorotateBtn.getAttribute("aria-pressed"), "false");
    elements.autorotateBtn.click();
    assert.equal(elements.autorotateBtn.getAttribute("aria-pressed"), "true", "Autorotate exposes its active state to assistive technology");
  }
  assert.equal(widgetWindow.XinTPanoramaWidget.setControlPreset("none"), true);
  assert(controls.every((control) => control.hidden), "The narrow API applies the no-controls preset");
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
  await runWidgetImageResolutionCase({
    item: { name: "项目", viewerPath: "/media/project-named.jpg" },
    expectedUrl: "https://panorama.example/media/project-named.jpg",
    query: "?panoramaNo=1&controls=compact&lang=en"
  });
  await runWidgetImageResolutionCase({
    item: { name: "Hidden preset", viewerPath: "/media/hidden.jpg" },
    expectedUrl: "https://panorama.example/media/hidden.jpg",
    query: "?panoramaNo=1&controls=all&hideControls=zoom-in"
  });
  await runWidgetImageResolutionCase({
    item: { name: "Public HTTP", viewerPath: "/media/should-not-load.jpg" },
    expectedUrl: null,
    query: "?api=http%3A%2F%2Fpanorama.example&panoramaNo=1",
    expectInsecureService: true
  });
  console.log("Embed control and widget URL resolution tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
