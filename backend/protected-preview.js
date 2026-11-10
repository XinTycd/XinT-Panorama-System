"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const { assertSafeRemoteUrl, isRemoteHttpUrl, safeRemoteLookup } = require("./remote-image");
const { createHttpError } = require("./api-http");

const STORAGE_DIR = path.resolve(process.env.PANORAMA_STORAGE_DIR || path.join(__dirname, "storage"));
const CACHE_DIR = path.join(STORAGE_DIR, "protected-previews");
const PRIVATE_SOURCE_DIR = path.join(STORAGE_DIR, "private-sources");
const CONVERSION_VERSION = "lossless-preview-v2";
const MAX_SOURCE_BYTES = 30 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
const MAX_PIXELS = 100_000_000;
const MAX_CONCURRENCY = 2;
const MAX_QUEUE = 12;
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp", "avif", "tiff", "gif", "bmp"]);
const pending = new Map();
const queue = [];
let active = 0;
const verifiedCache = new Map();
const resourcePending = new Map();
const resourceMemo = new Map();
const resourceQueue = [];
let activeResourceJobs = 0;

function privateSourcePath(value) {
  const match = /^private:\/\/([0-9a-f-]{36})$/i.exec(String(value || ""));
  return match ? path.join(PRIVATE_SOURCE_DIR, match[1] + ".bin") : null;
}

async function storePrivateSource(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > MAX_SOURCE_BYTES) throw createHttpError(413, "图片大小超出允许范围");
  await ensurePrivateDirectory(PRIVATE_SOURCE_DIR);
  const id = crypto.randomUUID();
  const target = path.join(PRIVATE_SOURCE_DIR, id + ".bin");
  let handle;
  try { handle = await fs.open(target, "wx", 0o600); await handle.writeFile(buffer); }
  catch (error) { if (handle) await handle.close().catch(() => {}); await fs.rm(target, { force: true }).catch(() => {}); throw createHttpError(503, "无法保存图片源文件"); }
  finally { if (handle) await handle.close().catch(() => {}); }
  return "private://" + id;
}

async function ensurePrivateDirectory(directory) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw createHttpError(503, "私有图片存储不可用");
}

async function storeRemoteSource(url, buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > MAX_SOURCE_BYTES) throw createHttpError(413, "图片大小超出允许范围");
  try { await ensurePrivateDirectory(PRIVATE_SOURCE_DIR); }
  catch (_) { throw createHttpError(503, "私有图片存储不可用"); }
  const key = crypto.createHash("sha256").update(String(url)).digest("hex");
  const target = path.join(PRIVATE_SOURCE_DIR, "remote-" + key + ".bin");
  try { await fs.access(target); return target; } catch (_) { /* populate below */ }
  const temp = target + "." + crypto.randomUUID() + ".tmp";
  let handle;
  try {
    handle = await fs.open(temp, "wx", 0o600);
    await handle.writeFile(buffer);
    await handle.close();
    handle = null;
    try { await fs.rename(temp, target); }
    catch (error) { await fs.rm(temp, { force: true }).catch(() => {}); if (error.code !== "EEXIST") throw error; }
  } catch (_) {
    if (handle) await handle.close().catch(() => {});
    await fs.rm(temp, { force: true }).catch(() => {});
    throw createHttpError(503, "无法保存远程图片源文件");
  }
  return target;
}

async function removePrivateSource(value) {
  const target = privateSourcePath(value);
  if (target) await fs.rm(target, { force: true }).catch(() => {});
}

