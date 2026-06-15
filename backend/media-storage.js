const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { STORAGE_DIR, getDatabase } = require("./sqlite");
const { createUploadPath, safeLocalMediaPath } = require("./media");
const { createHttpError } = require("./api-http");

const SETTINGS_FILE = path.join(STORAGE_DIR, "media-settings.json");
const ENCODED_DIR = path.join(STORAGE_DIR, "encoded-images");
const MODES = ["client", "server", "sqlite", "cloud"];
const FORMATS = ["original", "base64", "transcode"];
const CODECS = ["jpeg", "png", "webp"];
const DEFAULTS = { mode: "server", format: "original", codec: "jpeg", quality: 85 };
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const PATH_PATTERN = new RegExp("^/media/(?:(base64|sqlite|client)/|cloud/(" + UUID + ")/)(" + UUID + ")$");
const EXTENSIONS = {
  "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif",
  "image/bmp": ".bmp", "image/avif": ".avif", "image/svg+xml": ".svg"
};
const MAX_IMAGE_BYTES = 22 * 1024 * 1024;
const MAX_CLOUD_IMAGE_BYTES = 6 * 1024 * 1024;
const TABLE = "CREATE TABLE IF NOT EXISTS xint_image_payloads (id TEXT PRIMARY KEY, mime TEXT NOT NULL, base64 TEXT NOT NULL)";

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return { ...DEFAULTS, profileId: null, profiles: {} };
  }
}

function publicSettings(settings) {
  const cloud = settings.profiles[settings.profileId];
  return {
    mode: settings.mode, format: settings.format, codec: settings.codec, quality: settings.quality,
    cloud: { url: cloud ? cloud.url : "", hasToken: Boolean(cloud && cloud.token) }
  };
}

function getMediaStorage() {
  return publicSettings(readSettings());
}

function captureMediaStorage() {
  const { mode, format, codec, quality, profileId } = readSettings();
  return { mode, format, codec, quality, profileId };
}

