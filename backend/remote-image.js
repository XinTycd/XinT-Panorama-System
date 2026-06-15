const http = require("http");
const https = require("https");
const dns = require("dns").promises;
const net = require("net");
const { URL } = require("url");
const { sendText, createHttpError } = require("./api-http");

const REMOTE_IMAGE_MAX_BYTES = Number(process.env.PANORAMA_REMOTE_IMAGE_MAX_BYTES || 30 * 1024 * 1024);
const REMOTE_IMAGE_TIMEOUT_MS = Number(process.env.PANORAMA_REMOTE_IMAGE_TIMEOUT_MS || 10000);
const REMOTE_IMAGE_ALLOWLIST = String(process.env.PANORAMA_REMOTE_IMAGE_ALLOWLIST || "")
  .split(",").map((host) => host.trim().toLowerCase()).filter(Boolean);

function isRemoteHttpUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && !parsed.username && !parsed.password;
  } catch (_) { return false; }
}

function isAllowedRemoteHost(hostname) {
  return REMOTE_IMAGE_ALLOWLIST.some((allowedHost) => hostname === allowedHost || hostname.endsWith("." + allowedHost));
}

function isPrivateOrReservedAddress(address) {
  const family = net.isIP(address);
  if (family === 4) {
    const octets = address.split(".").map(Number);
    return octets[0] === 0 || octets[0] === 10 || octets[0] === 127 ||
      (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127) ||
      (octets[0] === 169 && octets[1] === 254) ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 0 && octets[2] === 0) ||
      (octets[0] === 192 && octets[1] === 168) || octets[0] >= 224;
  }
  if (family === 6) {
    const normalized = address.toLowerCase();
    if (normalized.indexOf("::ffff:") === 0) return isPrivateOrReservedAddress(normalized.slice("::ffff:".length));
    return normalized === "::" || normalized === "::1" || normalized.indexOf("fe80:") === 0 || normalized.indexOf("fc") === 0 || normalized.indexOf("fd") === 0;
  }
  return true;
}

async function assertSafeRemoteUrl(remoteUrl) {
  if (!isRemoteHttpUrl(remoteUrl)) throw createHttpError(400, "远程图片地址必须是无凭证的 http 或 https URL");
  const parsed = new URL(remoteUrl);
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (REMOTE_IMAGE_ALLOWLIST.length && !isAllowedRemoteHost(hostname)) throw createHttpError(403, "远程图片地址不在允许来源列表中");
  const addresses = net.isIP(hostname) ? [{ address: hostname }] : await dns.lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((item) => isPrivateOrReservedAddress(item.address))) {
    throw createHttpError(403, "远程图片地址不能指向内网或保留地址");
  }
  return parsed;
}

function safeRemoteLookup(hostname, options, callback) {
  dns.lookup(hostname, { all: true, verbatim: true }).then(function onLookup(addresses) {
    const address = addresses.find((item) => !isPrivateOrReservedAddress(item.address));
    if (!address) return callback(createHttpError(403, "远程图片地址不能指向内网或保留地址"));
    callback(null, address.address, net.isIP(address.address));
  }).catch(() => callback(createHttpError(502, "远程图片域名解析失败")));
}

async function handleProxy(req, res, remoteUrl, redirectDepth) {
  const target = await assertSafeRemoteUrl(remoteUrl);
  const transport = target.protocol === "https:" ? https : http;
  await new Promise(function requestRemote(resolve) {
    let completed = false;
    function finish() { if (!completed) { completed = true; resolve(); } }
    const remoteRequest = transport.get(target, { headers: { Accept: "image/*" }, lookup: safeRemoteLookup }, function onResponse(proxyRes) {
      if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location && redirectDepth < 3) {
        proxyRes.resume();
        handleProxy(req, res, new URL(proxyRes.headers.location, target).toString(), redirectDepth + 1)
          .then(finish).catch((error) => { sendText(res, error.statusCode || 502, error.message || "远程图片跳转失败"); finish(); });
        return;
      }
      if (proxyRes.statusCode !== 200) { proxyRes.resume(); sendText(res, 502, "远程图片不可用"); finish(); return; }
      const contentType = String(proxyRes.headers["content-type"] || "").split(";")[0].toLowerCase();
      const contentLength = Number(proxyRes.headers["content-length"] || 0);
      if (contentType.indexOf("image/") !== 0 || (contentLength && contentLength > REMOTE_IMAGE_MAX_BYTES)) {
        proxyRes.resume(); sendText(res, 502, "远程资源不是允许大小范围内的图片"); finish(); return;
      }
      let totalBytes = 0;
      res.writeHead(200, { "Content-Type": contentType, "Cache-Control": "public, max-age=60", "Access-Control-Allow-Origin": "*" });
      proxyRes.on("data", function onData(chunk) {
        totalBytes += chunk.length;
        if (totalBytes > REMOTE_IMAGE_MAX_BYTES) { proxyRes.destroy(); res.destroy(); finish(); return; }
        res.write(chunk);
      });
      proxyRes.on("end", function onEnd() { if (!res.destroyed) res.end(); finish(); });
      proxyRes.on("error", function onError() { if (!res.headersSent) sendText(res, 502, "远程图片读取失败"); else res.destroy(); finish(); });
    });
    remoteRequest.setTimeout(REMOTE_IMAGE_TIMEOUT_MS, () => remoteRequest.destroy(new Error("远程图片请求超时")));
    remoteRequest.on("error", function onError() { if (!res.headersSent) sendText(res, 502, "远程图片请求失败"); finish(); });
  });
}

module.exports = { isRemoteHttpUrl, assertSafeRemoteUrl, handleProxy };