async function remoteBuffer(url, redirectDepth = 0, deadline = Date.now() + 10000) {
  if (redirectDepth > 3) throw createHttpError(502, "远程图片跳转次数过多");
  let target;
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw createHttpError(504, "远程图片请求超时");
  let validationTimer;
  try {
    target = await Promise.race([
      assertSafeRemoteUrl(url),
      new Promise((_, reject) => { validationTimer = setTimeout(() => reject(createHttpError(504, "远程图片请求超时")), remaining); })
    ]);
  }
  catch (error) { throw error.statusCode ? error : createHttpError(400, "远程图片地址无效或不安全"); }
  finally { clearTimeout(validationTimer); }
  if (Date.now() >= deadline) throw createHttpError(504, "远程图片请求超时");
  if (target.protocol !== "https:") throw createHttpError(400, "远程图片导入必须使用 HTTPS 地址");
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer;
    function finish(error, value) { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(value); }
    const request = https.get(target, { headers: { Accept: "image/*" }, lookup: safeRemoteLookup }, (response) => {
      const status = response.statusCode || 0;
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        let redirect;
        try { redirect = new URL(response.headers.location, target).toString(); }
        catch (_) { finish(createHttpError(502, "远程图片跳转地址无效")); return; }
        remoteBuffer(redirect, redirectDepth + 1, deadline).then((value) => finish(null, value), (error) => finish(error.statusCode ? error : createHttpError(502, "远程图片读取失败")));
        return;
      }
      const mime = String(response.headers["content-type"] || "").split(";")[0].toLowerCase();
      const contentLength = Number(response.headers["content-length"] || 0);
      if (status !== 200 || !mime.startsWith("image/") || (contentLength && contentLength > MAX_SOURCE_BYTES)) {
        response.resume(); finish(createHttpError(status === 200 ? 422 : 502, "远程图片不可读取或超出大小限制")); return;
      }
      const chunks = [];
      let size = 0;
      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_SOURCE_BYTES) { response.destroy(); request.destroy(); finish(createHttpError(413, "远程图片超出大小限制")); return; }
        chunks.push(chunk);
      });
      response.on("end", () => finish(null, { buffer: Buffer.concat(chunks), mime }));
      response.on("aborted", () => finish(createHttpError(502, "远程图片读取中断")));
      response.on("error", () => finish(createHttpError(502, "远程图片读取失败")));
    });
    timer = setTimeout(() => request.destroy(createHttpError(504, "远程图片请求超时")), Math.max(1, deadline - Date.now()));
    request.on("error", (error) => finish(error.statusCode ? error : createHttpError(502, "远程图片请求失败")));
  });
}

async function readSource(item) {
  if (item && item.sourceType === "backend-demo" && item.id === "demo-panorama") {
    const bundledSample = path.join(__dirname, "public", "demo-panorama.svg");
    try {
      const sharp = require("sharp");
      return { buffer: await sharp(await fs.readFile(bundledSample)).png().toBuffer(), mime: "image/png" };
    }
    catch (_) { throw createHttpError(503, "内置示例图片不可用"); }
  }
  const internalPath = privateSourcePath(item && item.viewerPath);
  if (internalPath) {
    try { return { buffer: await fs.readFile(internalPath), mime: null }; }
    catch (error) { if (error.code === "ENOENT") throw createHttpError(404, "图片源文件不存在"); throw error; }
  }
  const { mediaReference, readImagePayload } = require("./media-storage");
  const reference = mediaReference(item && item.viewerPath);
  if (reference) {
    const image = await readImagePayload(item.viewerPath);
    if (image) return image;
  }
  const { safeLocalMediaPath } = require("./media");
  const localPath = safeLocalMediaPath(item && item.viewerPath);
  if (localPath) {
    try { return { buffer: await fs.readFile(localPath), mime: null }; }
    catch (error) { if (error.code === "ENOENT") throw createHttpError(404, "图片源文件不存在"); throw error; }
  }
  const url = isRemoteHttpUrl(item && item.viewerPath) ? item.viewerPath : (item && item.originalUrl);
  if (isRemoteHttpUrl(url)) {
    const key = crypto.createHash("sha256").update(String(url)).digest("hex");
    const target = path.join(PRIVATE_SOURCE_DIR, "remote-" + key + ".bin");
    try { return { buffer: await fs.readFile(target), mime: null }; }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    const fetched = await remoteBuffer(url);
    const storedAt = await storeRemoteSource(url, fetched.buffer);
    return { ...fetched, privateSourcePath: storedAt };
  }
  throw createHttpError(422, "该资源无法生成安全预览");
}

function drainQueue() {
  while (active < MAX_CONCURRENCY && queue.length) {
    active += 1;
    const task = queue.shift();
    task();
  }
}

