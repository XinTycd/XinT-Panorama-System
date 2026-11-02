const http = require("http");
const path = require("path");
const { URL } = require("url");
const { applyRuntimeConfig, getModesFromEnv, getViewerEngineDefault, isViewerEngineForcedByEnvironment, normalizeViewerEngine } = require("../lib/runtime-config");
const packageInfo = require("../package.json");

applyRuntimeConfig(process.argv.slice(2));

const { sendOptions, streamFile } = require("../lib/http");
const { sendJson, sendText, parseBody } = require("./api-http");
const { safeLocalMediaPath } = require("./media");
const { getMediaStorage, updateMediaStorage, mediaReference, readImagePayload } = require("./media-storage");
const { DB_DRIVER, initialize } = require("./store");
const { STORAGE_DIR } = require("./sqlite");
const { handleGalleryApi, makeDemoItem } = require("./routes/gallery");
const { handleProjectApi } = require("./routes/projects");

const HOST = process.env.PANORAMA_HOST || "127.0.0.1";
const PORT = Number(process.env.PANORAMA_PORT || 7210);
const APP_MODES = getModesFromEnv();
const PUBLIC_DIR = path.join(__dirname, "public");
const APP_NAME = "XinT 全景系统";
const APP_VERSION = packageInfo.version;
const APP_REPOSITORY_URL = String(packageInfo.homepage || "").replace(/#.*$/, "");
const VIEWER_SETTINGS_FILE = path.join(STORAGE_DIR, "viewer-settings.json");

function readViewerSetting() {
  try {
    const saved = JSON.parse(require("fs").readFileSync(VIEWER_SETTINGS_FILE, "utf8"));
    if (saved && (saved.engine === "psv" || saved.engine === "legacy")) return saved.engine;
  } catch (error) { if (error.code !== "ENOENT") console.warn("无法读取 viewer-settings.json: " + error.message); }
  return getViewerEngineDefault();
}

function getViewerSettings() {
  const forced = isViewerEngineForcedByEnvironment();
  const engine = forced ? normalizeViewerEngine(process.env.PANORAMA_VIEWER_ENGINE) : readViewerSetting();
  return { engine, forcedByEnvironment: forced };
}

function baseUrlFromRequest(req) {
  return "http://" + req.headers.host;
}

function canChangeStorage(req) {
  if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress)) return false;
  const host = new URL(baseUrlFromRequest(req)).hostname;
  if (!["127.0.0.1", "localhost", "[::1]"].includes(host)) return false;
  if (!req.headers.origin) return true;
  const frontendPort = process.env.FRONTEND_PORT || "7211";
  return req.headers.origin === baseUrlFromRequest(req) ||
    ["http://127.0.0.1:", "http://localhost:", "http://[::1]:"].some((host) => req.headers.origin === host + frontendPort);
}

async function handleApi(req, res, urlObject) {
  const baseUrl = baseUrlFromRequest(req);
  if (req.method === "GET" && urlObject.pathname === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      appName: APP_NAME,
      version: APP_VERSION,
      author: "XinTycd",
      service: "xint-panorama-system-backend",
      mode: APP_MODES.length === 3 ? "all" : APP_MODES.join(","),
      modes: APP_MODES,
      database: DB_DRIVER,
      time: new Date().toISOString()
    });
    return;
  }
  if (req.method === "GET" && urlObject.pathname === "/api/config") {
    const { getStoreInfo } = require("./store");
    sendJson(res, 200, {
      author: "XinTycd",
      app: { name: APP_NAME, version: APP_VERSION, repositoryUrl: APP_REPOSITORY_URL },
      apiBase: baseUrl,
      widgetScript: baseUrl + "/embed.js",
      widgetPage: baseUrl + "/widget",
      mode: APP_MODES.length === 3 ? "all" : APP_MODES.join(","),
      modes: APP_MODES,
      database: getStoreInfo(),
      mediaStorage: getMediaStorage(),
      viewer: getViewerSettings()
    });
    return;
  }
  if (req.method === "PUT" && urlObject.pathname === "/api/settings/viewer") {
    if (!canChangeStorage(req)) {
      sendJson(res, 403, { ok: false, message: "请从后端所在电脑的本地控制台修改预览引擎" });
      return;
    }
    if (isViewerEngineForcedByEnvironment()) {
      sendJson(res, 409, { ok: false, message: "PANORAMA_VIEWER_ENGINE 环境变量已锁定预览引擎" });
      return;
    }
    const input = await parseBody(req);
    let engine;
    try { engine = normalizeViewerEngine(input && input.engine); }
    catch (error) { error.statusCode = 400; throw error; }
    require("fs").mkdirSync(STORAGE_DIR, { recursive: true });
    require("fs").writeFileSync(VIEWER_SETTINGS_FILE, JSON.stringify({ engine }, null, 2) + "\n", "utf8");
    sendJson(res, 200, { ok: true, viewer: getViewerSettings() });
    return;
  }
  if (req.method === "PUT" && urlObject.pathname === "/api/settings/media-storage") {
    if (!canChangeStorage(req)) {
      sendJson(res, 403, { ok: false, message: "请从后端所在电脑的本地控制台修改图片存储设置" });
      return;
    }
    const mediaStorage = await updateMediaStorage(await parseBody(req));
    sendJson(res, 200, { ok: true, mediaStorage });
    return;
  }
  if (await handleProjectApi(req, res, urlObject) || res.headersSent) return;
  if (await handleGalleryApi(req, res, urlObject, baseUrl) || res.headersSent) return;
  sendText(res, 404, "Not Found");
}

