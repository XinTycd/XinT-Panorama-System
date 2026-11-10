"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const settings = require("../lib/console-settings");

test("console settings validate, patch atomically, and reload with defaults", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "xint-console-settings-"));
  const filePath = path.join(directory, "console-settings.json");
  try {
    const defaults = await settings.readSettings({ filePath, env: { PANORAMA_HOST: "0.0.0.0", PANORAMA_PORT: "7220" } });
    assert.deepEqual(defaults, { apiBase: "http://127.0.0.1:7220", plugins: { "project-workspace": false }, embedPreset: "all", toolbarHidden: [] });
    const [first, second, third] = await Promise.all([
      settings.patchSettings({ plugins: { "project-workspace": true } }, { filePath }),
      settings.patchSettings({ embedPreset: "compact" }, { filePath }),
      settings.patchSettings({ toolbarHidden: ["previous", "next"] }, { filePath })
    ]);
    assert.equal(first.plugins["project-workspace"], true);
    assert.equal(second.plugins["project-workspace"], true);
    assert.equal(third.embedPreset, "compact");
    assert.deepEqual((await settings.readSettings({ filePath })).toolbarHidden, ["next", "previous"]);
    await settings.patchSettings({ apiBase: "https://panorama.example/service" }, { filePath });
    const persisted = await settings.readSettings({ filePath });
    for (const invalid of [
      { apiBase: "http://public.example" }, { apiBase: "https://user@panorama.example" },
      { plugin: { "project-workspace": true } }, { plugins: { unknown: true } },
      { plugins: { "project-workspace": "enabled" } }, { embedPreset: "default" },
      { toolbarHidden: ["unknown"] }, { toolbarHidden: ["next", "next"] }, { cloudToken: "secret" }
    ]) {
      await assert.rejects(settings.patchSettings(invalid, { filePath }));
      assert.deepEqual(await settings.readSettings({ filePath }), persisted);
    }
    const blockedPath = path.join(directory, "not-a-directory", "settings.json");
    await fs.writeFile(path.dirname(blockedPath), "blocked");
    await assert.rejects(settings.patchSettings({ embedPreset: "none" }, { filePath: blockedPath }));
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