async function convertBuffer(source) {
  if (!Buffer.isBuffer(source) || source.length === 0 || source.length > MAX_SOURCE_BYTES) throw createHttpError(413, "图片大小超出允许范围");
  let sharp;
  let metadata;
  try {
    sharp = require("sharp");
    metadata = await sharp(source, { limitInputPixels: MAX_PIXELS, failOn: "error", animated: false }).metadata();
  } catch (_) { throw createHttpError(422, "无法安全解码此图片格式"); }
  if (!metadata || !ALLOWED_FORMATS.has(metadata.format) || (metadata.pages || 1) !== 1 || !metadata.width || !metadata.height || metadata.width * metadata.height > MAX_PIXELS || (metadata.depth && metadata.depth !== "uchar")) {
    throw createHttpError(422, "仅支持单帧、标准位深的静态全景图片");
  }
  let output;
  try {
    output = await sharp(source, { limitInputPixels: MAX_PIXELS, failOn: "error", animated: false }).autoOrient().webp({ lossless: true, effort: 0 }).toBuffer({ resolveWithObject: true });
  } catch (_) { throw createHttpError(422, "无法生成安全预览"); }
  let format = "webp";
  let mime = "image/webp";
  if (output.data.equals(source)) {
    try {
      output = await sharp(source, { limitInputPixels: MAX_PIXELS, failOn: "error", animated: false }).autoOrient().png({ compressionLevel: 6, adaptiveFiltering: true }).toBuffer({ resolveWithObject: true });
      format = "png";
      mime = "image/png";
    } catch (_) { throw createHttpError(422, "无法生成与源文件字节不同的安全预览"); }
  }
  if (output.data.length > MAX_OUTPUT_BYTES) throw createHttpError(413, "无损预览超过输出大小限制");
  let thumbnail;
  try { thumbnail = await sharp(source, { limitInputPixels: MAX_PIXELS, failOn: "error", animated: false }).autoOrient().resize({ width: 320, height: 180, fit: "inside", withoutEnlargement: true }).webp({ quality: 68 }).toBuffer(); }
  catch (_) { throw createHttpError(422, "无法生成安全缩略图"); }
  if (output.data.equals(source)) throw createHttpError(422, "安全预览与源文件字节相同，已拒绝发送");
  return { buffer: output.data, thumbnail, width: output.info.width, height: output.info.height, format, mime };
}

function cachePath(key) { return path.join(CACHE_DIR, key + ".preview"); }

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fsSync.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function persistPreview(key, buffer, thumbnail, width, height, format, mime) {
  await ensurePrivateDirectory(CACHE_DIR);
  const target = cachePath(key);
  const thumbnailPath = path.join(CACHE_DIR, key + ".thumb.webp");
  const temp = target + "." + crypto.randomUUID() + ".tmp";
  const thumbnailTemp = thumbnailPath + "." + crypto.randomUUID() + ".tmp";
  const manifestPath = target + ".json";
  const outputHash = crypto.createHash("sha256").update(buffer).digest("hex");
  const thumbnailHash = crypto.createHash("sha256").update(thumbnail).digest("hex");
  try {
    const handle = await fs.open(temp, "wx", 0o600);
    try { await handle.writeFile(buffer); } finally { await handle.close(); }
    try { await fs.rename(temp, target); }
    catch (error) { if (error.code !== "EEXIST") throw error; await fs.rm(temp, { force: true }); }
    const thumbHandle = await fs.open(thumbnailTemp, "wx", 0o600);
    try { await thumbHandle.writeFile(thumbnail); } finally { await thumbHandle.close(); }
    try { await fs.rename(thumbnailTemp, thumbnailPath); }
    catch (error) { if (error.code !== "EEXIST") throw error; await fs.rm(thumbnailTemp, { force: true }); }
    const manifestTemp = manifestPath + "." + crypto.randomUUID() + ".tmp";
    const manifestHandle = await fs.open(manifestTemp, "wx", 0o600);
    try { await manifestHandle.writeFile(JSON.stringify({ version: CONVERSION_VERSION, key, outputHash, size: buffer.length, format, mime, width, height, thumbnailHash, thumbnailSize: thumbnail.length })); }
    finally { await manifestHandle.close(); }
    try { await fs.rename(manifestTemp, manifestPath); }
    catch (error) { await fs.rm(manifestTemp, { force: true }).catch(() => {}); if (error.code !== "EEXIST") throw error; }
    return { path: target, thumbnailPath, size: buffer.length, thumbnailSize: thumbnail.length, outputHash, thumbnailHash };
  } catch (error) {
    await fs.rm(temp, { force: true }).catch(() => {});
    await fs.rm(thumbnailTemp, { force: true }).catch(() => {});
    throw error;
  }
}

