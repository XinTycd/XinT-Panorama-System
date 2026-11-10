"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "frontend", "console-plugins.js"), "utf8");
const context = { window: {} };
vm.runInNewContext(source, context);
const plugins = context.window.XinTConsolePlugins;

let persisted = { "project-workspace": false };
let enabledHooks = 0;
let disabledHooks = 0;
let changes = 0;
let projectRequests = 0;
const manager = plugins.create(persisted, {
  "project-workspace": {
    onEnable() { enabledHooks += 1; },
    onDisable() { disabledHooks += 1; },
    onChange() { changes += 1; }
  }
}, async (id, enabled) => { persisted[id] = enabled; });

assert.deepEqual(JSON.parse(JSON.stringify(manager.list().map(({ id, name, description, icon, kind, defaultEnabled, enabled }) => ({ id, name, description, icon, kind, defaultEnabled, enabled })))), [{
  id: "project-workspace", name: "项目工作区", description: "管理项目、场景与热点", icon: "platforms", kind: "built-in", defaultEnabled: false, enabled: false
}]);
assert.equal(manager.runIfEnabled("project-workspace", () => { projectRequests += 1; }), false);
assert.equal(projectRequests, 0);

async function verify() {
  const pendingEnable = manager.setEnabled("project-workspace", true);
  assert.equal(manager.isEnabled("project-workspace"), false, "the registry does not apply a setting before server persistence completes");
  await pendingEnable;
  assert.equal(manager.isEnabled("project-workspace"), true);
  assert.equal(persisted["project-workspace"], true);
  assert.equal(enabledHooks, 1);
  assert.equal(changes, 1);
  assert.equal(manager.runIfEnabled("project-workspace", () => { projectRequests += 1; return "loaded"; }), "loaded");
  assert.equal(projectRequests, 1);

  const afterReload = plugins.create(persisted, {}, async () => {});
  assert.equal(afterReload.isEnabled("project-workspace"), true, "a fresh client hydrates the state read from the server");

  const failing = plugins.create({ "project-workspace": false }, {
    "project-workspace": { onEnable() { throw new Error("must not run"); } }
  }, async () => { throw new Error("server write failed"); });
  await assert.rejects(failing.setEnabled("project-workspace", true), /server write failed/);
  assert.equal(failing.isEnabled("project-workspace"), false, "a failed server save does not change plugin state");

  await manager.setEnabled("project-workspace", false);
  assert.equal(disabledHooks, 1);
  assert.equal(persisted["project-workspace"], false);
  console.log("Console plugin server-state tests passed");
}

verify().catch((error) => { console.error(error); process.exitCode = 1; });
