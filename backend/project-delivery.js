const crypto = require("crypto");
const fs = require("fs");
const { resolveLocalMediaPath } = require("./media");
const { mediaReference, hasLocalImagePayload, readImagePayload } = require("./media-storage");

const INTEGRITY_SCHEMA = "xint-trusted-delivery@1";

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.keys(value).sort().reduce(function sortObject(result, key) {
    result[key] = canonicalize(value[key]);
    return result;
  }, {});
}

function digestValue(value) {
  return crypto.createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function isRemoteAsset(item) {
  const viewerPath = String(item && item.viewerPath || "");
  const originalUrl = String(item && item.originalUrl || "");
  return /^https?:\/\//i.test(viewerPath) ||
    /^https?:\/\//i.test(originalUrl) ||
    String(item && item.sourceType || "") === "remote-url";
}

function isCloudImage(item) {
  return mediaReference(item.viewerPath)?.mode === "cloud";
}

function createCheck(id, level, title, detail, entityId) {
  return {
    id: id,
    level: level,
    title: title,
    detail: detail,
    entityId: entityId || null
  };
}

function analyzeProject(projectPackage, galleryItems, storageDir) {
  const source = projectPackage || {};
  const project = source.project || null;
  const scenes = Array.isArray(source.scenes) ? source.scenes : [];
  const hotspots = Array.isArray(source.hotspots) ? source.hotspots : [];
  const gallery = Array.isArray(galleryItems) ? galleryItems : [];
  const galleryById = new Map(gallery.map(function mapGalleryItem(item) {
    return [item.id, item];
  }));
  const scenesById = new Map(scenes.map(function mapScene(scene) {
    return [scene.id, scene];
  }));
  const checks = [];
  const referencedAssetIds = new Set();
  const duplicateSceneNames = {};
  const remoteReported = new Set();
  let remoteDependencyCount = 0;

  if (!project) {
    checks.push(createCheck("PROJECT_MISSING", "error", "项目不存在", "无法生成交付报告。"));
  }

  if (!scenes.length) {
    checks.push(createCheck("SCENES_EMPTY", "error", "项目还没有场景", "至少加入一个全景场景后才能交付。"));
  }

  scenes.forEach(function inspectScene(scene) {
    const normalizedName = String(scene.name || "").trim().toLowerCase();
    if (normalizedName) {
      duplicateSceneNames[normalizedName] = (duplicateSceneNames[normalizedName] || 0) + 1;
    }

    if (!scene.panoramaId) {
      checks.push(createCheck(
        "SCENE_PANORAMA_MISSING",
        "error",
        "场景未关联全景图",
        "场景“" + scene.name + "”没有可展示的全景资源。",
        scene.id
      ));
      return;
    }

    referencedAssetIds.add(scene.panoramaId);
    const asset = galleryById.get(scene.panoramaId);
    if (!asset) {
      checks.push(createCheck(
        "ASSET_REFERENCE_BROKEN",
        "error",
        "场景资源引用已失效",
        "场景“" + scene.name + "”关联的资源不在图库中。",
        scene.id
      ));
      return;
    }

    const media = mediaReference(asset.viewerPath);
    if (media?.mode === "client") {
      checks.push(createCheck("CLIENT_ASSET_UNAVAILABLE", "error", "图片仅保存在浏览器中",
        "资源“" + asset.name + "”仅在原浏览器可见。请上传到服务端或 SQLite，再替换项目场景中的图片。", asset.id));
      return;
    }

    if (media && ["base64", "sqlite"].includes(media.mode) && !hasLocalImagePayload(media)) {
      checks.push(createCheck("LOCAL_ASSET_MISSING", "error", "图片内容不存在",
        "资源“" + asset.name + "”对应的 Base64 内容无法读取。", asset.id));
    }

    if ((isRemoteAsset(asset) || isCloudImage(asset)) && !remoteReported.has(asset.id)) {
      remoteReported.add(asset.id);
      remoteDependencyCount = remoteReported.size;
      checks.push(createCheck(
        "REMOTE_ASSET_DEPENDENCY",
        "warning",
        "存在外部图片依赖",
        "资源“" + asset.name + "”需要访问外部地址，离线环境中可能不可用。",
        asset.id
      ));
    }

    const localMediaPath = resolveLocalMediaPath(storageDir, asset.viewerPath);
    if (localMediaPath && !isReadableFile(localMediaPath)) {
      checks.push(createCheck(
        "LOCAL_ASSET_MISSING",
        "error",
        "本地图片文件不可用",
        "资源“" + asset.name + "”对应的路径缺失、不可读或不是文件。",
        asset.id
      ));
    }

    if (!asset.width || !asset.height) {
      checks.push(createCheck(
        "ASSET_DIMENSIONS_UNKNOWN",
        "warning",
        "图片尺寸尚未入库",
        "资源“" + asset.name + "”缺少宽高信息，无法自动确认是否为标准 2:1 全景图。",
        asset.id
      ));
    } else {
      const ratio = Number(asset.width) / Number(asset.height);
      if (Math.abs(ratio - 2) > 0.05) {
        checks.push(createCheck(
          "ASSET_RATIO_UNUSUAL",
          "warning",
          "图片比例不是标准 2:1",
          "资源“" + asset.name + "”的宽高比为 " + ratio.toFixed(2) + "，预览可能出现拉伸。",
          asset.id
        ));
      }
    }
  });

  Object.keys(duplicateSceneNames).forEach(function reportDuplicateName(name) {
    if (duplicateSceneNames[name] > 1) {
      checks.push(createCheck(
        "SCENE_NAME_DUPLICATED",
        "warning",
        "存在同名场景",
        "场景名称“" + name + "”重复 " + duplicateSceneNames[name] + " 次，交付后不利于定位。"
      ));
    }
  });

  hotspots.forEach(function inspectHotspot(hotspot) {
    if (!scenesById.has(hotspot.sceneId)) {
      checks.push(createCheck(
        "HOTSPOT_SCENE_BROKEN",
        "error",
        "热点所属场景不存在",
        "热点“" + hotspot.title + "”无法关联到有效场景。",
        hotspot.id
      ));
    }
    if (hotspot.type === "scene" && !scenesById.has(hotspot.targetSceneId)) {
      checks.push(createCheck(
        "HOTSPOT_TARGET_BROKEN",
        "error",
        "场景跳转目标不存在",
        "热点“" + hotspot.title + "”的目标场景已失效。",
        hotspot.id
      ));
    }
  });

  if (scenes.length > 1) {
    const reachable = new Set();
    const firstSceneId = scenes[0].id;
    const outgoing = new Map();
    hotspots.forEach(function collectValidNavigation(hotspot) {
      const from = scenesById.get(hotspot.sceneId);
      const to = scenesById.get(hotspot.targetSceneId);
      if (hotspot.type !== "scene" || !from || !to || from.id === to.id) return;
      if (!outgoing.has(from.id)) outgoing.set(from.id, []);
      outgoing.get(from.id).push(to.id);
    });
    const queue = [firstSceneId];
    reachable.add(firstSceneId);
    while (queue.length) {
      const current = queue.shift();
      (outgoing.get(current) || []).forEach(function visit(targetId) {
        if (reachable.has(targetId)) return;
        reachable.add(targetId);
        queue.push(targetId);
      });
    }
    scenes.forEach(function reportUnreachable(scene) {
      if (reachable.has(scene.id)) return;
      checks.push(createCheck(
        "SCENE_UNREACHABLE",
        "warning",
        "场景无法从默认场景到达",
        "场景“" + scene.name + "”没有从默认首场景出发的有效跳转路径。",
        scene.id
      ));
    });
  }

  if (!checks.length) {
    checks.push(createCheck(
      "DELIVERY_BASELINE_PASSED",
      "success",
      "基础交付检查全部通过",
      "项目结构、资源引用与离线依赖均未发现问题。"
    ));
  }

  const summary = checks.reduce(function summarize(result, check) {
    result[check.level] += 1;
    return result;
  }, { error: 0, warning: 0, success: 0 });
  const score = Math.max(0, 100 - summary.error * 20 - summary.warning * 5);

  return {
    schema: INTEGRITY_SCHEMA,
    generatedAt: new Date().toISOString(),
    projectId: project && project.id || null,
    score: score,
    ready: summary.error === 0,
    offlineSafe: remoteDependencyCount === 0,
    summary: summary,
    stats: {
      scenes: scenes.length,
      hotspots: hotspots.length,
      referencedAssets: referencedAssetIds.size,
      remoteDependencies: remoteDependencyCount
    },
    checks: checks
  };
}

function hashFile(filePath) {
  return new Promise(function calculateHash(resolve, reject) {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", function updateHash(chunk) {
      hash.update(chunk);
    });
    stream.on("end", function finishHash() {
      resolve(hash.digest("hex"));
    });
    stream.on("error", reject);
  });
}

