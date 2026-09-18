const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "frontend", "embed-presets.js"), "utf8");
const window = {};
vm.runInNewContext(source, { window });
const presets = window.XinTEmbedPresets;

assert.equal(presets.fromLegacy(null), "all", "unset settings use the complete preset");
assert.equal(presets.fromLegacy("default"), "all");
assert.equal(presets.fromLegacy("all"), "all");
assert.equal(presets.fromLegacy("none"), "none");
assert.equal(presets.fromLegacy("compact"), "compact");
assert.equal(presets.fromLegacy("brand,status,zoom-in,zoom-out,autorotate,reset,fullscreen"), "compact");
assert.equal(presets.fromLegacy("zoom-in,zoom-out,autorotate,fullscreen"), "compact");
assert.equal(presets.fromLegacy("zoom-in,zoom-out,reset"), "compact", "custom values nearest to the compact set migrate to compact");
assert.equal(presets.fromLegacy("previous,next,focus"), "all", "unmatched custom settings migrate to complete");
assert.equal(presets.controlsFor("all"), "all");
assert.equal(presets.controlsFor("compact"), "zoom-in,zoom-out,autorotate,fullscreen");
assert.equal(presets.controlsFor("none"), "none");
assert.equal(presets.controlsFor("invalid"), "all");

console.log("Embed preset tests passed");
