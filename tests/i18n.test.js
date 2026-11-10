const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "frontend", "i18n.js"), "utf8");
const root = path.join(__dirname, "..");

function createHarness(search = "", options = {}) {
  const listeners = new Map();
  const storageListeners = new Map();
  const storage = new Map(options.saved ? [["xint-panorama-language", options.saved]] : []);
  const writes = [];
  const documentListeners = new Map();
  const document = {
    documentElement: { lang: "" },
    title: "",
    nodeType: 9,
    createTextNode(value) { return { nodeType: 3, nodeValue: value }; },
    addEventListener(name, callback) { documentListeners.set(name, callback); },
    querySelector(selector) { return selector === "title[data-i18n]" ? title : null; },
    querySelectorAll(selector) {
      if (selector.startsWith("[data-language-select]")) return [select];
      return elements.filter((element) => element.matches(selector));
    }
  };
  function makeElement(attrs = {}, text = "", value = "") {
    const attributes = new Map(Object.entries(attrs));
    const textNode = { nodeType: 3, nodeValue: text };
    return {
      nodeType: 1,
      childNodes: text === "" ? [] : [textNode],
      ownerDocument: document,
      value,
      textNode,
      attributes,
      matches(selector) { return matches(this, selector); },
      querySelectorAll() { return []; },
      querySelector() { return null; },
      getAttribute(name) { return attributes.get(name) || null; },
      setAttribute(name, next) { attributes.set(name, String(next)); },
      insertBefore(node) { this.childNodes.unshift(node); }
    };
  }
  function matches(element, selector) {
    return selector.split(",").some((part) => {
      const match = part.trim().match(/^\[([^\]]+)\]$/);
      return Boolean(match && element.attributes.has(match[1]));
    });
  }
  const title = makeElement({ "data-i18n": "title.console" }, "");
  const nav = makeElement({ "data-i18n": "nav.library" }, "资源库");
  const placeholder = makeElement({ "data-i18n-placeholder": "placeholder.search" }, "", "项目");
  const userValue = makeElement({}, "项目", "项目");
  const select = makeElement({ "data-language-select": "" });
  select.value = "";
  const elements = [title, nav, placeholder, userValue];
  const window = {
    document,
    location: { search },
    localStorage: {
      getItem(key) { if (options.failStorage) throw new Error("storage blocked"); return storage.get(key) || null; },
      setItem(key, value) { if (options.failStorage) throw new Error("storage blocked"); writes.push([key, value]); storage.set(key, value); }
    },
    addEventListener(name, callback) { (name === "storage" ? storageListeners : listeners).set(name, callback); },
    dispatchEvent(event) { const callback = listeners.get(event.type); if (callback) callback(event); return true; },
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init.detail; }
  };
  vm.runInNewContext(source, { window, URL, URLSearchParams, Object, Array, String, Boolean, RegExp });
  return { api: window.XinTI18n, document, window, elements: { title, nav, placeholder, userValue, select }, storageListeners, writes, documentListeners, storage };
}