function isReadableFile(filePath) {
  try {
    if (!fs.statSync(filePath).isFile()) return false;
    fs.accessSync(filePath, fs.constants.R_OK);
    return true;
  } catch (error) {
    return false;
  }
}

async function buildAssetManifest(projectPackage, galleryItems, storageDir) {
  const scenes = Array.isArray(projectPackage && projectPackage.scenes) ? projectPackage.scenes : [];
  const gallery = Array.isArray(galleryItems) ? galleryItems : [];
  const galleryById = new Map(gallery.map(function mapGalleryItem(item) {
    return [item.id, item];
  }));
  const assetIds = Array.from(new Set(scenes.map(function getPanoramaId(scene) {
    return scene.panoramaId;
  }).filter(Boolean))).sort();
  const assets = [];

  for (const assetId of assetIds) {
    const item = galleryById.get(assetId);
    if (!item) {
      assets.push({ id: assetId, status: "missing", sha256: null });
      continue;
    }

    const localMediaPath = resolveLocalMediaPath(storageDir, item.viewerPath);
    const ref = mediaReference(item.viewerPath);
    let checksum = null;
    let status = isRemoteAsset(item) || ref?.mode === "cloud" ? "remote" : "metadata-only";
    if (ref && ["base64", "sqlite"].includes(ref.mode)) {
      try {
        const image = await readImagePayload(item.viewerPath);
        status = image ? "local" : "missing";
        if (image) checksum = crypto.createHash("sha256").update(image.buffer).digest("hex");
      } catch (_) {
        status = "missing";
      }
    }
    if (localMediaPath) {
      status = isReadableFile(localMediaPath) ? "local" : "missing";
      if (status === "local") {
        try {
          checksum = await hashFile(localMediaPath);
        } catch (error) {
          status = "missing";
          checksum = null;
        }
      }
    }

    assets.push({
      id: item.id,
      panoramaNo: Number(item.panoramaNo) || null,
      name: item.name,
      sourceType: item.sourceType,
      viewerPath: item.viewerPath,
      size: item.size || null,
      status: status,
      sha256: checksum
    });
  }

  return assets;
}

