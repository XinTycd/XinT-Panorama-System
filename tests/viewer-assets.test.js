const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createServer: createFrontendServer } = require("../scripts/frontend-server");
const { createServer: createBackendServer } = require("../backend");
const { INPUTS, OUTPUTS, inputHash, isBuildCurrent, ensureViewerAssets } = require("../scripts/viewer-assets");

async function testMissingAssetBuild() {
  const root = path.resolve(__dirname, "..");
  const tempParent = path.resolve(root, "tests", ".tmp");
  fs.mkdirSync(tempParent, { recursive: true });
  const tempRoot = fs.mkdtempSync(path.join(tempParent, "viewer-assets-"));
  let buildCalls = 0;
  async function fakeBuild(buildRoot) {
    buildCalls += 1;
    const vendorDir = path.join(buildRoot, "frontend", "vendor");
    fs.mkdirSync(vendorDir, { recursive: true });
    OUTPUTS.forEach((name) => fs.writeFileSync(path.join(vendorDir, name), "generated " + name));
    fs.writeFileSync(path.join(vendorDir, ".psv-build-manifest.json"), JSON.stringify({ inputHash: inputHash(buildRoot), outputs: OUTPUTS }));
  }
  try {
    INPUTS.forEach((relativePath) => {
      const destination = path.join(tempRoot, relativePath);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(path.join(root, relativePath), destination);
    });
    assert.equal(isBuildCurrent(tempRoot), false, "A fresh source tree without generated assets must be considered stale");
    assert.equal((await ensureViewerAssets({ rootDir: tempRoot, build: fakeBuild })).built, true);
    assert.equal(buildCalls, 1, "A missing vendor build must trigger generation");
    assert.equal(isBuildCurrent(tempRoot), true);
    assert.equal((await ensureViewerAssets({ rootDir: tempRoot, build: fakeBuild })).built, false, "A valid manifest must avoid repeated builds");
    assert.equal(buildCalls, 1);
    fs.unlinkSync(path.join(tempRoot, "frontend", "vendor", "psv.css"));
    assert.equal((await ensureViewerAssets({ rootDir: tempRoot, build: fakeBuild })).built, true, "A missing output must trigger a rebuild");
    fs.appendFileSync(path.join(tempRoot, "frontend", "viewer", "psv-entry.js"), "\n// source changed");
    assert.equal((await ensureViewerAssets({ rootDir: tempRoot, build: fakeBuild })).built, true, "Changed build inputs must invalidate the manifest");
    assert.equal(buildCalls, 3);
  } finally {
    const relative = path.relative(tempParent, tempRoot);
    if (!relative.startsWith("..") && !path.isAbsolute(relative)) fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function getServerUrl(server) {
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  return `http://127.0.0.1:${server.address().port}`;
}
async function close(server) {
  await new Promise((resolve) => server.close(resolve));
  if (typeof server.closeAllConnections === "function") server.closeAllConnections();
}
async function main() {
  await testMissingAssetBuild();
  const frontend = createFrontendServer();
  const backend = createBackendServer();
  let frontendUrl;
  let backendUrl;
  try {
    frontendUrl = await getServerUrl(frontend);
    backendUrl = await getServerUrl(backend);
    for (const [url, expectedType] of [
      [`${frontendUrl}/vendor/psv.bundle.js`, "javascript"],
      [`${frontendUrl}/vendor/psv.css`, "text/css"],
      [`${backendUrl}/assets/psv.bundle.js`, "javascript"],
      [`${backendUrl}/assets/psv.css`, "text/css"]
    ]) {
      const response = await fetch(url);
      assert.equal(response.status, 200, `${url} should be served`);
      assert(response.headers.get("content-type").includes(expectedType), `${url} should have a browser-readable MIME type`);
      assert.equal(response.headers.get("cache-control"), "no-cache", `${url} should not retain an outdated unversioned viewer build`);
      const body = await response.arrayBuffer();
      assert(body.byteLength > 500, `${url} should return the built asset`);
    }
  } finally {
    if (frontend.listening) await close(frontend);
    if (backend.listening) await close(backend);
  }
  console.log("Viewer asset route tests passed");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
