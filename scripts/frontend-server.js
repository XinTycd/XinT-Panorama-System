const http = require("http");
const path = require("path");
const { resolveStaticPath, streamFile, sendText } = require("../lib/http");

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

    streamFile(req, res, absolutePath, {
      cacheControl: absolutePath.indexOf(path.join("frontend", "vendor")) > -1
        ? "public, max-age=31536000, immutable"
        : "no-cache"
    });
  });
}

if (require.main === module) {
  const server = createServer();
  server.listen(PORT, HOST, function onListen() {
    console.log("XinT-Panorama-System Frontend started");
    console.log("Local: http://" + HOST + ":" + PORT);
  });
}

module.exports = {
  HOST,
  PORT,
  createServer
};
