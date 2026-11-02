const { getModesFromEnv } = require("../../lib/runtime-config");
const { sendJson, parseBody } = require("../api-http");
const { STORAGE_DIR, readGallery, readItemById, readItemByPanoramaNo, writeGallery, makeId, upsertItem, updateItem, deleteItem, listGroups, createGroup, deleteGroup } = require("../store");
const { resolveLocalMediaPath } = require("../media");
const { captureMediaStorage, saveServerImage, removeImagePayload } = require("../media-storage");
const { isRemoteHttpUrl, assertSafeRemoteUrl, handleProxy } = require("../remote-image");
const { canGenerateThumbnail, readThumbnail } = require("../thumbnails");

const APP_MODES = getModesFromEnv();

function modeAllows(requiredMode) { return APP_MODES.indexOf(requiredMode) !== -1; }
function rejectMode(res, requiredMode) {
  return sendApiJson(res, 403, { ok: false, message: "当前启动模式为 " + APP_MODES.join(",") + "，该接口需要 " + requiredMode + " 模式" });
}

function sendApiJson(res, statusCode, payload) {
  sendJson(res, statusCode, payload);
  return true;
}

function parseOptionalPanoramaNo(body) {
  const value = body && body.panoramaNo;
  if (value === undefined || value === null || String(value).trim() === "") return { ok: true, value: null };
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) return { ok: false, value: null };
  return { ok: true, value: number };
}

function serializeItem(item, baseUrl) {
  const viewerPath = String(item.viewerPath || "");
  const thumbnailPath = canGenerateThumbnail(item)
    ? "/api/panoramas/thumbnail?id=" + encodeURIComponent(item.id)
    : item.thumbnailPath || viewerPath;
  return {
    id: item.id,
    panoramaNo: Number(item.panoramaNo) || null,
    group: item.group || "",
    name: item.name,
    description: item.description || "",
    sourceType: item.sourceType,
    originalUrl: item.originalUrl || null,
    viewerPath,
    thumbnailPath,
    viewerUrl: viewerPath.indexOf("http") === 0 ? viewerPath : baseUrl + viewerPath,
    thumbnailUrl: thumbnailPath.indexOf("http") === 0 ? thumbnailPath : baseUrl + thumbnailPath,
    size: item.size || null,
    width: item.width || null,
    height: item.height || null,
    createdAt: item.createdAt
  };
}

function readGalleryPayload(baseUrl, items) {
  return (Array.isArray(items) ? items : []).map((item) => serializeItem(item, baseUrl));
}

function extensionFromMime(mimeType) {
  const extensions = {
    "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif",
    "image/bmp": ".bmp", "image/avif": ".avif", "image/svg+xml": ".svg"
  };
  return extensions[mimeType] || null;
}

function makeDemoItem() {
  return {
    id: "demo-panorama", panoramaNo: null, name: "XinTycd Demo Panorama", sourceType: "backend-demo",
    originalUrl: null, viewerPath: "/assets/demo-panorama.svg", thumbnailPath: "/assets/demo-panorama.svg",
    size: null, width: 4096, height: 2048, createdAt: new Date().toISOString()
  };
}

async function ensureDemoItem() {
  const items = await readGallery();
  if (!items.some((item) => item.id === "demo-panorama")) {
    await upsertItem(makeDemoItem());
    return readGallery();
  }
  return items;
}

async function findItemByPanoramaNo(panoramaNo) {
  const normalizedNo = Number(panoramaNo);
  if (!Number.isFinite(normalizedNo)) return null;
  return readItemByPanoramaNo(normalizedNo);
}

async function isPanoramaNoTaken(panoramaNo, ignoreId) {
  const normalizedNo = Number(panoramaNo);
  if (!Number.isFinite(normalizedNo)) return false;
  const item = await readItemByPanoramaNo(normalizedNo);
  return Boolean(item && item.id !== ignoreId);
}

