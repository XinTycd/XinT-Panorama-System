const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const { applyRuntimeConfig, getModesFromEnv } = require("../lib/runtime-config");

applyRuntimeConfig(process.argv.slice(2));

const {
  sendJson: writeJson,
  sendText: writeText,
  sendOptions,
  streamFile
} = require("../lib/http");
const {
  STORAGE_DIR,
  DB_DRIVER,
  getNextPanoramaNo,
  initialize,
  readGallery,
  writeGallery,
  makeId,
  upsertItem,
  getStoreInfo
} = require("./store");

const HOST = process.env.PANORAMA_HOST || "127.0.0.1";
const PORT = Number(process.env.PANORAMA_PORT || 7210);
const APP_MODES = getModesFromEnv();
const PUBLIC_DIR = path.join(__dirname, "public");
const UPLOADS_DIR = path.join(STORAGE_DIR, "uploads");
const JSON_LIMIT_BYTES = 30 * 1024 * 1024;

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function modeAllows(requiredMode) {
  return APP_MODES.indexOf(requiredMode) !== -1;
}

function rejectMode(res, requiredMode) {
  sendJson(res, 403, {
    ok: false,
    message: "当前启动模式为 " + APP_MODES.join(",") + "，该接口需要 " + requiredMode + " 模式"
  });
}

function sendJson(res, statusCode, payload) {
  writeJson(res, statusCode, payload, { cors: true });
}

function sendText(res, statusCode, message) {
  writeText(res, statusCode, message, { cors: true });
}

function parseBody(req) {
  return new Promise(function read(resolve, reject) {
    let total = 0;
    const chunks = [];

    req.on("data", function onData(chunk) {
      total += chunk.length;
      if (total > JSON_LIMIT_BYTES) {
        reject(new Error("请求体过大"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", function onEnd() {
      if (!chunks.length) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        reject(new Error("JSON 解析失败"));
      }
    });

    req.on("error", reject);
  });
}

function baseUrlFromRequest(req) {
  return "http://" + req.headers.host;
}

function serializeItem(item, baseUrl) {
  return {
    id: item.id,
    panoramaNo: Number(item.panoramaNo) || null,
    name: item.name,
    description: item.description || "",
    sourceType: item.sourceType,
    originalUrl: item.originalUrl || null,
    viewerPath: item.viewerPath,
    thumbnailPath: item.thumbnailPath || item.viewerPath,
    viewerUrl: item.viewerPath.indexOf("http") === 0 ? item.viewerPath : baseUrl + item.viewerPath,
    thumbnailUrl:
      (item.thumbnailPath || item.viewerPath).indexOf("http") === 0
        ? item.thumbnailPath || item.viewerPath
        : baseUrl + (item.thumbnailPath || item.viewerPath),
    size: item.size || null,
    width: item.width || null,
    height: item.height || null,
    createdAt: item.createdAt
  };
}

function readGalleryPayload(baseUrl, items) {
  const galleryItems = Array.isArray(items) ? items : [];
  return galleryItems.map(function mapItem(item) {
    return serializeItem(item, baseUrl);
  });
}

function sanitizeFileName(fileName) {
  return String(fileName || "panorama")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function extensionFromMime(mimeType) {
  const known = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/bmp": ".bmp",
    "image/avif": ".avif",
    "image/svg+xml": ".svg"
  };
  return known[mimeType] || ".bin";
}

function makeDemoItem() {
  return {
    id: "demo-panorama",
    panoramaNo: 1000,
    name: "XinTycd Demo Panorama",
    sourceType: "backend-demo",
    originalUrl: null,
    viewerPath: "/assets/demo-panorama.svg",
    thumbnailPath: "/assets/demo-panorama.svg",
    size: null,
    width: 4096,
    height: 2048,
    createdAt: new Date().toISOString()
  };
}

async function ensureDemoItem() {
  const items = await readGallery();
  const hasDemo = items.some(function hasItem(item) {
    return item.id === "demo-panorama";
  });

  if (!hasDemo) {
    items.unshift(makeDemoItem());
    return await writeGallery(items);
  }

  return items;
}

async function findItemByPanoramaNo(panoramaNo, items) {
  const normalizedNo = Number(panoramaNo);
  if (!Number.isFinite(normalizedNo)) {
    return null;
  }

  const galleryItems = Array.isArray(items) ? items : await readGallery();
  return galleryItems.find(function findItem(item) {
    return Number(item.panoramaNo) === normalizedNo;
  }) || null;
}

async function isPanoramaNoTaken(panoramaNo, ignoreId, items) {
  const normalizedNo = Number(panoramaNo);
  if (!Number.isFinite(normalizedNo)) {
    return false;
  }

  const galleryItems = Array.isArray(items) ? items : await readGallery();
  return galleryItems.some(function hasSameNo(item) {
    return item.id !== ignoreId && Number(item.panoramaNo) === normalizedNo;
  });
}

function isRemoteHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || ""));
}

