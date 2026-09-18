const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "frontend", "console-plugins.js"), "utf8");
const context = { window: {} };
vm.runInNewContext(source, context);
const plugins = context.window.XinTConsolePlugins;

function makeStorage(initial) {
  const values = new Map(Object.entries(initial || {}));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    values
  };
}

const storage = makeStorage({ "xint-panorama-system-project-id": "saved-project" });
let enabledHooks = 0;
let disabledHooks = 0;
let changes = 0;
const manager = plugins.create(storage, {
  "project-workspace": {
    onEnable() { enabledHooks += 1; },
    onDisable() { disabledHooks += 1; },
    onChange() { changes += 1; }
  }
});

assert.deepEqual(JSON.parse(JSON.stringify(manager.list().map(({ id, name, description, icon, kind, defaultEnabled, enabled }) => ({ id, name, description, icon, kind, defaultEnabled, enabled })))), [{
  id: "project-workspace",
  name: "项目工作区",
  description: "管理项目、场景与热点",
  icon: "platforms",
  kind: "built-in",
  defaultEnabled: false,
  enabled: false
}]);
assert.equal(manager.isEnabled("project-workspace"), false, "a previously saved project ID does not enable the plugin");
let projectRequests = 0;
assert.equal(manager.runIfEnabled("project-workspace", () => { projectRequests += 1; }), false);
assert.equal(projectRequests, 0, "disabled project plugin does not issue its project-list request");

assert.equal(manager.setEnabled("project-workspace", true), true);
assert.equal(manager.isEnabled("project-workspace"), true);
assert.equal(storage.getItem(plugins.preferenceKey + "project-workspace"), "enabled");
assert.equal(enabledHooks, 1);
assert.equal(changes, 1);
assert.equal(manager.runIfEnabled("project-workspace", () => { projectRequests += 1; return "loaded"; }), "loaded");
assert.equal(projectRequests, 1, "enabled project plugin runs the project-list callback");

const afterReload = plugins.create(storage);
assert.equal(afterReload.isEnabled("project-workspace"), true, "the browser-local preference survives reload");
afterReload.setEnabled("project-workspace", false);
assert.equal(afterReload.runIfEnabled("project-workspace", () => { projectRequests += 1; }), false);
assert.equal(projectRequests, 1, "disabled plugin remains guarded after reload");

manager.setEnabled("project-workspace", false);
assert.equal(disabledHooks, 1);
assert.equal(storage.getItem(plugins.preferenceKey + "project-workspace"), "disabled");

const failingStorage = { getItem() { return null; }, setItem() { throw new Error("storage unavailable"); } };
const ephemeral = plugins.create(failingStorage);
assert.equal(ephemeral.setEnabled("project-workspace", true), true, "a storage write failure keeps the session toggle usable");
assert.equal(ephemeral.isEnabled("project-workspace"), true);

console.log("Console plugin registry tests passed");
