const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "frontend", "media-storage-form.js"), "utf8");
const window = {};
vm.runInNewContext(source, { window });
const getState = window.XinTMediaStorageForm.getState;

for (const mode of ["server", "client"]) {
  const state = getState(mode, "original", "jpeg");
  assert.equal(state.originalAllowed, true, `${mode} storage keeps original format available`);
  assert.equal(state.format, "original");
  assert.equal(state.cloudVisible, false);
}

for (const mode of ["sqlite", "cloud"]) {
  const state = getState(mode, "original", "webp");
  assert.equal(state.originalAllowed, false, `${mode} storage disables original format`);
  assert.equal(state.format, "base64", `${mode} storage normalizes original format to Base64`);
  assert.equal(state.cloudVisible, mode === "cloud");
}

for (const codec of ["jpeg", "webp"]) {
  const state = getState("server", "transcode", codec);
  assert.equal(state.transcodeVisible, true);
  assert.equal(state.qualityVisible, true, `${codec} transcode exposes quality`);
}
const png = getState("server", "transcode", "png");
assert.equal(png.transcodeVisible, true);
assert.equal(png.qualityVisible, false, "PNG transcode hides quality");
assert.equal(getState("server", "base64", "png").transcodeVisible, false, "non-transcode formats hide codec controls");
assert.equal(getState("unknown", "unknown", "unknown").mode, "server", "unknown values use supported defaults");

console.log("Media storage form tests passed");