async function serveStoredMedia(req, res, pathname, reference) {
  if (!["GET", "HEAD"].includes(req.method) || reference.mode === "client") {
    sendText(res, 404, "Not Found");
    return;
  }
  const image = await readImagePayload(pathname);
  if (!image) {
    sendText(res, 404, "Not Found");
    return;
  }
  res.writeHead(200, {
    "Content-Type": image.mime,
    "Content-Length": image.buffer.length,
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=60",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'"
  });
  res.end(req.method === "HEAD" ? undefined : image.buffer);
}

function serveStatic(req, res, urlObject) {
  const staticFiles = {
    "/embed.js": [path.join(PUBLIC_DIR, "embed.js"), "no-cache"],
    "/widget": [path.join(PUBLIC_DIR, "widget.html"), "no-cache"],
    "/assets/demo-panorama.svg": [path.join(PUBLIC_DIR, "demo-panorama.svg"), "public, max-age=3600"],
    "/assets/psv.bundle.js": [path.join(__dirname, "..", "frontend", "vendor", "psv.bundle.js"), "no-cache", true],
    "/assets/psv.css": [path.join(__dirname, "..", "frontend", "vendor", "psv.css"), "no-cache", true],
    "/assets/PSV-LICENSE": [path.join(__dirname, "..", "frontend", "vendor", "PSV-LICENSE"), "public, max-age=3600"],
    "/assets/THREE-LICENSE": [path.join(__dirname, "..", "frontend", "vendor", "THREE-LICENSE"), "public, max-age=3600"],
    "/assets/THIRD_PARTY_NOTICES.txt": [path.join(__dirname, "..", "frontend", "vendor", "THIRD_PARTY_NOTICES.txt"), "public, max-age=31536000, immutable"],
    "/assets/icons.svg": [path.join(__dirname, "..", "frontend", "icons", "sprite.svg"), "no-cache"],
    "/assets/icons/LICENSE.phosphor": [path.join(__dirname, "..", "frontend", "icons", "LICENSE.phosphor"), "public, max-age=3600"],
    "/assets/panorama-viewer.js": [path.join(__dirname, "..", "frontend", "panorama-viewer.js"), "no-cache"],
    "/assets/legacy-viewer.js": [path.join(__dirname, "..", "frontend", "viewer", "legacy-viewer.js"), "no-cache"],
    "/assets/three.min.js": [path.join(__dirname, "..", "frontend", "vendor", "three.min.js"), "public, max-age=31536000, immutable", true]
  };
  if (staticFiles[urlObject.pathname]) {
    const [filePath, cacheControl, brotli] = staticFiles[urlObject.pathname];
    streamFile(req, res, filePath, { cors: true, cacheControl, brotli });
    return;
  }
  if (urlObject.pathname.indexOf("/media/") === 0) {
    const reference = mediaReference(urlObject.pathname);
    if (reference) {
      serveStoredMedia(req, res, urlObject.pathname, reference).catch((error) => {
        if (!res.headersSent) sendText(res, error.statusCode || 500, "图片读取失败");
        else res.destroy();
      });
      return;
    }
    const absolutePath = safeLocalMediaPath(urlObject.pathname);
    if (!absolutePath) {
      sendText(res, 403, "Forbidden");
      return;
    }
    streamFile(req, res, absolutePath, { cors: true, cacheControl: "public, max-age=60" });
    return;
  }
  sendText(res, 404, "Not Found");
}

function createServer() {
  return http.createServer(function onRequest(req, res) {
    if (req.method === "OPTIONS") {
      sendOptions(res);
      return;
    }
    const urlObject = new URL(req.url, "http://" + (req.headers.host || HOST + ":" + PORT));
    if (urlObject.pathname.indexOf("/api/") === 0) {
      handleApi(req, res, urlObject).catch(function onError(error) {
        if (!res.headersSent) sendJson(res, error.statusCode || 500, { ok: false, message: error.message });
        else res.destroy();
      });
      return;
    }
    serveStatic(req, res, urlObject);
  });
}

async function initializeApplication() {
  await initialize();
}

if (require.main === module) {
  require("../scripts/viewer-assets").ensureViewerAssets().then(initializeApplication).then(function onReady() {
    const server = createServer();
    server.listen(PORT, HOST, function onListen() {
      console.log("XinT-Panorama-System Backend started");
      console.log("Modes: " + APP_MODES.join(",") + ", database: " + DB_DRIVER);
      console.log("Local: http://" + HOST + ":" + PORT);
    });
  }).catch(function onError(error) {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  HOST,
  PORT,
  APP_MODES,
  DB_DRIVER,
  APP_NAME,
  APP_VERSION,
  APP_REPOSITORY_URL,
  initialize: initializeApplication,
  createServer,
  makeDemoItem
};
