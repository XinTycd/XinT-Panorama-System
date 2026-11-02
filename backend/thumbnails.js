const { safeLocalMediaPath } = require("./media");
const { mediaReference, readImagePayload } = require("./media-storage");
const fs = require("node:fs/promises");

const THUMBNAIL_LIMIT = 128;
const THUMBNAIL_CONCURRENCY = 2;
const THUMBNAIL_QUEUE_LIMIT = 24;
const cache = new Map();
const pending = new Map();
const queue = [];
let active = 0;

function canGenerateThumbnail(item) {
  if (!item || item.sourceType !== "uploaded-base64" || (item.thumbnailPath && item.thumbnailPath !== item.viewerPath)) return false;
  const ref = mediaReference(item.viewerPath);
  if (ref) return ref.mode === "base64" || ref.mode === "sqlite";
  return /^\/media\/uploads\/[^/]+\.(?:jpe?g|png|webp|avif|gif)$/i.test(item.viewerPath);
}

async function generateThumbnail(viewerPath) {
  const ref = mediaReference(viewerPath);
  let source;
  if (ref) {
    const image = await readImagePayload(viewerPath);
    if (image && /^image\/(?:jpeg|png|webp|avif|gif)$/.test(image.mime)) source = image.buffer;
  } else {
    const localPath = safeLocalMediaPath(viewerPath);
    if (localPath) source = await fs.readFile(localPath);
  }
  if (!source) return null;
  const sharp = require("sharp");
  return sharp(source, { limitInputPixels: 100_000_000, failOn: "error" })
    .autoOrient()
    .resize({ width: 320, height: 180, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 68 })
    .toBuffer();
}

function drainQueue() {
  while (active < THUMBNAIL_CONCURRENCY && queue.length) {
    const start = queue.shift();
    active += 1;
    start();
  }
}

function readThumbnail(item) {
  const key = item.viewerPath;
  if (cache.has(key)) {
    const thumbnail = cache.get(key);
    cache.delete(key);
    cache.set(key, thumbnail);
    return thumbnail;
  }
  if (pending.has(key)) return pending.get(key);
  if (queue.length >= THUMBNAIL_QUEUE_LIMIT) return null;

  const task = new Promise((resolve) => {
    queue.push(async () => {
      try {
        const thumbnail = await generateThumbnail(key);
        if (thumbnail) {
          cache.set(key, thumbnail);
          if (cache.size > THUMBNAIL_LIMIT) cache.delete(cache.keys().next().value);
        }
        resolve(thumbnail);
      } catch (_) {
        resolve(null);
      } finally {
        pending.delete(key);
        active -= 1;
        drainQueue();
      }
    });
  });
  pending.set(key, task);
  drainQueue();
  return task;
}

module.exports = { canGenerateThumbnail, readThumbnail };
