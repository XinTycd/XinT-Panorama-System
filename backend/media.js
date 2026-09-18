const fs = require("fs");
const path = require("path");
const { STORAGE_DIR } = require("./sqlite");

const UPLOADS_DIR = path.join(STORAGE_DIR, "uploads");

function resolveLocalMediaPath(storageDir, viewerPath) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(String(viewerPath || ""));
  } catch (_) {
    return null;
  }
  const match = decodedPath.match(/^\/media\/uploads\/([^/\\]+)$/);
  if (!match || match[1] === "." || match[1] === "..") return null;
  const uploadsDir = path.resolve(storageDir, "uploads");
  const absolutePath = path.resolve(uploadsDir, match[1]);
  if (path.dirname(absolutePath) !== uploadsDir) return null;
  return absolutePath;
}

function safeLocalMediaPath(requestPath) {
  const absolutePath = resolveLocalMediaPath(STORAGE_DIR, requestPath);
  if (!absolutePath) return null;
  try {
    const uploadsDir = path.join(STORAGE_DIR, "uploads");
    const rootInfo = fs.lstatSync(uploadsDir);
    const fileInfo = fs.lstatSync(absolutePath);
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) return null;
    if (!fileInfo.isFile() || fileInfo.isSymbolicLink()) return null;
    const realUploads = fs.realpathSync(uploadsDir);
    const realFile = fs.realpathSync(absolutePath);
    if (path.dirname(realFile) !== realUploads) return null;
    if (![".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".avif", ".svg"].includes(path.extname(realFile).toLowerCase())) return null;
  } catch (_) {
    return null;
  }
  return absolutePath;
}

function clearUploadsDirectory() {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const rootInfo = fs.lstatSync(UPLOADS_DIR);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error("上传目录必须是普通目录");
  for (const fileName of fs.readdirSync(UPLOADS_DIR)) {
    const absolutePath = path.join(UPLOADS_DIR, fileName);
    const info = fs.lstatSync(absolutePath);
    if (info.isDirectory() && !info.isSymbolicLink()) fs.rmSync(absolutePath, { recursive: true });
    else fs.unlinkSync(absolutePath);
  }
}

function stageUploadsClear() {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const rootInfo = fs.lstatSync(UPLOADS_DIR);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error("上传目录必须是普通目录");
  const stagingPath = path.join(STORAGE_DIR, ".uploads-clear-" + process.pid + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8));
  fs.renameSync(UPLOADS_DIR, stagingPath);
  try {
    fs.mkdirSync(UPLOADS_DIR);
  } catch (error) {
    fs.renameSync(stagingPath, UPLOADS_DIR);
    throw error;
  }
  let finished = false;
  return {
    commit: function commit() {
      if (finished) return;
      fs.rmSync(stagingPath, { recursive: true });
      finished = true;
    },
    rollback: function rollback() {
      if (finished) return;
      fs.rmSync(UPLOADS_DIR, { recursive: true, force: true });
      fs.renameSync(stagingPath, UPLOADS_DIR);
      finished = true;
    }
  };
}

function sanitizeFileStem(name) {
  return String(name || "panorama").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/[. ]+$/g, "").replace(/^-|-$/g, "") || "panorama";
}

async function createUploadPathAsync(name, extension) {
  await fs.promises.mkdir(UPLOADS_DIR, { recursive: true });
  const safeStem = sanitizeFileStem(name);
  for (;;) {
    const absolutePath = path.join(UPLOADS_DIR, safeStem + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10) + extension);
    try {
      const handle = await fs.promises.open(absolutePath, "wx");
      return { absolutePath, fileName: path.basename(absolutePath), handle };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
}

module.exports = { UPLOADS_DIR, resolveLocalMediaPath, safeLocalMediaPath, clearUploadsDirectory, stageUploadsClear, createUploadPathAsync };
