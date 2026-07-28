const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const INPUTS = [
  "package-lock.json",
  "frontend/viewer/psv-entry.js",
  "scripts/build-viewer-vendor.js",
  "scripts/viewer-assets.js"
];
const OUTPUTS = [
  "psv.bundle.js",
  "psv.css",
  "PSV-LICENSE",
  "THREE-LICENSE",
  "THIRD_PARTY_NOTICES.txt"
];

function inputHash(rootDir) {
  const hash = crypto.createHash("sha256");
  INPUTS.forEach((relativePath) => {
    hash.update(relativePath);
    hash.update(fs.readFileSync(path.join(rootDir, relativePath)));
  });
  return hash.digest("hex");
}

function getVendorDir(rootDir) {
  return path.join(rootDir, "frontend", "vendor");
}

function isBuildCurrent(rootDir) {
  const vendorDir = getVendorDir(rootDir);
  const manifestPath = path.join(vendorDir, ".psv-build-manifest.json");
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (manifest.inputHash !== inputHash(rootDir)) return false;
    return OUTPUTS.every((name) => {
      const output = path.join(vendorDir, name);
      return fs.existsSync(output) && fs.statSync(output).size > 0;
    });
  } catch (_) {
    return false;
  }
}

async function buildViewerAssets(rootDir) {
  let esbuild;
  try {
    esbuild = require("esbuild");
  } catch (_) {
    throw new Error("Local Photo Sphere Viewer assets are missing or out of date. Install development dependencies with `npm ci`, then rebuild with `npm run build:vendor`.");
  }

  const vendorDir = getVendorDir(rootDir);
  fs.mkdirSync(vendorDir, { recursive: true });
  await esbuild.build({
    entryPoints: [path.join(rootDir, "frontend", "viewer", "psv-entry.js")],
    bundle: true,
    minify: true,
    format: "iife",
    globalName: "XinTPSV",
    target: ["es2020"],
    outfile: path.join(vendorDir, "psv.bundle.js"),
    legalComments: "none"
  });
  fs.copyFileSync(
    path.join(rootDir, "node_modules", "@photo-sphere-viewer", "core", "index.css"),
    path.join(vendorDir, "psv.css")
  );
  fs.copyFileSync(
    path.join(rootDir, "node_modules", "@photo-sphere-viewer", "core", "LICENSE"),
    path.join(vendorDir, "PSV-LICENSE")
  );
  fs.copyFileSync(
    path.join(rootDir, "node_modules", "three", "LICENSE"),
    path.join(vendorDir, "THREE-LICENSE")
  );
  const threePackage = JSON.parse(fs.readFileSync(path.join(rootDir, "node_modules", "three", "package.json"), "utf8"));
  fs.writeFileSync(
    path.join(vendorDir, "THIRD_PARTY_NOTICES.txt"),
    "Photo Sphere Viewer core 5.15.1 (MIT): see PSV-LICENSE.\n" +
      "Three.js " + threePackage.version + " bundled by Photo Sphere Viewer (MIT): see THREE-LICENSE.\n" +
      "Source package: https://github.com/mistic100/Photo-Sphere-Viewer\n" +
      "Three.js source package: https://github.com/mrdoob/three.js\n",
    "utf8"
  );
  fs.writeFileSync(
    path.join(vendorDir, ".psv-build-manifest.json"),
    JSON.stringify({ inputHash: inputHash(rootDir), outputs: OUTPUTS }, null, 2) + "\n",
    "utf8"
  );
}

async function ensureViewerAssets(options = {}) {
  const rootDir = path.resolve(options.rootDir || path.join(__dirname, ".."));
  if (isBuildCurrent(rootDir)) return { built: false, rootDir };
  await (options.build || buildViewerAssets)(rootDir);
  if (!isBuildCurrent(rootDir)) throw new Error("Photo Sphere Viewer asset build finished without a valid manifest and complete output files.");
  return { built: true, rootDir };
}

module.exports = { INPUTS, OUTPUTS, inputHash, isBuildCurrent, buildViewerAssets, ensureViewerAssets };
