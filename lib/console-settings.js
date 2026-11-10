"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const ALLOWED_PLUGINS = new Set(["project-workspace"]);
const ALLOWED_CONTROLS = new Set(["previous", "next", "zoom-out", "zoom-in", "autorotate", "director", "reset", "fullscreen"]);
const PRESETS = new Set(["all", "compact", "none"]);
const CONFIG_FILE = path.join(path.resolve(process.env.PANORAMA_STORAGE_DIR || path.join(__dirname, "..", "backend", "storage")), "console-settings.json");
let writeQueue = Promise.resolve();

function defaultApiBase(env = process.env) {
  const configuredHost = String(env.PANORAMA_HOST || "127.0.0.1").trim();
  const host = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(configuredHost.toLowerCase()) ? configuredHost : "127.0.0.1";
  const portValue = Number(env.PANORAMA_PORT || 7210);
  const port = Number.isInteger(portValue) && portValue >= 1 && portValue <= 65535 ? portValue : 7210;
  const displayHost = host.includes(":") && !host.startsWith("[") ? "[" + host + "]" : host;
  return "http://" + displayHost + ":" + port;
}

function validApiBase(value) {
  if (typeof value !== "string" || !value || value.length > 2048 || value !== value.trim()) return false;
  let url;
  try { url = new URL(value); } catch (_) { return false; }
  if (url.username || url.password || url.search || url.hash || url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (url.protocol === "http:") {
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (!new Set(["localhost", "127.0.0.1", "::1"]).has(host)) return false;
  }
  return true;
}

function validateSettings(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Console settings must be an object");
  const allowedTop = new Set(["apiBase", "plugins", "embedPreset", "toolbarHidden"]);
  for (const key of Object.keys(value)) if (!allowedTop.has(key)) throw new Error("Unknown console setting: " + key);
  if (!validApiBase(value.apiBase)) throw new Error("apiBase must use HTTPS, or HTTP on loopback");
  if (!value.plugins || typeof value.plugins !== "object" || Array.isArray(value.plugins)) throw new Error("plugins must be an object");
  for (const key of Object.keys(value.plugins)) if (!ALLOWED_PLUGINS.has(key)) throw new Error("Unknown console plugin: " + key);
  for (const pluginId of ALLOWED_PLUGINS) if (typeof value.plugins[pluginId] !== "boolean") throw new Error("Plugin state must be boolean: " + pluginId);
  if (!PRESETS.has(value.embedPreset)) throw new Error("Invalid embedPreset");
  if (!Array.isArray(value.toolbarHidden) || value.toolbarHidden.some((name) => typeof name !== "string" || !ALLOWED_CONTROLS.has(name)) || new Set(value.toolbarHidden).size !== value.toolbarHidden.length) throw new Error("Invalid toolbarHidden controls");
  return {
    apiBase: value.apiBase.replace(/\/$/, ""),
    plugins: { "project-workspace": value.plugins["project-workspace"] },
    embedPreset: value.embedPreset,
    toolbarHidden: value.toolbarHidden.slice().sort()
  };
}

function defaults(env = process.env) {
  return { apiBase: defaultApiBase(env), plugins: { "project-workspace": false }, embedPreset: "all", toolbarHidden: [] };
}

async function readSettings(options = {}) {
  const filePath = path.resolve(options.filePath || CONFIG_FILE);
  let text;
  try { text = await fs.readFile(filePath, "utf8"); }
  catch (error) {
    if (error.code === "ENOENT") return defaults(options.env || process.env);
    throw error;
  }
  let parsed;
  try { parsed = JSON.parse(text); }
  catch (_) { throw new Error("Console settings file is invalid JSON"); }
  return validateSettings(parsed);
}

function validatePatch(patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("Settings patch must be an object");
  const allowed = new Set(["apiBase", "plugins", "embedPreset", "toolbarHidden"]);
  for (const key of Object.keys(patch)) if (!allowed.has(key)) throw new Error("Unknown console setting: " + key);
  const normalized = {};
  if (Object.hasOwn(patch, "apiBase")) {
    if (!validApiBase(patch.apiBase)) throw new Error("apiBase must use HTTPS, or HTTP on loopback");
    normalized.apiBase = patch.apiBase.replace(/\/$/, "");
  }
  if (Object.hasOwn(patch, "plugins")) {
    if (!patch.plugins || typeof patch.plugins !== "object" || Array.isArray(patch.plugins)) throw new Error("plugins must be an object");
    for (const [id, enabled] of Object.entries(patch.plugins)) {
      if (!ALLOWED_PLUGINS.has(id)) throw new Error("Unknown console plugin: " + id);
      if (typeof enabled !== "boolean") throw new Error("Plugin state must be boolean: " + id);
      normalized.plugins = { ...(normalized.plugins || {}), [id]: enabled };
    }
  }
  if (Object.hasOwn(patch, "embedPreset")) {
    if (!PRESETS.has(patch.embedPreset)) throw new Error("Invalid embedPreset");
    normalized.embedPreset = patch.embedPreset;
  }
  if (Object.hasOwn(patch, "toolbarHidden")) {
    if (!Array.isArray(patch.toolbarHidden) || patch.toolbarHidden.some((name) => typeof name !== "string" || !ALLOWED_CONTROLS.has(name)) || new Set(patch.toolbarHidden).size !== patch.toolbarHidden.length) throw new Error("Invalid toolbarHidden controls");
    normalized.toolbarHidden = patch.toolbarHidden.slice().sort();
  }
  if (!Object.keys(normalized).length) throw new Error("Settings patch is empty");
  return normalized;
}

async function writeAtomic(filePath, value) {
  const directory = path.dirname(filePath);
  await fs.mkdir(directory, { recursive: true });
  const tempPath = filePath + "." + process.pid + "." + require("node:crypto").randomUUID() + ".tmp";
  try {
    await fs.writeFile(tempPath, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", flag: "wx", mode: 0o600 });
    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

function patchSettings(patch, options = {}) {
  const filePath = path.resolve(options.filePath || CONFIG_FILE);
  const operation = writeQueue.then(async () => {
    const normalizedPatch = validatePatch(patch);
    const current = await readSettings({ filePath, env: options.env });
    const next = validateSettings({
      ...current,
      ...normalizedPatch,
      plugins: { ...current.plugins, ...(normalizedPatch.plugins || {}) }
    });
    await writeAtomic(filePath, next);
    return next;
  });
  writeQueue = operation.catch(() => {});
  return operation;
}

module.exports = { CONFIG_FILE, ALLOWED_PLUGINS, ALLOWED_CONTROLS, PRESETS, defaultApiBase, validApiBase, defaults, validateSettings, validatePatch, readSettings, patchSettings };
