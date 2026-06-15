const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const embedSource = fs.readFileSync(path.join(root, "backend", "public", "embed.js"), "utf8");
const widgetHtml = fs.readFileSync(path.join(root, "backend", "public", "widget.html"), "utf8");

const controlKeys = [
  "status",
  "previous",
  "next",
  "autorotate",
  "zoom-in",
  "zoom-out",
  "focus",
  "director",
  "reset",
  "fullscreen"
];

controlKeys.forEach((key) => {
  assert(embedSource.includes(`${JSON.stringify(key)}: true`) || embedSource.includes(`${key}: true`));
  assert(widgetHtml.includes(`data-control="${key}"`), `Widget control is missing ${key}`);
});

["brand", "panorama-no", "resolution"].forEach((removedHudToken) => {
  assert(embedSource.includes(`${JSON.stringify(removedHudToken)}: true`) || embedSource.includes(`${removedHudToken}: true`), `Legacy embed token ${removedHudToken} must remain accepted`);
  assert(!widgetHtml.includes(`data-control="${removedHudToken}"`), `Removed HUD token ${removedHudToken} must not render a widget control`);
});

["all", "default", "none"].forEach((special) => {
  assert(embedSource.includes(`${special}: true`), `Embed whitelist is missing ${special}`);
  assert(widgetHtml.includes(`token === "${special}"`), `Widget parser is missing ${special}`);
});

assert(embedSource.includes("data-controls"));
assert(embedSource.includes("data-hide-controls"));
assert(widgetHtml.includes('params.get("controls")'));
assert(widgetHtml.includes('params.get("hideControls")'));
assert(!embedSource.includes('"mode-planet": true'));
assert(!widgetHtml.includes('data-control="mode-planet"'));

const attributes = {
  "data-api": "http://127.0.0.1:7310",
  "data-target": "target",
  "data-controls": "brand,zoom-in,unknown,<script>,ALL",
  "data-hide-controls": "resolution,unknown"
};
const container = {
  clientWidth: 800,
  innerHTML: "",
  child: null,
  appendChild(node) {
    this.child = node;
  }
};
const script = {
  src: "http://127.0.0.1:7310/embed.js",
  parentNode: { insertBefore() {} },
  nextSibling: null,
  getAttribute(name) {
    return attributes[name] || null;
  }
};
const document = {
  currentScript: script,
  getElementById(id) {
    return id === "target" ? container : null;
  },
  createElement(tagName) {
    assert.equal(tagName, "iframe");
    return { style: {} };
  }
};

vm.runInNewContext(embedSource, {
  document,
  window: { addEventListener() {} },
  ResizeObserver: undefined,
  encodeURIComponent
});

assert(container.child, "Embed script must create an iframe");
const iframeUrl = new URL(container.child.src);
assert.equal(iframeUrl.searchParams.get("controls"), "brand,zoom-in,all");
assert.equal(iframeUrl.searchParams.get("hideControls"), "resolution");
assert(!container.child.src.includes("script"), "Unknown control tokens must not reach the widget URL");

console.log("Embed control tests passed");