async function loadVerifiedCache(key, digest) {
  const target = cachePath(key);
  const thumbnailPath = path.join(CACHE_DIR, key + ".thumb.webp");
  const manifestPath = target + ".json";
  try {
    const [stat, thumbnailStat, manifestStat] = await Promise.all([fs.lstat(target), fs.lstat(thumbnailPath), fs.lstat(manifestPath)]);
    if (!stat.isFile() || stat.isSymbolicLink() || !thumbnailStat.isFile() || thumbnailStat.isSymbolicLink() || !manifestStat.isFile() || manifestStat.isSymbolicLink() || stat.size <= 0 || stat.size > MAX_OUTPUT_BYTES) throw new Error("invalid cache files");
    const signature = [stat.ino, stat.size, stat.mtimeMs, thumbnailStat.ino, thumbnailStat.size, thumbnailStat.mtimeMs, manifestStat.ino, manifestStat.size, manifestStat.mtimeMs].join(":");
    const verified = verifiedCache.get(key);
    if (verified && verified.signature === signature) return { ...verified.preview, sha256: digest };
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    if (manifest.version !== CONVERSION_VERSION || manifest.key !== key || !["webp", "png"].includes(manifest.format) || manifest.mime !== (manifest.format === "png" ? "image/png" : "image/webp") || manifest.size !== stat.size || manifest.thumbnailSize !== thumbnailStat.size || !Number.isInteger(manifest.width) || !Number.isInteger(manifest.height)) throw new Error("invalid cache manifest");
    if (manifest.outputHash === digest || await hashFile(target) !== manifest.outputHash || await hashFile(thumbnailPath) !== manifest.thumbnailHash) throw new Error("cache checksum mismatch");
    const meta = await require("sharp")(target, { limitInputPixels: MAX_PIXELS, failOn: "error" }).metadata();
    if (meta.format !== manifest.format || meta.width !== manifest.width || meta.height !== manifest.height) throw new Error("cache format mismatch");
    const preview = { path: target, thumbnailPath, size: stat.size, thumbnailSize: thumbnailStat.size, width: meta.width, height: meta.height, format: manifest.format, mime: manifest.mime, sha256: digest, outputHash: manifest.outputHash };
    verifiedCache.set(key, { signature, preview });
    if (verifiedCache.size > 128) verifiedCache.delete(verifiedCache.keys().next().value);
    return preview;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    verifiedCache.delete(key);
    await fs.rm(target, { force: true }).catch(() => {});
    await fs.rm(thumbnailPath, { force: true }).catch(() => {});
    await fs.rm(manifestPath, { force: true }).catch(() => {});
    return null;
  }
}

function convertAndCache(source, namespace = "") {
  const digest = crypto.createHash("sha256").update(source).digest("hex");
  const safeNamespace = String(namespace).replace(/[^a-z0-9_-]/gi, "").slice(0, 24);
  const key = CONVERSION_VERSION + (safeNamespace ? "-" + safeNamespace : "") + "-" + digest;
  if (pending.has(key)) return pending.get(key);
  if (active >= MAX_CONCURRENCY && queue.length >= MAX_QUEUE) throw createHttpError(503, "安全预览任务繁忙，请稍后重试");
  let resolveTask;
  let rejectTask;
  const promise = new Promise((resolve, reject) => { resolveTask = resolve; rejectTask = reject; });
  pending.set(key, promise);
  queue.push(async () => {
    try {
      await ensurePrivateDirectory(CACHE_DIR);
      const prior = await loadVerifiedCache(key, digest);
      if (prior) { resolveTask(prior); return; }
      const converted = await convertBuffer(source);
      const persisted = await persistPreview(key, converted.buffer, converted.thumbnail, converted.width, converted.height, converted.format, converted.mime);
      const preview = { path: persisted.path, thumbnailPath: persisted.thumbnailPath, thumbnailSize: persisted.thumbnailSize, size: converted.buffer.length, width: converted.width, height: converted.height, format: converted.format, mime: converted.mime, sha256: digest, outputHash: persisted.outputHash };
      const [stat, thumbStat, manifestStat] = await Promise.all([fs.lstat(persisted.path), fs.lstat(persisted.thumbnailPath), fs.lstat(persisted.path + ".json")]);
      verifiedCache.set(key, { signature: [stat.ino, stat.size, stat.mtimeMs, thumbStat.ino, thumbStat.size, thumbStat.mtimeMs, manifestStat.ino, manifestStat.size, manifestStat.mtimeMs].join(":"), preview });
      if (verifiedCache.size > 128) verifiedCache.delete(verifiedCache.keys().next().value);
      resolveTask(preview);
    } catch (error) { rejectTask(error.statusCode ? error : createHttpError(503, "安全预览暂时不可用")); }
    finally { pending.delete(key); active -= 1; drainQueue(); }
  });
  drainQueue();
  return promise;
}