function safeLocalMediaPath(requestPath) {
  const relativePath = requestPath.replace(/^\/media\//, "");
  const absolutePath = path.resolve(STORAGE_DIR, relativePath);
  if (absolutePath.toLowerCase().indexOf(STORAGE_DIR.toLowerCase()) !== 0) {
    return null;
  }
  return absolutePath;
}

function clearUploadsDirectory() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    return;
  }

  fs.readdirSync(UPLOADS_DIR).forEach(function eachFile(fileName) {
    const absolutePath = path.join(UPLOADS_DIR, fileName);
    if (fs.statSync(absolutePath).isFile()) {
      fs.unlinkSync(absolutePath);
    }
  });
}

function handleProxy(req, res, remoteUrl, redirectDepth) {
  if (!isRemoteHttpUrl(remoteUrl)) {
    sendText(res, 400, "Invalid remote url");
    return;
  }

  const transport = remoteUrl.indexOf("https://") === 0 ? https : http;
  transport
    .get(remoteUrl, function onResponse(proxyRes) {
      if (
        proxyRes.statusCode >= 300 &&
        proxyRes.statusCode < 400 &&
        proxyRes.headers.location &&
        redirectDepth < 3
      ) {
        handleProxy(req, res, proxyRes.headers.location, redirectDepth + 1);
        return;
      }

      if (proxyRes.statusCode !== 200) {
        sendText(res, 502, "Remote resource unavailable");
        return;
      }

      res.writeHead(200, {
        "Content-Type": proxyRes.headers["content-type"] || "application/octet-stream",
        "Cache-Control": "public, max-age=60",
        "Access-Control-Allow-Origin": "*"
      });
      proxyRes.pipe(res);
    })
    .on("error", function onError() {
      sendText(res, 502, "Proxy request failed");
    });
}

