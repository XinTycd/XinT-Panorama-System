const http = require("http");
const fs = require("fs");
const path = require("path");

const HOST = process.env.FRONTEND_HOST || "127.0.0.1";
const PORT = Number(process.env.FRONTEND_PORT || 7211);
const ROOT_DIR = path.resolve(__dirname, "..", "frontend");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function resolvePath(requestUrl) {
  const safeUrl = String(requestUrl || "/").split("?")[0].split("#")[0];
  const relativePath = safeUrl === "/" ? "index.html" : safeUrl.replace(/^\/+/, "");
  const absolutePath = path.resolve(ROOT_DIR, relativePath);
  if (absolutePath.toLowerCase().indexOf(ROOT_DIR.toLowerCase()) !== 0) {
    return null;
  }
  return absolutePath;
}

function createServer() {
  return http.createServer(function onRequest(req, res) {
    const absolutePath = resolvePath(req.url);
    if (!absolutePath) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Forbidden");
      return;
    }

    fs.readFile(absolutePath, function onRead(error, buffer) {
      if (error) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not Found");
        return;
      }

      res.writeHead(200, {
        "Content-Type": MIME_TYPES[path.extname(absolutePath).toLowerCase()] || "application/octet-stream"
      });
      res.end(buffer);
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
