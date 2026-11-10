"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawnSync } = require("node:child_process");
const { once } = require("node:events");
const test = require("node:test");
const { createServer } = require("../scripts/frontend-server");

async function availablePort() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

test("console settings API is loopback same-origin and persists across clients and restart", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "xint-settings-api-"));
  const filePath = path.join(directory, "console-settings.json");
  const port = await availablePort();
  const origin = "http://127.0.0.1:" + port;
  let server = createServer({ settingsFilePath: filePath, port });
  server.listen(port, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  });
  const get = (headers = {}) => fetch(origin + "/api/console-settings", { headers: { Origin: origin, "Sec-Fetch-Site": "same-origin", Connection: "close", ...headers } });
  const put = (body, headers = {}) => fetch(origin + "/api/console-settings", { method: "PUT", headers: { Origin: origin, "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json", Connection: "close", ...headers }, body: JSON.stringify(body) });

  const initial = await get();
  assert.equal(initial.status, 200);
  assert.equal(initial.headers.get("cache-control"), "no-store");
  const initialSettings = await initial.json();
  assert.equal(initialSettings.apiBase, "http://127.0.0.1:7210");
  assert.equal((await get({ Origin: "http://attacker.example", Referer: "http://attacker.example/" })).status, 403);
  assert.equal((await put({ embedPreset: "none" }, { Origin: "http://attacker.example" })).status, 403);
  assert.equal((await put({ embedPreset: "none" }, { "Content-Type": "text/plain" })).status, 415);
  assert.equal((await put({ toolbarHidden: ["outside"] })).status, 400);
  assert.equal((await put({ plugins: { unknown: true } })).status, 400);
  assert.equal((await put({ note: "x".repeat(20 * 1024) })).status, 413);
  assert.deepEqual(await (await get()).json(), initialSettings);

  const firstClient = await put({ apiBase: "https://panorama.example", plugins: { "project-workspace": true } });
  assert.equal(firstClient.status, 200);
  const secondClient = await put({ embedPreset: "compact", toolbarHidden: ["next"] });
  assert.equal(secondClient.status, 200);
  const merged = await (await get()).json();
  assert.equal(merged.apiBase, "https://panorama.example");
  assert.equal(merged.plugins["project-workspace"], true);
  assert.equal(merged.embedPreset, "compact");
  assert.deepEqual(merged.toolbarHidden, ["next"]);

  await new Promise((resolve) => server.close(resolve));
  server = createServer({ settingsFilePath: filePath, port });
  server.listen(port, "127.0.0.1");
  await once(server, "listening");
  assert.deepEqual(await (await get()).json(), merged);
});

test("frontend server applies --config before resolving the console settings path", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "xint-settings-config-"));
  try {
    const storage = path.join(directory, "custom-storage");
    const configFile = path.join(directory, "custom-config.json");
    await fs.writeFile(configFile, JSON.stringify({ database: { storageDir: storage }, server: { backend: { host: "127.0.0.1", port: 7210 }, frontend: { host: "127.0.0.1", port: 7211 } } }));
    const childEnv = { ...process.env, TEST_CONFIG: configFile };
    delete childEnv.PANORAMA_STORAGE_DIR;
    delete childEnv.PANORAMA_CONFIG;
    const child = spawnSync(process.execPath, ["-e", "process.argv=[process.execPath,'scripts/frontend-server.js','--config',process.env.TEST_CONFIG];require('./scripts/frontend-server');console.log(require('./lib/console-settings').CONFIG_FILE)"], {
      cwd: path.resolve(__dirname, ".."), encoding: "utf8", env: childEnv
    });
    assert.equal(child.status, 0, child.stderr);
    assert.equal(child.stdout.trim().split(/\r?\n/).at(-1), path.join(storage, "console-settings.json"));
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