async function createReleaseSnapshot(projectPackage, galleryItems, storageDir) {
  const snapshot = Object.assign({}, projectPackage, {
    assets: await buildAssetManifest(projectPackage, galleryItems, storageDir)
  });
  const digest = digestValue(snapshot);
  const assetStatusCounts = snapshot.assets.reduce(function countStatuses(counts, asset) {
    counts[asset.status] = (counts[asset.status] || 0) + 1;
    return counts;
  }, {});

  snapshot.integrity = {
    schema: INTEGRITY_SCHEMA,
    algorithm: "sha256",
    digest: digest,
    generatedAt: new Date().toISOString(),
    assetCount: snapshot.assets.length,
    assetStatusCounts: assetStatusCounts,
    unverifiedAssetCount: (assetStatusCounts.remote || 0) + (assetStatusCounts["metadata-only"] || 0)
  };
  return snapshot;
}

async function verifyReleaseSnapshot(snapshot, storageDir) {
  if (!snapshot || !snapshot.integrity || snapshot.integrity.algorithm !== "sha256") {
    return {
      verified: false,
      snapshotVerified: false,
      assetsVerified: false,
      reason: "发布版本不包含受支持的完整性清单",
      assetResults: []
    };
  }

  const snapshotBody = Object.assign({}, snapshot);
  delete snapshotBody.integrity;
  const actualDigest = digestValue(snapshotBody);
  const snapshotVerified = actualDigest === snapshot.integrity.digest;
  const assetResults = [];

  for (const asset of Array.isArray(snapshot.assets) ? snapshot.assets : []) {
    if (!asset.sha256) {
      if (asset.status === "missing" || asset.status === "local") {
        assetResults.push({
          id: asset.id,
          status: asset.status,
          verified: false,
          verification: "failed",
          reason: asset.status === "missing" ? "文件不存在" : "本地文件缺少快照指纹"
        });
        continue;
      }
      assetResults.push({
        id: asset.id,
        status: asset.status,
        verified: null,
        verification: "not-checked",
        reason: asset.status === "remote" ? "远程资源不包含本地文件指纹" : null
      });
      continue;
    }

    try {
      const ref = mediaReference(asset.viewerPath);
      let currentChecksum;
      if (ref && ["base64", "sqlite"].includes(ref.mode)) {
        const image = await readImagePayload(asset.viewerPath);
        if (image) currentChecksum = crypto.createHash("sha256").update(image.buffer).digest("hex");
      } else {
        const localMediaPath = resolveLocalMediaPath(storageDir, asset.viewerPath);
        if (localMediaPath && isReadableFile(localMediaPath)) currentChecksum = await hashFile(localMediaPath);
      }
      if (!currentChecksum) {
        assetResults.push({ id: asset.id, status: "missing", verified: false, verification: "failed", reason: "文件不存在" });
        continue;
      }
      assetResults.push({
        id: asset.id,
        status: "local",
        verified: currentChecksum === asset.sha256,
        verification: currentChecksum === asset.sha256 ? "verified" : "failed",
        reason: currentChecksum === asset.sha256 ? null : "本地文件与快照不一致"
      });
    } catch (error) {
      assetResults.push({ id: asset.id, status: "missing", verified: false, verification: "failed", reason: "文件无法读取" });
    }
  }

  const assetsVerified = assetResults.every(function isVerified(item) {
    return item.verified !== false;
  });
  const allAssetsVerified = assetResults.every(function isFullyVerified(item) {
    return item.verified === true;
  });
  const assetStatusCounts = assetResults.reduce(function countStatuses(counts, item) {
    counts[item.status] = (counts[item.status] || 0) + 1;
    return counts;
  }, {});
  return {
    verified: snapshotVerified && assetsVerified,
    snapshotVerified: snapshotVerified,
    assetsVerified: assetsVerified,
    allAssetsVerified: allAssetsVerified,
    expectedDigest: snapshot.integrity.digest,
    actualDigest: actualDigest,
    assetResults: assetResults,
    assetStatusCounts: assetStatusCounts,
    unverifiedAssetCount: (assetStatusCounts.remote || 0) + (assetStatusCounts["metadata-only"] || 0)
  };
}

module.exports = {
  INTEGRITY_SCHEMA,
  analyzeProject,
  createReleaseSnapshot,
  verifyReleaseSnapshot
};