async function prepareBuffer(source, options = {}) { return convertAndCache(source, options.namespace || ""); }

function drainResourceQueue() {
  while (activeResourceJobs < MAX_CONCURRENCY && resourceQueue.length) {
    activeResourceJobs += 1;
    resourceQueue.shift()();
  }
}

async function resourceIdentity(item) {
  const value = String(item && item.viewerPath || item && item.originalUrl || "");
  const demo = item && item.sourceType === "backend-demo" && item.id === "demo-panorama";
  const privatePath = privateSourcePath(value);
  const media = require("./media-storage").mediaReference(value);
  const { safeLocalMediaPath } = require("./media");
  const localPath = demo
    ? path.join(__dirname, "public", "demo-panorama.svg")
    : privatePath || safeLocalMediaPath(value);
  if (localPath) {
    try {
      const stat = await fs.lstat(localPath);
      if (!stat.isFile() || stat.isSymbolicLink()) return null;
      return {
        key: "file:" + path.resolve(localPath),
        signature: [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join(":"),
        namespace: demo ? "demo" : ""
      };
    } catch (_) { return null; }
  }
  // Media references use generated UUIDs and are write-once payloads. A remote URL
  // alone is mutable, so it deliberately does not qualify for this memo.
  if (media && ["base64", "sqlite", "cloud"].includes(media.mode)) {
    return { key: "media:" + media.mode + ":" + (media.profileId || "") + ":" + media.id, signature: "immutable", namespace: "" };
  }
  return null;
}

function rememberResource(identity, preview) {
  if (!identity) return;
  resourceMemo.set(identity.key, { signature: identity.signature, digest: preview.sha256, previewKey: previewKey(preview.sha256, identity.namespace) });
  if (resourceMemo.size > 128) resourceMemo.delete(resourceMemo.keys().next().value);
}

function previewKey(digest, namespace = "") {
  const safeNamespace = String(namespace).replace(/[^a-z0-9_-]/gi, "").slice(0, 24);
  return CONVERSION_VERSION + (safeNamespace ? "-" + safeNamespace : "") + "-" + digest;
}

function preparePreview(item) {
  const key = String(item && item.id || "") + "|" + String(item && item.viewerPath || item && item.originalUrl || "");
  if (resourcePending.has(key)) return resourcePending.get(key);
  if (activeResourceJobs >= MAX_CONCURRENCY && resourceQueue.length >= MAX_QUEUE) throw createHttpError(503, "安全预览任务繁忙，请稍后重试");
  let resolveTask;
  let rejectTask;
  const promise = new Promise((resolve, reject) => { resolveTask = resolve; rejectTask = reject; });
  resourcePending.set(key, promise);
  resourceQueue.push(async () => {
    try {
      const identity = await resourceIdentity(item);
      const memo = identity && resourceMemo.get(identity.key);
      if (memo && memo.signature === identity.signature) {
        const verified = await loadVerifiedCache(memo.previewKey, memo.digest);
        if (verified) { resolveTask(verified); return; }
      }
      if (identity) resourceMemo.delete(identity.key);
      const source = await readSource(item);
      const namespace = item && item.sourceType === "backend-demo" && item.id === "demo-panorama" ? "demo" : "";
      const preview = await convertAndCache(source.buffer, namespace);
      rememberResource(identity, preview);
      resolveTask(preview);
    } catch (error) {
      rejectTask(error.statusCode ? error : createHttpError(503, "安全预览暂时不可用"));
    } finally { resourcePending.delete(key); activeResourceJobs -= 1; drainResourceQueue(); }
  });
  drainResourceQueue();
  return promise;
}

async function readPreparedPreview(preview) {
  try { return await fs.readFile(preview.path); }
  catch (_) { throw createHttpError(503, "安全预览暂时不可用"); }
}

async function readPreview(item) {
  const prepared = await preparePreview(item);
  return { buffer: await readPreparedPreview(prepared), width: prepared.width, height: prepared.height, size: prepared.size, sha256: prepared.sha256 };
}

module.exports = { CACHE_DIR, PRIVATE_SOURCE_DIR, CONVERSION_VERSION, MAX_SOURCE_BYTES, MAX_OUTPUT_BYTES, MAX_PIXELS, storePrivateSource, storeRemoteSource, removePrivateSource, readSource, remoteBuffer, convertBuffer, prepareBuffer, preparePreview, readPreparedPreview, readPreview };
