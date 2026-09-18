const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "frontend", "embed-code.js"), "utf8");
const window = {};
vm.runInNewContext(source, { window, URL });
const generate = window.XinTEmbedCode.generate;

const empty = generate({ apiBase: "https://example.test/service", item: null, controls: "all" });
assert.equal(empty.available, false);
assert.equal(empty.message, "请先选择全景图。");
assert.equal(generate({ apiBase: "https://example.test", item: { panoramaNo: 7 }, clientOnly: true }).available, false);
assert.equal(generate({ apiBase: "https://example.test", item: { name: "No number" } }).available, false);
assert.equal(generate({ apiBase: "ftp://example.test", item: { panoramaNo: 7 } }).available, false, "Only HTTP(S) service addresses can be embedded");
assert.equal(generate({ apiBase: "https://example.test", item: { panoramaNo: 0 } }).available, false);
assert.equal(generate({ apiBase: "https://example.test", item: { panoramaNo: 1.5 } }).available, false);
assert.equal(generate({ apiBase: "https://example.test", item: { panoramaNo: Number.MAX_SAFE_INTEGER + 1 } }).available, false);

const snippets = generate({
  apiBase: "https://example.test/panorama",
  item: { panoramaNo: 18, name: 'Gallery "A" & <North>' },
  controls: "zoom-in,zoom-out,autorotate,fullscreen"
});
assert.equal(snippets.available, true);
assert.match(snippets.iframe, /title="Gallery &quot;A&quot; &amp; &lt;North&gt;"/, "Iframe title is HTML-escaped");
assert.match(snippets.iframe, /loading="lazy"\n  allowfullscreen/);
assert.match(snippets.iframe, /aspect-ratio:16\/9/);
assert.match(snippets.iframe, /\n  src=/, "Iframe attributes use separate indented lines");
assert.match(snippets.script, /\n  data-target=/, "Script attributes use separate indented lines");
const encodedIframe = snippets.iframe.match(/src="([^"]+)"/)[1].replace(/&amp;/g, "&");
const widgetUrl = new URL(encodedIframe);
assert.equal(widgetUrl.pathname, "/panorama/widget");
assert.equal(widgetUrl.searchParams.get("panoramaNo"), "18");
assert.equal(widgetUrl.searchParams.get("controls"), "zoom-in,zoom-out,autorotate,fullscreen");
assert.equal(widgetUrl.searchParams.get("api"), "https://example.test/panorama");
assert(widgetUrl.search.includes("controls=zoom-in%2Czoom-out%2Cautorotate%2Cfullscreen"), "URLSearchParams encodes comma-separated control tokens");
assert.match(snippets.script, /data-panorama-no="18"/);
assert.match(snippets.script, /data-controls="zoom-in,zoom-out,autorotate,fullscreen"/);
assert.match(snippets.script, /src="https:\/\/example\.test\/panorama\/embed\.js"/);
assert(!snippets.script.includes("example.com/panorama.jpg"), "Code uses the selected server resource, not a fake external URL");
for (const controls of ["all", "zoom-in,zoom-out,autorotate,fullscreen", "none"]) {
  const pair = generate({ apiBase: "https://example.test", item: { panoramaNo: 5 }, controls });
  const iframeSrc = pair.iframe.match(/src="([^"]+)"/)[1].replace(/&amp;/g, "&");
  const scriptControls = pair.script.match(/data-controls="([^"]+)"/)[1];
  assert.equal(new URL(iframeSrc).searchParams.get("controls"), scriptControls, "Iframe and JavaScript examples share the selected preset");
}

console.log("Embed code generation tests passed");
