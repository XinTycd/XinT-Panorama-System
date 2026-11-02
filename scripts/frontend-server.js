const http = require("http");
const path = require("path");
const { applyRuntimeConfig } = require("../lib/runtime-config");
const { resolveStaticPath, streamFile, sendText } = require("../lib/http");

applyRuntimeConfig(process.argv.slice(2));

const HOST = process.env.FRONTEND_HOST || "127.0.0.1";
const PORT = Number(process.env.FRONTEND_PORT || 7211);
const ROOT_DIR = path.resolve(__dirname, "..", "frontend");

function resolvePath(requestUrl) {
  return resolveStaticPath(ROOT_DIR, requestUrl, "index.html");
}

function createServer() {
  return http.createServer(function onRequest(req, res) {
    const absolutePath = resolvePath(req.url);
    if (!absolutePath) {
      sendText(res, 403, "Forbidden");
      return;
    }

    const psvAsset = ["psv.bundle.js", "psv.css"].some((name) => absolutePath === path.join(ROOT_DIR, "vendor", name));
    const brotli = psvAsset || absolutePath === path.join(ROOT_DIR, "vendor", "three.min.js");
    const immutable = !psvAsset && absolutePath.startsWith(path.join(ROOT_DIR, "vendor") + path.sep);
    streamFile(req, res, absolutePath, { brotli, cacheControl: immutable ? "public, max-age=31536000, immutable" : "no-cache" });
  });
}

if (require.main === module) {
  require("./viewer-assets").ensureViewerAssets().then(() => {
    const server = createServer();
    server.listen(PORT, HOST, function onListen() {
      console.log("XinT-Panorama-System Frontend started");
      console.log("Local: http://" + HOST + ":" + PORT);
    });
  }).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  HOST,
  PORT,
  createServer
};
