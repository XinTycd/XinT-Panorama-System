const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "xint-media-test-"));
process.env.PANORAMA_STORAGE_DIR = temp;

const backend = require("../backend");
const { closeDatabase, getDatabase } = require("../backend/sqlite");
const { readItemById } = require("../backend/store");
const { readSource } = require("../backend/protected-preview");
const server = backend.createServer();

async function run() {
  const realFetch = global.fetch;
  const remoteRows = new Map();
  global.fetch = async function routeFetch(url, options) {
    if (url !== "https://example.turso.io/v2/pipeline") return realFetch(url, options);
    if (options.headers.Authorization !== "Bearer fake-test-token") return Response.json({}, { status: 401 });
    const [{ stmt }] = JSON.parse(options.body).requests;
    const [id, mime, base64] = stmt.args.map((arg) => arg.value);
    if (stmt.sql.startsWith("INSERT")) remoteRows.set(id, [mime, base64]);
    if (stmt.sql.startsWith("DELETE")) remoteRows.delete(id);
    const rows = stmt.sql.startsWith("SELECT") && remoteRows.has(id)
      ? [remoteRows.get(id).map((value) => ({ type: "text", value }))]
      : [];
    return Response.json({ results: [{ type: "ok", response: { result: { rows } } }] });
  };
  try {
    await backend.initialize();
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = "http://127.0.0.1:" + server.address().port;
    const png = await sharp({ create: { width: 8, height: 4, channels: 3, background: "#6f7a66" } }).png().toBuffer();
    const dataUrl = "data:image/png;base64," + png.toString("base64");
    const json = (pathname, method, body, headers = {}) => fetch(base + pathname, {
      method, headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body)
    });
    const settings = (body, headers) => json("/api/settings/media-storage", "PUT", body, headers);
    const upload = (extra = {}) => json("/api/panoramas/upload-base64", "POST", { name: "sample", dataUrl, ...extra });
    const cases = [
      { mode: "server", format: "original", prefix: "/media/uploads/", mime: "image/png" },
      { mode: "server", format: "base64", prefix: "/media/base64/", mime: "image/png" },
      { mode: "sqlite", format: "base64", prefix: "/media/sqlite/", mime: "image/png" },
      { mode: "sqlite", format: "transcode", codec: "jpeg", prefix: "/media/sqlite/", mime: "image/jpeg" },
      { mode: "server", format: "transcode", codec: "png", prefix: "/media/uploads/", mime: "image/png" },
      { mode: "server", format: "transcode", codec: "webp", prefix: "/media/uploads/", mime: "image/webp" },
      { mode: "cloud", format: "base64", cloud: { url: "libsql://example.turso.io", token: "fake-test-token" }, prefix: "/media/cloud/", mime: "image/png" }
    ];
    for (const { prefix, mime, ...body } of cases) {
      const update = await settings(body);
      assert.equal(update.status, 200, await update.clone().text());
      assert.ok(!(await update.text()).includes("fake-test-token"));
      const created = await upload();
      assert.equal(created.status, 200, await created.clone().text());
      const { item } = await created.json();
      assert.match(item.viewerPath, /^\/api\/panoramas\/preview\?id=/, "Public gallery items expose only the protected preview route");
      assert.equal(item.originalUrl, null, "Public gallery items do not expose the original URL");
      const storedItem = await readItemById(item.id);
      assert.ok(storedItem.viewerPath.startsWith(prefix), "The source remains stored in the selected backend format");
      const storedSource = await readSource(storedItem);
      const storedMime = storedSource.mime || ({ jpeg: "image/jpeg", png: "image/png", webp: "image/webp" }[(await sharp(storedSource.buffer).metadata()).format]);
      assert.equal(storedMime, mime, "The backend source keeps the selected storage format");
      if (body.format !== "transcode") assert.deepEqual(await sharp(storedSource.buffer).raw().toBuffer(), await sharp(png).raw().toBuffer());
      const response = await fetch(item.viewerUrl);
      assert.equal(response.headers.get("content-type").split(";")[0], "image/webp", "Public protected previews use the lossless WebP derivative");
      const saved = Buffer.from(await response.arrayBuffer());
      assert.equal((await sharp(saved).metadata()).width, 8);
      if (body.format !== "transcode") {
        assert.deepEqual(await sharp(saved).raw().toBuffer(), await sharp(png).raw().toBuffer(), "Protected delivery preserves decoded pixels for original and Base64 storage");
      }
      assert.notDeepEqual(saved, png, "Protected delivery uses a derived image rather than the stored source bytes");
      assert.notEqual((await fetch(base + storedItem.viewerPath)).status, 200, "Raw media paths are not publicly served");
      const thumbnailResponse = await fetch(item.thumbnailUrl);
      assert.equal(thumbnailResponse.status, 200);
      const thumbnail = Buffer.from(await thumbnailResponse.arrayBuffer());
      const thumbnailInfo = await sharp(thumbnail).metadata();
      assert.equal(thumbnailInfo.width, 8, "Small images are not enlarged for thumbnails");
      assert.equal(thumbnailInfo.format, "webp", "The thumbnail route serves a protected derivative for every storage mode");
      assert.notEqual(item.thumbnailUrl, item.viewerUrl, "The thumbnail route does not expose the stored source");
    }
    const payloadCount = (mode, format) => {
      if (mode === "sqlite") return getDatabase().prepare("SELECT COUNT(*) AS n FROM xint_image_payloads").get().n;
      if (mode === "cloud") return remoteRows.size;
      const directory = format === "base64" ? path.join(temp, "encoded-images") : path.join(temp, "uploads");
      return fs.existsSync(directory) ? fs.readdirSync(directory).length : 0;
    };
    for (const { mode, format, codec, cloud } of [cases[0], cases[1], cases[2], cases[6]]) {
      const settingsBody = { mode, format, ...(codec ? { codec } : {}), ...(cloud ? { cloud } : {}) };
      const update = await settings(settingsBody);
      assert.equal(update.status, 200, await update.clone().text());
      const beforeFailure = payloadCount(mode, format);
      const failed = await upload({ group: "group-that-does-not-exist" });
      assert.equal(failed.status, 400, await failed.clone().text());
      assert.equal(payloadCount(mode, format), beforeFailure, `failed ${mode}/${format} upload leaked its media payload`);
    }
    assert.equal((await settings({ mode: "cloud", cloud: { token: "incorrect" } })).status, 502);
    assert.equal((await settings({ mode: "sqlite", format: "original" })).status, 400);
    assert.equal((await settings({ mode: "server" }, { Origin: "https://unrelated.example" })).status, 403);
    assert.ok(getDatabase().prepare("SELECT COUNT(*) AS n FROM xint_image_payloads").get().n >= 2);
    assert.equal((await settings({ mode: "client", format: "original" })).status, 200);
    assert.equal((await upload()).status, 409);
    const client = await json("/api/panoramas/upload-base64", "POST", {
      name: "browser", clientMediaId: "12345678-1234-4123-8123-123456789abc"
    });
    assert.equal(client.status, 200, await client.clone().text());
    const { item } = await client.json();
    assert.equal(item.sourceType, "client-upload");
    assert.equal(item.viewerUrl, null, "Browser-only images have no server preview URL");
    assert.equal((await fetch(base + "/api/panoramas/preview?id=" + encodeURIComponent(item.id))).status, 404);
    console.log("Media storage tests passed");
  } finally {
    global.fetch = realFetch;
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    closeDatabase();
    assert.equal(path.dirname(temp), os.tmpdir());
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
