const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");

const root = path.resolve(__dirname, "..");
const css = fs.readFileSync(path.join(root, "frontend", "styles.css"), "utf8");
const widget = fs.readFileSync(path.join(root, "backend", "public", "widget.html"), "utf8");
const widgetStyle = widget.match(/<style>([\s\S]*?)<\/style>/i);
assert(widgetStyle, "Widget must retain its inline stylesheet");

Promise.all([
  esbuild.transform(css, { loader: "css" }),
  esbuild.transform(widgetStyle[1], { loader: "css" })
]).then(([consoleResult, widgetResult]) => {
  assert.deepEqual(consoleResult.warnings, [], "Console stylesheet must parse without CSS warnings");
  assert.deepEqual(widgetResult.warnings, [], "Widget inline stylesheet must parse without CSS warnings");
  assert.match(css, /\.toolbar-control-hidden\s*\{\s*display:\s*none\s*!important;/, "Cookie-selected toolbar controls must remain hideable");
  assert.match(widgetStyle[1], /\.viewer-shell\.is-legacy\s+#zoomInBtn:not\(\[hidden\]\)/, "Widget legacy zoom rules must apply at every width");
  console.log("Viewer CSS tests passed");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