async function handleGalleryApi(req, res, urlObject, baseUrl) {
  const pathname = urlObject.pathname;
  if (pathname === "/api/gallery/groups" && req.method === "GET") {
    sendJson(res, 200, { ok: true, items: await listGroups() });
    return true;
  }
  if (pathname === "/api/gallery/groups" && req.method === "POST") {
    const group = await createGroup((await parseBody(req)).name);
    sendJson(res, 201, { ok: true, group: group });
    return true;
  }
  if (pathname === "/api/gallery/groups" && req.method === "DELETE") {
    const group = await deleteGroup(urlObject.searchParams.get("name"));
    if (!group) return sendApiJson(res, 404, { ok: false, message: "分组不存在" });
    sendJson(res, 200, { ok: true, deleted: true, group: group });
    return true;
  }
  if (req.method === "GET" && pathname === "/api/gallery") {
    if (!galleryModeAllowed()) return rejectMode(res, "database/external/upload");
    sendJson(res, 200, { author: "XinTycd", items: readGalleryPayload(baseUrl, await readGallery()) });
    return true;
  }
  if (req.method === "GET" && pathname === "/api/panoramas/by-no") {
    if (!galleryModeAllowed()) return rejectMode(res, "database/external/upload");
    const item = await findItemByPanoramaNo(urlObject.searchParams.get("no"));
    if (!item) return sendApiJson(res, 404, { ok: false, message: "指定编号的全景图不存在" });
    sendJson(res, 200, { ok: true, item: serializeItem(item, baseUrl) });
    return true;
  }
  if ((req.method === "GET" || req.method === "HEAD") && pathname === "/api/panoramas/thumbnail") {
    if (!galleryModeAllowed()) return rejectMode(res, "database/external/upload");
    const item = readItemById(urlObject.searchParams.get("id") || "");
    if (!canGenerateThumbnail(item)) return sendApiJson(res, 404, { ok: false, message: "缩略图不存在" });
    const thumbnail = await readThumbnail(item);
    if (!thumbnail) {
      res.writeHead(302, { Location: item.viewerPath, "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" });
      res.end();
      return true;
    }
    res.writeHead(200, {
      "Content-Type": "image/webp",
      "Content-Length": thumbnail.length,
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=60",
      "X-Content-Type-Options": "nosniff"
    });
    res.end(req.method === "HEAD" ? undefined : thumbnail);
    return true;
  }
  if (req.method === "POST" && pathname === "/api/gallery/seed-demo") {
    if (!galleryModeAllowed()) return rejectMode(res, "database/external/upload");
    sendJson(res, 200, { ok: true, items: readGalleryPayload(baseUrl, await ensureDemoItem()) });
    return true;
  }
  if (req.method === "POST" && pathname === "/api/gallery/clear") {
    if (!galleryModeAllowed()) return rejectMode(res, "database/external/upload");
    await writeGallery([]);
    sendJson(res, 200, { ok: true, items: [] });
    return true;
  }
  if (req.method === "POST" && pathname === "/api/panoramas/register") {
    if (!modeAllows("external")) return rejectMode(res, "external");
    const body = await parseBody(req);
    if (!isRemoteHttpUrl(body.url)) return sendApiJson(res, 400, { ok: false, message: "url 必须是 http 或 https 地址" });
    await assertSafeRemoteUrl(body.url);
    const requestedNo = parseOptionalPanoramaNo(body);
    if (!requestedNo.ok) return sendApiJson(res, 400, { ok: false, message: "panoramaNo 必须是正整数" });
    if (requestedNo.value && await isPanoramaNoTaken(requestedNo.value, null)) {
      return sendApiJson(res, 409, { ok: false, message: "panoramaNo 已存在，请使用其他编号" });
    }
    const item = {
      id: makeId("remote"), panoramaNo: requestedNo.value,
      group: body.group,
      name: String(body.name || "远程全景图"), description: String(body.description || ""), sourceType: "remote-url",
      originalUrl: body.url, viewerPath: "/api/panoramas/proxy?url=" + encodeURIComponent(body.url),
      thumbnailPath: "/api/panoramas/proxy?url=" + encodeURIComponent(body.url), size: null, width: null, height: null,
      createdAt: new Date().toISOString()
    };
    await upsertItem(item);
    sendJson(res, 200, { ok: true, item: serializeItem(item, baseUrl), items: readGalleryPayload(baseUrl, await readGallery()) });
    return true;
  }
  if (req.method === "POST" && pathname === "/api/panoramas/create") {
    if (!modeAllows("database")) return rejectMode(res, "database");
    const body = await parseBody(req);
    const imageUrl = String(body.imageUrl || body.viewerPath || body.url || "").trim();
    if (!imageUrl) return sendApiJson(res, 400, { ok: false, message: "imageUrl 必须填写" });
    const requestedNo = parseOptionalPanoramaNo(body);
    if (!requestedNo.ok) return sendApiJson(res, 400, { ok: false, message: "panoramaNo 必须是正整数" });
    const localPath = resolveLocalMediaPath(STORAGE_DIR, imageUrl);
    if (!isRemoteHttpUrl(imageUrl) && !localPath) return sendApiJson(res, 400, { ok: false, message: "图片地址必须是 http(s) URL 或 /media/uploads/ 下的本地图片" });
    if (isRemoteHttpUrl(imageUrl)) await assertSafeRemoteUrl(imageUrl);
    if (requestedNo.value && await isPanoramaNoTaken(requestedNo.value, null)) {
      return sendApiJson(res, 409, { ok: false, message: "panoramaNo 已存在，请使用其他编号" });
    }
    const item = {
      id: body.id ? String(body.id) : makeId("db"), panoramaNo: requestedNo.value,
      group: body.group,
      name: String(body.name || body.title || "数据库全景图"), description: String(body.description || ""),
      sourceType: "database-record", originalUrl: body.originalUrl || imageUrl, viewerPath: imageUrl,
      thumbnailPath: body.thumbnailUrl || body.thumbnailPath || imageUrl, size: body.size || null,
      width: body.width || null, height: body.height || null, createdAt: body.createdAt || new Date().toISOString()
    };
    await upsertItem(item);
    sendJson(res, 200, { ok: true, item: serializeItem(item, baseUrl), items: readGalleryPayload(baseUrl, await readGallery()) });
    return true;
  }
  if (req.method === "POST" && pathname === "/api/panoramas/upload-base64") {
    if (!modeAllows("upload")) return rejectMode(res, "upload");
    const body = await parseBody(req);
    const storage = captureMediaStorage();
    const requestedNo = parseOptionalPanoramaNo(body);
    if (!requestedNo.ok) return sendApiJson(res, 400, { ok: false, message: "panoramaNo 必须是正整数" });
    let item;
    let viewerPath;
    let createdPayload = false;
    if (storage.mode === "client" || body.clientMediaId !== undefined) {
      if (storage.mode !== "client") return sendApiJson(res, 409, { ok: false, message: "上传存储模式已变化，请刷新配置后重试" });
      if (!body.clientMediaId) return sendApiJson(res, 409, { ok: false, message: "本地存储模式已变化，请刷新配置后重试" });
      const clientMediaId = String(body.clientMediaId);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientMediaId)) {
        return sendApiJson(res, 400, { ok: false, message: "clientMediaId 必须是 UUID v4" });
      }
      viewerPath = "/media/client/" + clientMediaId;
      item = {
        id: makeId("upload"), panoramaNo: requestedNo.value,
        group: body.group, name: body.name || "客户端图片", description: String(body.description || ""),
        sourceType: "client-upload", originalUrl: null, viewerPath: viewerPath, thumbnailPath: viewerPath,
        size: body.size == null ? null : Number(body.size), width: body.width == null ? null : Number(body.width),
        height: body.height == null ? null : Number(body.height), createdAt: new Date().toISOString()
      };
    } else {
      const dataUrl = String(body.dataUrl || "");
      const match = dataUrl.match(/^data:([^;]+);base64,([A-Za-z0-9+/]+={0,2})$/);
      if (!match) return sendApiJson(res, 400, { ok: false, message: "dataUrl 格式无效" });
      const mimeType = match[1].toLowerCase();
      if (!extensionFromMime(mimeType)) return sendApiJson(res, 400, { ok: false, message: "不支持的图片类型" });
      const buffer = Buffer.from(match[2], "base64");
      if (buffer.length === 0 || buffer.toString("base64") !== match[2]) return sendApiJson(res, 400, { ok: false, message: "dataUrl 的 Base64 内容无效" });
      const saved = await saveServerImage(buffer, mimeType, body.name || "panorama", storage);
      viewerPath = saved.viewerPath;
      createdPayload = true;
      item = {
        id: makeId("upload"), panoramaNo: requestedNo.value,
        group: body.group, name: saved.name || body.name || "panorama", description: String(body.description || ""),
        sourceType: "uploaded-base64", originalUrl: null, viewerPath: viewerPath, thumbnailPath: viewerPath,
        size: saved.size, width: saved.width == null ? null : saved.width, height: saved.height == null ? null : saved.height, createdAt: new Date().toISOString()
      };
    }
    try { await upsertItem(item, { resequence: Boolean(body.resequence) }); }
    catch (error) {
      if (createdPayload) {
        try { await removeImagePayload(viewerPath); } catch (_) { /* keep the original write failure */ }
      }
      throw error;
    }
    const response = { ok: true, item: serializeItem(item, baseUrl) };
    if (urlObject.searchParams.get("includeItems") !== "0") response.items = readGalleryPayload(baseUrl, await readGallery());
    sendJson(res, 200, response);
    return true;
  }
  if (req.method === "GET" && pathname === "/api/panoramas/proxy") {
    if (!galleryModeAllowed()) return rejectMode(res, "external/database/upload");
    await handleProxy(req, res, urlObject.searchParams.get("url"), 0);
    return true;
  }
  if (req.method === "POST" && pathname === "/api/panoramas/update") {
    if (!galleryModeAllowed()) return rejectMode(res, "database/external/upload");
    const body = await parseBody(req);
    const existing = readItemById(body.id);
    if (!existing) return sendApiJson(res, 404, { ok: false, message: "指定全景图不存在" });
    const requestedNo = parseOptionalPanoramaNo(body);
    if (!requestedNo.ok) return sendApiJson(res, 400, { ok: false, message: "panoramaNo 必须是正整数" });
    const panoramaNo = requestedNo.value === null ? existing.panoramaNo : requestedNo.value;
    const changes = {
      panoramaNo,
      name: body.name !== undefined ? String(body.name || "").trim() || existing.name : existing.name,
      description: body.description !== undefined ? String(body.description || "") : existing.description || ""
    };
    if (body.group !== undefined) changes.group = body.group;
    const updatedItem = await updateItem(existing.id, changes);
    if (!updatedItem) return sendApiJson(res, 404, { ok: false, message: "指定全景图不存在" });
    sendJson(res, 200, { ok: true, item: serializeItem(updatedItem, baseUrl), items: readGalleryPayload(baseUrl, await readGallery()) });
    return true;
  }
  const panoramaMatch = pathname.match(/^\/api\/panoramas\/([^/]+)$/);
  if (panoramaMatch && req.method === "DELETE") {
    if (!galleryModeAllowed()) return rejectMode(res, "database/external/upload");
    try {
      const deleted = await deleteItem(decodeURIComponent(panoramaMatch[1]));
      if (!deleted) return sendApiJson(res, 404, { ok: false, message: "指定全景图不存在" });
      sendJson(res, 200, { ok: true, deleted: true, id: deleted.id });
    } catch (error) {
      if (error.statusCode === 409) return sendApiJson(res, 409, { ok: false, message: error.message, references: error.references });
      throw error;
    }
    return true;
  }
  return false;
}

function galleryModeAllowed() { return modeAllows("database") || modeAllows("external") || modeAllows("upload"); }

module.exports = { handleGalleryApi, makeDemoItem, serializeItem, readGalleryPayload };