const harness = createHarness("?lang=en", { saved: "zh-TW" });
const api = harness.api;
assert.deepEqual(Array.from(api.languages), ["zh-CN", "zh-TW", "en"]);
assert(Object.values(api.entries).every((entry) => Array.isArray(entry) && entry.length === 3), "Every catalog key has one phrase per locale");
for (const [url, expected] of [
  ["https://panorama.example", true],
  ["http://panorama.example", false],
  ["http://localhost:7210", true],
  ["http://127.0.0.1:7210", true],
  ["http://[::1]:7210", true],
  ["http://localhost.evil:7210", false],
  ["https://user:pass@panorama.example", false],
  ["http://127.0.0.1:7210/?token=x", false]
]) assert.equal(api.isSecureServiceUrl(url), expected, "Service URL policy: " + url);
for (const relative of ["frontend/index.html", "backend/public/widget.html"]) {
  const html = fs.readFileSync(path.join(root, relative), "utf8");
  const markerPattern = /\bdata-i18n(?:-(?:placeholder|title|aria-label))?="([^"]+)"/g;
  for (const match of html.matchAll(markerPattern)) assert(api.entries[match[1]], relative + " references unknown locale key " + match[1]);
}
const consoleHtml = fs.readFileSync(path.join(root, "frontend", "index.html"), "utf8");
assert.equal((consoleHtml.match(/data-language-select/g) || []).length, 1, "The console has one language selector");
const languageSettingsOffset = consoleHtml.indexOf("data-panel=\"settings\"");
const languageSelectorOffset = consoleHtml.indexOf("data-language-select");
const apiAddressOffset = consoleHtml.indexOf("id=\"apiBaseInput\"");
assert(languageSettingsOffset >= 0 && languageSelectorOffset > languageSettingsOffset && languageSelectorOffset < apiAddressOffset, "The console language selector is the first setting");
assert(!consoleHtml.slice(0, languageSettingsOffset).includes("data-language-select"), "The console header no longer owns the language selector");
assert.equal(api.getLanguage(), "en", "A valid explicit locale takes precedence at initial load");
assert.equal(harness.elements.nav.textNode.nodeValue, "Library");
assert.equal(harness.elements.title.childNodes[0].nodeValue, "XinT Panorama · Console");
api.setLanguage("zh-TW");
assert.equal(harness.elements.nav.textNode.nodeValue, "資源庫");
assert.equal(harness.elements.placeholder.getAttribute("placeholder"), "輸入名稱或編號");
assert.equal(harness.elements.userValue.textNode.nodeValue, "项目", "Unmarked user text is left untouched");
assert.equal(harness.elements.placeholder.value, "项目", "Language application never changes an input value");
assert.equal(harness.elements.select.value, "zh-TW");
assert.equal(harness.api.t("status.connected", { url: "https://local.example" }), "已連線至 https://local.example");
assert.equal(harness.api.translateMessage("已连接到 https://local.example"), "已連線至 https://local.example");
api.setLanguage("en");
assert.equal(harness.api.translateMessage("无法安全解码此图片格式"), "This image format cannot be decoded safely");
assert.equal(harness.api.translateMessage("仅支持单帧、标准位深的静态全景图片"), "Only single-frame static panoramas with standard bit depth are supported");
assert.equal(harness.api.translateMessage("无损预览超过输出大小限制"), "The lossless preview exceeds the output size limit");
assert.equal(harness.api.translateMessage("远程图片导入必须使用 HTTPS 地址"), "Remote image imports must use an HTTPS URL");
assert.equal(harness.api.translateMessage("该图片格式无法生成安全预览"), "A protected preview cannot be generated for this image format");
assert.equal(harness.api.translateMessage("无法生成与源文件字节不同的安全预览"), "Could not generate a protected preview with bytes distinct from the source file");
api.setLanguage("zh-TW");
assert.equal(harness.writes.at(-1)[1], "zh-TW");
harness.storageListeners.get("storage")({ key: api.storageKey, newValue: "en" });
assert.equal(api.getLanguage(), "en", "A storage event synchronizes the same-origin widget language");
const writesBeforeStorageEvent = harness.writes.length;
assert.equal(api.setLanguage("ja"), false, "Unsupported language values are rejected");
assert.equal(harness.writes.length, writesBeforeStorageEvent);

const storageBlocked = createHarness("", { failStorage: true });
assert.equal(storageBlocked.api.getLanguage(), "zh-CN");
assert.equal(storageBlocked.api.setLanguage("en"), true, "The current tab can change language when storage is blocked");
assert.equal(storageBlocked.api.getLanguage(), "en");
assert.equal(storageBlocked.elements.nav.textNode.nodeValue, "Library");

console.log("Shared i18n catalog and behavior tests passed");
