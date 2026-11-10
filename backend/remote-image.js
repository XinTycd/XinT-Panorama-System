const dns = require("dns").promises;
const net = require("net");
const { URL } = require("url");
const { createHttpError } = require("./api-http");

const REMOTE_IMAGE_MAX_BYTES = Number(process.env.PANORAMA_REMOTE_IMAGE_MAX_BYTES || 30 * 1024 * 1024);
const REMOTE_IMAGE_TIMEOUT_MS = Number(process.env.PANORAMA_REMOTE_IMAGE_TIMEOUT_MS || 10000);
const REMOTE_IMAGE_ALLOWLIST = String(process.env.PANORAMA_REMOTE_IMAGE_ALLOWLIST || "")
  .split(",").map((host) => host.trim().toLowerCase()).filter(Boolean);
const globalIpv6 = new net.BlockList();
globalIpv6.addSubnet("2000::", 3, "ipv6");
const blockedIpv6 = new net.BlockList();
[ ["::", 128], ["::1", 128], ["::ffff:0:0", 96], ["100::", 64], ["2001::", 23], ["2001:db8::", 32], ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8] ]
  .forEach(([address, prefix]) => blockedIpv6.addSubnet(address, prefix, "ipv6"));

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
      (octets[0] === 192 && octets[1] === 0 && octets[2] === 2) ||
      (octets[0] === 192 && octets[1] === 168) ||
      (octets[0] === 198 && (octets[1] === 18 || octets[1] === 19)) ||
      (octets[0] === 198 && octets[1] === 51 && octets[2] === 100) ||
      (octets[0] === 203 && octets[1] === 0 && octets[2] === 113) || octets[0] >= 224;
  }
  if (family === 6) {
    const normalized = address.toLowerCase();
    return !globalIpv6.check(normalized, "ipv6") || blockedIpv6.check(normalized, "ipv6");
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

function createSafeRemoteLookup(lookup = dns.lookup) {
  return function safeRemoteLookup(hostname, options, callback) {
    const requested = options || {};
    const lookupOptions = { all: true, verbatim: true };
    if (requested.family === 4 || requested.family === 6) lookupOptions.family = requested.family;
    if (Number.isInteger(requested.hints)) lookupOptions.hints = requested.hints;
    lookup(hostname, lookupOptions).then(function onLookup(addresses) {
      const safeCandidates = (Array.isArray(addresses) ? addresses : [addresses]).filter((entry) => entry && entry.address);
      if (requested.family === 4 || requested.family === 6) {
        for (let index = safeCandidates.length - 1; index >= 0; index -= 1) {
          if (net.isIP(safeCandidates[index].address) !== requested.family) safeCandidates.splice(index, 1);
        }
      }
      if (!safeCandidates.length || safeCandidates.some((entry) => isPrivateOrReservedAddress(entry.address))) {
        callback(createHttpError(403, "远程图片地址不能指向内网或保留地址"));
        return;
      }
      if (requested.all === true) {
        callback(null, safeCandidates.map((entry) => ({ address: entry.address, family: entry.family || net.isIP(entry.address) })));
        return;
      }
      const address = safeCandidates[0];
      callback(null, address.address, address.family || net.isIP(address.address));
    }).catch(() => callback(createHttpError(502, "远程图片域名解析失败")));
  };
}

const safeRemoteLookup = createSafeRemoteLookup();

module.exports = { isRemoteHttpUrl, assertSafeRemoteUrl, safeRemoteLookup, createSafeRemoteLookup, isPrivateOrReservedAddress };
