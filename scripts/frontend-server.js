const http = require("http");
const net = require("net");
const path = require("path");
const { applyRuntimeConfig } = require("../lib/runtime-config");
const { resolveStaticPath, streamFile, sendText } = require("../lib/http");

applyRuntimeConfig(process.argv.slice(2));
const consoleSettings = require("../lib/console-settings");

const HOST = process.env.FRONTEND_HOST || "127.0.0.1";
const PORT = Number(process.env.FRONTEND_PORT || 7211);
const ROOT_DIR = path.resolve(__dirname, "..", "frontend");

function resolvePath(requestUrl) {
  return resolveStaticPath(ROOT_DIR, requestUrl, "index.html");
}

function createServer(options = {}) {
  const settingsFilePath = options.settingsFilePath;
  const expectedPort = options.port === undefined ? PORT : Number(options.port);
  function json(res, status, payload) {
    const body = Buffer.from(JSON.stringify(payload));
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": body.length, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin" });
    res.end(body);
  }
  function settingsOrigin(req) {
    if (!net.isIP(String(req.socket && req.socket.remoteAddress || "").replace(/^::ffff:/i, "")) && !/^::1$/.test(String(req.socket && req.socket.remoteAddress || ""))) return null;
    const remote = String(req.socket && req.socket.remoteAddress || "").toLowerCase();
    const loopback = remote === "::1" || remote.startsWith("::ffff:127.") || /^127\./.test(remote);
    if (!loopback) return null;
    const hosts = (req.rawHeaders || []).reduce((items, value, index, all) => index % 2 === 0 && String(value).toLowerCase() === "host" ? items.concat(String(all[index + 1])) : items, []);
    if (hosts.length !== 1 || !hosts[0] || hosts[0].includes(",") || /[\\/?#@%\s]/.test(hosts[0].replace(/^\[|\]$/g, ""))) return null;
    let hostUrl;
    try { hostUrl = new URL("http://" + hosts[0]); } catch (_) { return null; }
    const hostname = hostUrl.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (!new Set(["localhost", "127.0.0.1", "::1"]).has(hostname)) return null;
    const actualPort = Number(hostUrl.port || 80);
    if (expectedPort && actualPort !== expectedPort) return null;
    const origin = "http://" + hostUrl.host;
    if (String(req.headers["sec-fetch-site"] || "").toLowerCase() === "cross-site") return null;
    if (req.headers.origin !== undefined) {
      try { if (String(req.headers.origin) !== new URL(String(req.headers.origin)).origin || new URL(String(req.headers.origin)).origin !== origin) return null; }
      catch (_) { return null; }
    } else if (req.headers.referer) {
      try { if (new URL(String(req.headers.referer)).origin !== origin) return null; }
      catch (_) { return null; }
    } else return null;
    return origin;
  }
  async function handleSettings(req, res) {
    if (!settingsOrigin(req)) {
      if (req.method === "PUT") for await (const _chunk of req) { /* drain before returning */ }
      sendText(res, 403, "Forbidden", { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
      return true;
    }
    if (req.method === "GET") {
      try { json(res, 200, await consoleSettings.readSettings({ filePath: settingsFilePath })); }
      catch (_) { json(res, 500, { ok: false, error: "settings_unavailable" }); }
      return true;
    }
    if (req.method !== "PUT") {
      res.setHeader("Allow", "GET, PUT");
      sendText(res, 405, "Method Not Allowed", { headers: { "Cache-Control": "no-store", "Allow": "GET, PUT" } });
      return true;
    }
    const contentType = String(req.headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
    if (contentType !== "application/json") {
      for await (const _chunk of req) { /* drain before returning */ }
      json(res, 415, { ok: false, error: "json_required" });
      return true;
    }
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 16 * 1024) tooLarge = true;
      else if (!tooLarge) chunks.push(chunk);
    }
    if (tooLarge) { json(res, 413, { ok: false, error: "settings_too_large" }); return true; }
    let patch;
    try { patch = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch (_) { json(res, 400, { ok: false, error: "invalid_json" }); return true; }
    try { json(res, 200, await consoleSettings.patchSettings(patch, { filePath: settingsFilePath })); }
    catch (error) {
      const validation = /^(Unknown console setting|Unknown console plugin|Plugin state|Invalid embedPreset|Invalid toolbarHidden|apiBase must|Settings patch|plugins must)/.test(error.message);
      json(res, validation ? 400 : 500, { ok: false, error: validation ? "invalid_settings" : "settings_write_failed" });
    }
    return true;
  }
  return http.createServer(function onRequest(req, res) {
    const urlPath = String(req.url || "").split("?", 1)[0];
    if (urlPath === "/api/console-settings") { handleSettings(req, res).catch(() => { if (!res.headersSent) json(res, 500, { ok: false, error: "settings_unavailable" }); else res.destroy(); }); return; }
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
