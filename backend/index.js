const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const {
  STORAGE_DIR,
  getNextPanoramaNo,
  ensureStorage,
  readGallery,
  writeGallery,
  makeId,
  upsertItem
} = require("./store");

const HOST = process.env.PANORAMA_HOST || "127.0.0.1";
const PORT = Number(process.env.PANORAMA_PORT || 7210);
const PUBLIC_DIR = path.join(__dirname, "public");
const UPLOADS_DIR = path.join(STORAGE_DIR, "uploads");
const JSON_LIMIT_BYTES = 30 * 1024 * 1024;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".avif": "image/avif",
  ".txt": "text/plain; charset=utf-8"
};

ensureStorage();
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function getMimeType(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
  });
  res.end(JSON.stringify(payload, null, 2));
}

function sendText(res, statusCode, message) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
  });
  res.end(message);
}

function sendFile(res, absolutePath) {
  fs.readFile(absolutePath, function onRead(error, buffer) {
    if (error) {
      sendText(res, 404, "Not Found");
      return;
    }

    res.writeHead(200, {
      "Content-Type": getMimeType(absolutePath),
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-cache"
    });
    res.end(buffer);
  });
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

function readGalleryPayload(baseUrl) {
  return readGallery().map(function mapItem(item) {
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

function ensureDemoItem() {
  const items = readGallery();
  const hasDemo = items.some(function hasItem(item) {
    return item.id === "demo-panorama";
  });

  if (!hasDemo) {
    items.unshift(makeDemoItem());
    writeGallery(items);
  }
}

function findItemByPanoramaNo(panoramaNo) {
  const normalizedNo = Number(panoramaNo);
  if (!Number.isFinite(normalizedNo)) {
    return null;
  }

  return readGallery().find(function findItem(item) {
    return Number(item.panoramaNo) === normalizedNo;
  }) || null;
}

function isPanoramaNoTaken(panoramaNo, ignoreId) {
  const normalizedNo = Number(panoramaNo);
  if (!Number.isFinite(normalizedNo)) {
    return false;
  }

  return readGallery().some(function hasSameNo(item) {
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
      time: new Date().toISOString()
    });
    return;
  }

  if (req.method === "GET" && urlObject.pathname === "/api/config") {
    sendJson(res, 200, {
      author: "XinTycd",
      apiBase: baseUrl,
      widgetScript: baseUrl + "/embed.js",
      widgetPage: baseUrl + "/widget"
    });
    return;
  }

  if (req.method === "GET" && urlObject.pathname === "/api/gallery") {
    sendJson(res, 200, {
      author: "XinTycd",
      items: readGalleryPayload(baseUrl)
    });
    return;
  }

  if (req.method === "GET" && urlObject.pathname === "/api/panoramas/by-no") {
    const panoramaNo = urlObject.searchParams.get("no");
    const item = findItemByPanoramaNo(panoramaNo);
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
    ensureDemoItem();
    sendJson(res, 200, {
      ok: true,
      items: readGalleryPayload(baseUrl)
    });
    return;
  }

  if (req.method === "POST" && urlObject.pathname === "/api/gallery/clear") {
    clearUploadsDirectory();
    writeGallery([]);
    sendJson(res, 200, { ok: true, items: [] });
    return;
  }

  if (req.method === "POST" && urlObject.pathname === "/api/panoramas/register") {
    const body = await parseBody(req);
    if (!body || !isRemoteHttpUrl(body.url)) {
      sendJson(res, 400, { ok: false, message: "url 必须是 http 或 https 地址" });
      return;
    }

    if (body.panoramaNo && isPanoramaNoTaken(body.panoramaNo)) {
      sendJson(res, 409, { ok: false, message: "panoramaNo 已存在，请使用其他编号" });
      return;
    }

    const item = {
      id: makeId("remote"),
      panoramaNo: Number(body.panoramaNo) || getNextPanoramaNo(readGallery()),
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

    upsertItem(item);
    sendJson(res, 200, {
      ok: true,
      item: serializeItem(item, baseUrl),
      items: readGalleryPayload(baseUrl)
    });
    return;
  }

  if (req.method === "POST" && urlObject.pathname === "/api/panoramas/upload-base64") {
    const body = await parseBody(req);
    const name = sanitizeFileName(body && body.name ? body.name : "panorama");
    const dataUrl = body && body.dataUrl ? String(body.dataUrl) : "";
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);

    if (!match) {
      sendJson(res, 400, { ok: false, message: "dataUrl 格式无效" });
      return;
    }

    if (body.panoramaNo && isPanoramaNoTaken(body.panoramaNo)) {
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
      panoramaNo: Number(body.panoramaNo) || getNextPanoramaNo(readGallery()),
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

    upsertItem(item);
    sendJson(res, 200, {
      ok: true,
      item: serializeItem(item, baseUrl),
      items: readGalleryPayload(baseUrl)
    });
    return;
  }

  if (req.method === "GET" && urlObject.pathname === "/api/panoramas/proxy") {
    handleProxy(req, res, urlObject.searchParams.get("url"), 0);
    return;
  }

  if (req.method === "POST" && urlObject.pathname === "/api/panoramas/update") {
    const body = await parseBody(req);
    const items = readGallery();
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
      isPanoramaNoTaken(body.panoramaNo, items[index].id)
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
    writeGallery(items);

    sendJson(res, 200, {
      ok: true,
      item: serializeItem(updatedItem, baseUrl),
      items: readGalleryPayload(baseUrl)
    });
    return;
  }

  sendText(res, 404, "Not Found");
}

function createServer() {
  return http.createServer(function onRequest(req, res) {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
      });
      res.end();
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
      sendFile(res, path.join(PUBLIC_DIR, "embed.js"));
      return;
    }

    if (urlObject.pathname === "/widget") {
      sendFile(res, path.join(PUBLIC_DIR, "widget.html"));
      return;
    }

    if (urlObject.pathname === "/assets/demo-panorama.svg") {
      sendFile(res, path.join(PUBLIC_DIR, "demo-panorama.svg"));
      return;
    }

    if (urlObject.pathname === "/assets/three.min.js") {
      sendFile(res, path.join(__dirname, "..", "frontend", "vendor", "three.min.js"));
      return;
    }

    if (urlObject.pathname.indexOf("/media/") === 0) {
      const absolutePath = safeLocalMediaPath(urlObject.pathname);
      if (!absolutePath) {
        sendText(res, 403, "Forbidden");
        return;
      }
      sendFile(res, absolutePath);
      return;
    }

    sendText(res, 404, "Not Found");
  });
}

if (require.main === module) {
  const server = createServer();
  server.listen(PORT, HOST, function onListen() {
    console.log("XinT-Panorama-System Backend started");
    console.log("Local: http://" + HOST + ":" + PORT);
  });
}

module.exports = {
  HOST,
  PORT,
  createServer,
  makeDemoItem
};
