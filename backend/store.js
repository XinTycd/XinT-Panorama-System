const fs = require("fs");
const path = require("path");

const STORAGE_DIR = path.join(__dirname, "storage");
const GALLERY_FILE = path.join(STORAGE_DIR, "gallery.json");

function ensureStorage() {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }

  if (!fs.existsSync(GALLERY_FILE)) {
    fs.writeFileSync(GALLERY_FILE, JSON.stringify({ items: [] }, null, 2), "utf8");
  }
}

function readGallery() {
  ensureStorage();
  const raw = fs.readFileSync(GALLERY_FILE, "utf8");
  const parsed = JSON.parse(raw || '{"items":[]}');
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  const normalized = normalizeGalleryItems(items);

  if (normalized.changed) {
    fs.writeFileSync(GALLERY_FILE, JSON.stringify({ items: normalized.items }, null, 2), "utf8");
  }

  return normalized.items;
}

function writeGallery(items) {
  ensureStorage();
  fs.writeFileSync(GALLERY_FILE, JSON.stringify({ items: items }, null, 2), "utf8");
  return items;
}

function getNextPanoramaNo(items) {
  const currentMax = items.reduce(function findMax(maxValue, item) {
    const numericValue = Number(item && item.panoramaNo);
    if (!Number.isFinite(numericValue)) {
      return maxValue;
    }
    return Math.max(maxValue, numericValue);
  }, 1000);

  return currentMax + 1;
}

function normalizeGalleryItems(items) {
  const normalizedItems = Array.isArray(items) ? items.slice() : [];
  const usedNos = {};
  let nextPanoramaNo = 1001;
  let changed = false;

  normalizedItems.forEach(function collectExistingNos(item) {
    const numericValue = Number(item && item.panoramaNo);
    if (Number.isFinite(numericValue) && numericValue > 0) {
      usedNos[numericValue] = true;
      nextPanoramaNo = Math.max(nextPanoramaNo, numericValue + 1);
    }
  });

  normalizedItems.forEach(function assignMissingNo(item, index) {
    const numericValue = Number(item && item.panoramaNo);
    if (Number.isFinite(numericValue) && numericValue > 0) {
      return;
    }

    while (usedNos[nextPanoramaNo]) {
      nextPanoramaNo += 1;
    }

    normalizedItems[index] = Object.assign({}, item, {
      panoramaNo: nextPanoramaNo
    });
    usedNos[nextPanoramaNo] = true;
    nextPanoramaNo += 1;
    changed = true;
  });

  return {
    changed: changed,
    items: normalizedItems
  };
}

function makeId(prefix) {
  return [
    prefix || "item",
    Date.now().toString(36),
    Math.random().toString(36).slice(2, 8)
  ].join("-");
}

function upsertItem(item) {
  const items = readGallery();
  const index = items.findIndex(function findExisting(existing) {
    return existing.id === item.id || (existing.originalUrl && existing.originalUrl === item.originalUrl);
  });

  if (index >= 0) {
    if (!item.panoramaNo && items[index].panoramaNo) {
      item.panoramaNo = items[index].panoramaNo;
    }
    items[index] = item;
  } else {
    if (!item.panoramaNo) {
      item.panoramaNo = getNextPanoramaNo(items);
    }
    items.push(item);
  }

  writeGallery(items);
  return item;
}

module.exports = {
  STORAGE_DIR,
  GALLERY_FILE,
  ensureStorage,
  readGallery,
  writeGallery,
  getNextPanoramaNo,
  normalizeGalleryItems,
  makeId,
  upsertItem
};