function cloudUrl(value) {
  try {
    const url = new URL(String(value || "").trim().replace(/^libsql:\/\//i, "https://"));
    if (url.protocol === "https:" && url.hostname.endsWith(".turso.io") && !url.port &&
        !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash) return url.origin;
  } catch (_) {}
  throw createHttpError(400, "请输入 Turso 数据库的 libsql:// 或 HTTPS 地址");
}

let settingsUpdate = Promise.resolve();

function updateMediaStorage(body) {
  const pending = settingsUpdate.then(() => saveSettings(body));
  settingsUpdate = pending.catch(() => {});
  return pending;
}

async function saveSettings(body) {
  const current = readSettings();
  const { mode, format, codec, quality } = { ...publicSettings(current), ...body };
  if (!MODES.includes(mode) || !FORMATS.includes(format) || !CODECS.includes(codec) ||
      !Number.isInteger(quality) || quality < 1 || quality > 100) {
    throw createHttpError(400, "请选择有效的存储模式、图片保存形式、转码格式和质量（1–100）");
  }
  if ((mode === "sqlite" || mode === "cloud") && format === "original") {
    throw createHttpError(400, "SQLite 使用 Base64 保存，请选择 Base64 或转码");
  }

  const next = { ...current, mode, format, codec, quality };
  if (mode === "cloud") {
    const cloud = body.cloud || {};
    const old = current.profiles[current.profileId];
    const url = cloudUrl(cloud.url || (old && old.url));
    const existing = Object.entries(current.profiles).find(([, profile]) => profile.url === url);
    const token = typeof cloud.token === "string" ? cloud.token.trim() : "";
    const profile = { url, token: token || (existing && existing[1].token) };
    if (!profile.token || !/^[!-~]{1,4096}$/.test(profile.token)) throw createHttpError(400, "请输入有效的数据库令牌");
    await cloudQuery(profile, TABLE);
    next.profileId = existing ? existing[0] : randomUUID();
    next.profiles[next.profileId] = profile;
  }

  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  const temp = SETTINGS_FILE + "." + randomUUID() + ".tmp";
  try {
    fs.writeFileSync(temp, JSON.stringify(next, null, 2), { encoding: "utf8", flag: "wx", mode: 0o600 });
    fs.renameSync(temp, SETTINGS_FILE);
  } finally {
    fs.rmSync(temp, { force: true });
  }
  return publicSettings(next);
}

async function cloudQuery(profile, sql, args = []) {
  try {
    const response = await fetch(cloudUrl(profile.url) + "/v2/pipeline", {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(15000),
      headers: { Authorization: "Bearer " + profile.token, "Content-Type": "application/json" },
      body: JSON.stringify({ requests: [
        { type: "execute", stmt: { sql, args: args.map((value) => ({ type: "text", value })) } },
        { type: "close" }
      ] })
    });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const data = await response.json();
    const result = data.results && data.results[0];
    if (!result || result.type !== "ok" || !result.response.result) throw new Error("Invalid database response");
    return result.response.result.rows;
  } catch (_) {
    throw createHttpError(502, "云端 SQLite 操作失败，请检查数据库地址、令牌权限、连接和服务容量");
  }
}

let imageDatabase;

function sqliteImages() {
  const db = getDatabase();
  if (db !== imageDatabase) {
    db.exec(TABLE);
    imageDatabase = db;
  }
  return db;
}

function mediaReference(viewerPath) {
  const match = PATH_PATTERN.exec(String(viewerPath || ""));
  return match ? { mode: match[1] || "cloud", profileId: match[2], id: match[3] } : null;
}

function hasLocalImagePayload(ref) {
  if (ref.mode === "sqlite") {
    return Boolean(sqliteImages().prepare("SELECT 1 FROM xint_image_payloads WHERE id = ?").get(ref.id));
  }
  if (ref.mode === "base64") {
    try {
      return fs.statSync(path.join(ENCODED_DIR, ref.id + ".json")).isFile();
    } catch (error) {
      if (error.code === "ENOENT") return false;
      throw error;
    }
  }
  return false;
}

async function saveServerImage(buffer, mime, name, storage) {
  let width = null;
  let height = null;
  if (!buffer.length || !EXTENSIONS[mime]) throw createHttpError(400, "请选择支持的图片文件");
  if (storage.format === "transcode") {
    try {
      const sharp = require("sharp");
      const input = sharp(buffer, { limitInputPixels: 100_000_000, failOn: "error" }).autoOrient();
      const output = await (storage.codec === "png" ? input.png() : input[storage.codec]({ quality: storage.quality }))
        .toBuffer({ resolveWithObject: true });
      buffer = output.data;
      mime = "image/" + storage.codec;
      width = output.info.width;
      height = output.info.height;
    } catch (_) {
      throw createHttpError(422, "图片转码失败，请检查图片格式、文件完整性或像素尺寸");
    }
  }
  if (buffer.length > MAX_IMAGE_BYTES) throw createHttpError(413, "保存后的图片不能超过 22 MiB");
  if (storage.mode === "cloud" && buffer.length > MAX_CLOUD_IMAGE_BYTES) {
    throw createHttpError(413, "云端 SQLite 图片上限为 6 MiB，可降低转码质量或选择本地存储");
  }

  let viewerPath;
  if (storage.mode === "server" && storage.format !== "base64") {
    const upload = createUploadPath(name, EXTENSIONS[mime]);
    try {
      try { fs.writeFileSync(upload.fd, buffer); }
      finally { fs.closeSync(upload.fd); }
    } catch (error) {
      fs.rmSync(upload.absolutePath, { force: true });
      throw error;
    }
    viewerPath = "/media/uploads/" + encodeURIComponent(upload.fileName);
  } else {
    viewerPath = await saveImagePayload(buffer.toString("base64"), mime, storage);
  }
  return { viewerPath, size: buffer.length, name: name || "全景图", width, height };
}

async function saveImagePayload(base64, mime, storage) {
  const id = randomUUID();
  if (storage.mode === "sqlite") {
    sqliteImages().prepare("INSERT INTO xint_image_payloads (id, mime, base64) VALUES (?, ?, ?)").run(id, mime, base64);
    return "/media/sqlite/" + id;
  }
  if (storage.mode === "cloud") {
    const profile = readSettings().profiles[storage.profileId];
    if (!profile) throw createHttpError(409, "云端 SQLite 配置已变更，请刷新后重试");
    await cloudQuery(profile, "INSERT INTO xint_image_payloads (id, mime, base64) VALUES (?, ?, ?)", [id, mime, base64]);
    return "/media/cloud/" + storage.profileId + "/" + id;
  }
  fs.mkdirSync(ENCODED_DIR, { recursive: true });
  const filePath = path.join(ENCODED_DIR, id + ".json");
  try {
    fs.writeFileSync(filePath, JSON.stringify({ mime, base64 }), { flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") fs.rmSync(filePath, { force: true });
    throw error;
  }
  return "/media/base64/" + id;
}

async function readImagePayload(viewerPath) {
  const ref = mediaReference(viewerPath);
  if (!ref || ref.mode === "client") return null;
  let record;
  if (ref.mode === "base64") {
    try { record = JSON.parse(await fs.promises.readFile(path.join(ENCODED_DIR, ref.id + ".json"), "utf8")); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  } else if (ref.mode === "sqlite") {
    record = sqliteImages().prepare("SELECT mime, base64 FROM xint_image_payloads WHERE id = ?").get(ref.id);
  } else {
    const profile = readSettings().profiles[ref.profileId];
    if (!profile) return null;
    const [row] = await cloudQuery(profile, "SELECT mime, base64 FROM xint_image_payloads WHERE id = ?", [ref.id]);
    if (row) record = { mime: row[0].value, base64: row[1].value };
  }
  if (!record || !EXTENSIONS[record.mime]) return null;
  return { mime: record.mime, buffer: Buffer.from(record.base64, "base64") };
}

async function removeImagePayload(viewerPath) {
  const ref = mediaReference(viewerPath);
  if (!ref) {
    const filePath = safeLocalMediaPath(viewerPath);
    if (filePath) await fs.promises.rm(filePath, { force: true });
    return;
  }
  if (ref.mode === "base64") await fs.promises.rm(path.join(ENCODED_DIR, ref.id + ".json"), { force: true });
  if (ref.mode === "sqlite") sqliteImages().prepare("DELETE FROM xint_image_payloads WHERE id = ?").run(ref.id);
  if (ref.mode === "cloud") {
    const profile = readSettings().profiles[ref.profileId];
    if (profile) await cloudQuery(profile, "DELETE FROM xint_image_payloads WHERE id = ?", [ref.id]);
  }
}

module.exports = {
  getMediaStorage, captureMediaStorage, updateMediaStorage, saveServerImage,
  mediaReference, hasLocalImagePayload, readImagePayload, removeImagePayload
};
