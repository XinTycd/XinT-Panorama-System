const fs = require("fs");
const path = require("path");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
};

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".avif": "image/avif",
  ".txt": "text/plain; charset=utf-8"
};

function getMimeType(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function makeHeaders(headers, enableCors, extraHeaders) {
  return Object.assign({}, enableCors ? CORS_HEADERS : null, headers || {}, extraHeaders || {});
}

function sendJson(res, statusCode, payload, options) {
  res.writeHead(statusCode, makeHeaders({
    "Content-Type": "application/json; charset=utf-8"
  }, options && options.cors, options && options.headers));
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, message, options) {
  res.writeHead(statusCode, makeHeaders({
    "Content-Type": "text/plain; charset=utf-8"
  }, options && options.cors, options && options.headers));
  res.end(message);
}

function sendOptions(res) {
  res.writeHead(204, CORS_HEADERS);
  res.end();
}

function isPathInside(rootDir, targetPath) {
  const relativePath = path.relative(rootDir, targetPath);
  return relativePath === "" || (!!relativePath && !relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function resolveStaticPath(rootDir, requestUrl, fallbackFile) {
  const safeUrl = String(requestUrl || "/").split("?")[0].split("#")[0];
  const relativePath = safeUrl === "/" && fallbackFile ? fallbackFile : safeUrl.replace(/^\/+/, "");
  const absolutePath = path.resolve(rootDir, relativePath);
  return isPathInside(rootDir, absolutePath) ? absolutePath : null;
}

function streamFile(req, res, absolutePath, options) {
  const cors = options && options.cors;
  const brotli = options && options.brotli;
  const vary = brotli ? { "Vary": "Accept-Encoding" } : {};
  const acceptEncoding = String(req?.headers["accept-encoding"] || "");
  const acceptsBrotli = acceptEncoding.split(",").some((entry) => {
    const match = /^\s*br\s*(?:;\s*q\s*=\s*(0(?:\.\d{0,3})?|1(?:\.0{0,3})?))?\s*$/i.exec(entry);
    return match && (match[1] === undefined || Number(match[1]) > 0);
  });

  if (brotli && acceptsBrotli) {
    const compressedPath = absolutePath + ".br";
    fs.stat(compressedPath, (error, stats) => {
      if (!error && stats.isFile()) sendFile(compressedPath, stats, "br");
      else openOriginal();
    });
  } else {
    openOriginal();
  }

  function openOriginal() {
    fs.stat(absolutePath, (error, stats) => {
      if (error || !stats.isFile()) {
        sendText(res, 404, "Not Found", { cors: cors, headers: options && options.headers });
        return;
      }
      sendFile(absolutePath, stats);
    });
  }

  function sendFile(filePath, stats, encoding) {
    const etag = 'W/"' + stats.size + "-" + Math.floor(stats.mtimeMs) + (encoding ? "-" + encoding : "") + '"';
    const headers = makeHeaders({
      ...vary,
      ...(encoding ? { "Content-Encoding": encoding } : {}),
      "Content-Type": getMimeType(absolutePath),
      "Content-Length": stats.size,
      "Last-Modified": stats.mtime.toUTCString(),
      "ETag": etag,
      "Cache-Control": options && options.cacheControl ? options.cacheControl : "no-cache"
    }, cors, options && options.headers);

    const requestEtag = req && req.headers["if-none-match"];
    const requestModifiedSince = req && req.headers["if-modified-since"];
    const isFresh = requestEtag ? requestEtag === etag : requestModifiedSince === headers["Last-Modified"];

    if (req && isFresh) {
      const notModifiedHeaders = Object.assign({}, headers);
      delete notModifiedHeaders["Content-Length"];
      res.writeHead(304, notModifiedHeaders);
      res.end();
      return;
    }

    if (req && req.method === "HEAD") {
      res.writeHead(200, headers);
      res.end();
      return;
    }

    res.writeHead(200, headers);
    fs.createReadStream(filePath)
      .on("error", function onReadError() {
        if (!res.headersSent) {
          sendText(res, 500, "File read failed", { cors: cors, headers: options && options.headers });
        } else {
          res.destroy();
        }
      })
      .pipe(res);
  }
}

module.exports = {
  CORS_HEADERS,
  MIME_TYPES,
  getMimeType,
  sendJson,
  sendText,
  sendOptions,
  resolveStaticPath,
  streamFile
};