async function handleApi(req, res, urlObject) {
  const baseUrl = baseUrlFromRequest(req);

  if (req.method === "GET" && urlObject.pathname === "/api/health") {
    sendJson(res, 200, {
      ok: true,
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
    sendJson(res, 200, {
      author: "XinTycd",
      apiBase: baseUrl,
      widgetScript: baseUrl + "/embed.js",
      widgetPage: baseUrl + "/widget",
      mode: APP_MODES.length === 3 ? "all" : APP_MODES.join(","),
      modes: APP_MODES,
      database: getStoreInfo()
    });
    return;
  }

  if (req.method === "GET" && urlObject.pathname === "/api/gallery") {
    if (!modeAllows("database") && !modeAllows("external") && !modeAllows("upload")) {
      rejectMode(res, "database/external/upload");
      return;
    }

    const items = await readGallery();
    sendJson(res, 200, {
      author: "XinTycd",
      items: readGalleryPayload(baseUrl, items)
    });
    return;
  }

  if (req.method === "GET" && urlObject.pathname === "/api/panoramas/by-no") {
    if (!modeAllows("database") && !modeAllows("external") && !modeAllows("upload")) {
      rejectMode(res, "database/external/upload");
      return;
    }

    const panoramaNo = urlObject.searchParams.get("no");
    const item = await findItemByPanoramaNo(panoramaNo);
    if (!item) {
      sendJson(res, 404, { ok: false, message: "指定编号的全景图不存在" });
      return;
    }

    sendJson(res, 200, {
      ok: true,
      item: serializeItem(item, baseUrl)
    });
    return;
  }

  if (req.method === "POST" && urlObject.pathname === "/api/gallery/seed-demo") {
    if (!modeAllows("database") && !modeAllows("external") && !modeAllows("upload")) {
      rejectMode(res, "database/external/upload");
      return;
    }

    const items = await ensureDemoItem();
    sendJson(res, 200, {
      ok: true,
      items: readGalleryPayload(baseUrl, items)
    });
    return;
  }

  if (req.method === "POST" && urlObject.pathname === "/api/gallery/clear") {
    if (!modeAllows("database") && !modeAllows("external") && !modeAllows("upload")) {
      rejectMode(res, "database/external/upload");
      return;
    }

    clearUploadsDirectory();
    await writeGallery([]);
    sendJson(res, 200, { ok: true, items: [] });
    return;
  }

  if (req.method === "POST" && urlObject.pathname === "/api/panoramas/register") {
    if (!modeAllows("external")) {
      rejectMode(res, "external");
      return;
    }

    const body = await parseBody(req);
    if (!body || !isRemoteHttpUrl(body.url)) {
      sendJson(res, 400, { ok: false, message: "url 必须是 http 或 https 地址" });
      return;
    }

    const items = await readGallery();

    if (body.panoramaNo && await isPanoramaNoTaken(body.panoramaNo, null, items)) {
      sendJson(res, 409, { ok: false, message: "panoramaNo 已存在，请使用其他编号" });
      return;
    }

    const item = {
      id: makeId("remote"),
      panoramaNo: Number(body.panoramaNo) || getNextPanoramaNo(items),
      name: String(body.name || "远程全景图"),
      description: String(body.description || ""),
      sourceType: "remote-url",
      originalUrl: body.url,
      viewerPath: "/api/panoramas/proxy?url=" + encodeURIComponent(body.url),
      thumbnailPath: "/api/panoramas/proxy?url=" + encodeURIComponent(body.url),
      size: null,
      width: null,
      height: null,
      createdAt: new Date().toISOString()
    };

    await upsertItem(item, items);
    const updatedItems = await readGallery();
    sendJson(res, 200, {
      ok: true,
      item: serializeItem(item, baseUrl),
      items: readGalleryPayload(baseUrl, updatedItems)
    });
    return;
  }

  if (req.method === "POST" && urlObject.pathname === "/api/panoramas/create") {
    if (!modeAllows("database")) {
      rejectMode(res, "database");
      return;
    }

    const body = await parseBody(req);
    const imageUrl = String(body.imageUrl || body.viewerPath || body.url || "").trim();
    if (!imageUrl) {
      sendJson(res, 400, { ok: false, message: "imageUrl 必须填写" });
      return;
    }

    const items = await readGallery();

    if (body.panoramaNo && await isPanoramaNoTaken(body.panoramaNo, null, items)) {
      sendJson(res, 409, { ok: false, message: "panoramaNo 已存在，请使用其他编号" });
      return;
    }

    const item = {
      id: body.id ? String(body.id) : makeId("db"),
      panoramaNo: Number(body.panoramaNo) || getNextPanoramaNo(items),
      name: String(body.name || body.title || "数据库全景图"),
      description: String(body.description || ""),
      sourceType: "database-record",
      originalUrl: body.originalUrl || imageUrl,
      viewerPath: imageUrl,
      thumbnailPath: body.thumbnailUrl || body.thumbnailPath || imageUrl,
      size: body.size || null,
      width: body.width || null,
      height: body.height || null,
      createdAt: body.createdAt || new Date().toISOString()
    };

    await upsertItem(item, items);
    const updatedItems = await readGallery();
    sendJson(res, 200, {
      ok: true,
      item: serializeItem(item, baseUrl),
      items: readGalleryPayload(baseUrl, updatedItems)
    });
    return;
  }

  if (req.method === "POST" && urlObject.pathname === "/api/panoramas/upload-base64") {
    if (!modeAllows("upload")) {
      rejectMode(res, "upload");
      return;
    }

    const body = await parseBody(req);
    const name = sanitizeFileName(body && body.name ? body.name : "panorama");
    const dataUrl = body && body.dataUrl ? String(body.dataUrl) : "";
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);

    if (!match) {
      sendJson(res, 400, { ok: false, message: "dataUrl 格式无效" });
      return;
    }

    const items = await readGallery();

    if (body.panoramaNo && await isPanoramaNoTaken(body.panoramaNo, null, items)) {
      sendJson(res, 409, { ok: false, message: "panoramaNo 已存在，请使用其他编号" });
      return;
    }

    const mimeType = match[1];
    const extension = extensionFromMime(mimeType);
    const buffer = Buffer.from(match[2], "base64");
    const fileName = name + "-" + Date.now() + extension;
    const absolutePath = path.join(UPLOADS_DIR, fileName);
    fs.writeFileSync(absolutePath, buffer);

    const relativeMediaPath = "/media/uploads/" + fileName;
    const item = {
      id: makeId("upload"),
      panoramaNo: Number(body.panoramaNo) || getNextPanoramaNo(items),
      name: body.name || fileName,
      description: String(body.description || ""),
      sourceType: "uploaded-base64",
      originalUrl: null,
      viewerPath: relativeMediaPath,
      thumbnailPath: relativeMediaPath,
      size: buffer.length,
      width: null,
      height: null,
      createdAt: new Date().toISOString()
    };

    await upsertItem(item, items);
    const updatedItems = await readGallery();
    sendJson(res, 200, {
      ok: true,
      item: serializeItem(item, baseUrl),
      items: readGalleryPayload(baseUrl, updatedItems)
    });
    return;
  }

  if (req.method === "GET" && urlObject.pathname === "/api/panoramas/proxy") {
    if (!modeAllows("external") && !modeAllows("database") && !modeAllows("upload")) {
      rejectMode(res, "external/database/upload");
      return;
    }

    handleProxy(req, res, urlObject.searchParams.get("url"), 0);
    return;
  }

  if (req.method === "POST" && urlObject.pathname === "/api/panoramas/update") {
    if (!modeAllows("database") && !modeAllows("external") && !modeAllows("upload")) {
      rejectMode(res, "database/external/upload");
      return;
    }

    const body = await parseBody(req);
    const items = await readGallery();
    const index = items.findIndex(function findItem(item) {
      return item.id === body.id;
    });

    if (index === -1) {
      sendJson(res, 404, { ok: false, message: "指定全景图不存在" });
      return;
    }

    if (
      body.panoramaNo !== undefined &&
      body.panoramaNo !== null &&
      body.panoramaNo !== "" &&
      await isPanoramaNoTaken(body.panoramaNo, items[index].id, items)
    ) {
      sendJson(res, 409, { ok: false, message: "panoramaNo 已存在，请使用其他编号" });
      return;
    }

    const nextPanoramaNo =
      body.panoramaNo !== undefined && body.panoramaNo !== null && body.panoramaNo !== ""
        ? Number(body.panoramaNo)
        : items[index].panoramaNo;

    if (!Number.isFinite(nextPanoramaNo) || nextPanoramaNo <= 0) {
      sendJson(res, 400, { ok: false, message: "panoramaNo 必须是正整数" });
      return;
    }

    const updatedItem = Object.assign({}, items[index], {
      panoramaNo: nextPanoramaNo,
      name: body.name !== undefined ? String(body.name || "").trim() || items[index].name : items[index].name,
      description: body.description !== undefined ? String(body.description || "") : (items[index].description || "")
    });

    items[index] = updatedItem;
    await writeGallery(items);

    sendJson(res, 200, {
      ok: true,
      item: serializeItem(updatedItem, baseUrl),
      items: readGalleryPayload(baseUrl, items)
    });
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
        sendJson(res, 500, { ok: false, message: error.message });
      });
      return;
    }

    if (urlObject.pathname === "/embed.js") {
      streamFile(req, res, path.join(PUBLIC_DIR, "embed.js"), {
        cors: true,
        cacheControl: "no-cache"
      });
      return;
    }

    if (urlObject.pathname === "/widget") {
      streamFile(req, res, path.join(PUBLIC_DIR, "widget.html"), {
        cors: true,
        cacheControl: "no-cache"
      });
      return;
    }

    if (urlObject.pathname === "/assets/demo-panorama.svg") {
      streamFile(req, res, path.join(PUBLIC_DIR, "demo-panorama.svg"), {
        cors: true,
        cacheControl: "public, max-age=3600"
      });
      return;
    }

    if (urlObject.pathname === "/assets/three.min.js") {
      streamFile(req, res, path.join(__dirname, "..", "frontend", "vendor", "three.min.js"), {
        cors: true,
        cacheControl: "public, max-age=31536000, immutable"
      });
      return;
    }

    if (urlObject.pathname === "/assets/panorama-viewer.js") {
      streamFile(req, res, path.join(__dirname, "..", "frontend", "panorama-viewer.js"), {
        cors: true,
        cacheControl: "no-cache"
      });
      return;
    }

    if (urlObject.pathname.indexOf("/media/") === 0) {
      const absolutePath = safeLocalMediaPath(urlObject.pathname);
      if (!absolutePath) {
        sendText(res, 403, "Forbidden");
        return;
      }
      streamFile(req, res, absolutePath, {
        cors: true,
        cacheControl: "public, max-age=60"
      });
      return;
    }

    sendText(res, 404, "Not Found");
  });
}

if (require.main === module) {
  initialize()
    .then(function onReady() {
        const server = createServer();
        server.listen(PORT, HOST, function onListen() {
          console.log("XinT-Panorama-System Backend started");
        console.log("Modes: " + APP_MODES.join(",") + ", database: " + DB_DRIVER);
        console.log("Local: http://" + HOST + ":" + PORT);
      });
    })
    .catch(function onError(error) {
      console.error(error.message);
      process.exit(1);
    });
}

module.exports = {
  HOST,
  PORT,
  APP_MODES,
  DB_DRIVER,
  initialize,
  createServer,
  makeDemoItem
};
