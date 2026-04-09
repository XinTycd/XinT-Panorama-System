const assert = require("assert");
const http = require("http");
const { createServer } = require("../backend/index");
const { writeGallery } = require("../backend/store");

function request(port, pathname, options) {
  const payload = options && options.body ? options.body : null;
  return new Promise(function resolveRequest(resolve, reject) {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: port,
        path: pathname,
        method: (options && options.method) || "GET",
        headers: payload
          ? {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(payload)
            }
          : {}
      },
      function onResponse(res) {
        const chunks = [];
        res.on("data", function onData(chunk) {
          chunks.push(chunk);
        });
        res.on("end", function onEnd() {
          resolve({
            statusCode: res.statusCode,
            body: Buffer.concat(chunks).toString("utf8")
          });
        });
      }
    );

    req.on("error", reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

async function run() {
  writeGallery([]);
  const server = createServer();

  await new Promise(function start(resolve) {
    server.listen(0, "127.0.0.1", resolve);
  });

  const port = server.address().port;

  try {
    const health = await request(port, "/api/health");
    assert.strictEqual(health.statusCode, 200);
    assert.ok(JSON.parse(health.body).ok);

    const demo = await request(port, "/api/gallery/seed-demo", {
      method: "POST",
      body: JSON.stringify({})
    });
    assert.strictEqual(demo.statusCode, 200);
    const demoPayload = JSON.parse(demo.body);
    assert.ok((demoPayload.items || []).length >= 1);
    assert.strictEqual(demoPayload.items[0].panoramaNo, 1000);

    const upload = await request(port, "/api/panoramas/upload-base64", {
      method: "POST",
      body: JSON.stringify({
        name: "unit-test",
        dataUrl:
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9nK3sAAAAASUVORK5CYII="
      })
    });
    assert.strictEqual(upload.statusCode, 200);
    const uploadPayload = JSON.parse(upload.body);
    assert.ok(Number(uploadPayload.item.panoramaNo) >= 1001);

    const gallery = await request(port, "/api/gallery");
    const galleryPayload = JSON.parse(gallery.body);
    assert.ok(galleryPayload.items.length >= 2);

    const byNo = await request(port, "/api/panoramas/by-no?no=" + uploadPayload.item.panoramaNo);
    const byNoPayload = JSON.parse(byNo.body);
    assert.strictEqual(byNo.statusCode, 200);
    assert.strictEqual(byNoPayload.item.panoramaNo, uploadPayload.item.panoramaNo);

    const update = await request(port, "/api/panoramas/update", {
      method: "POST",
      body: JSON.stringify({
        id: uploadPayload.item.id,
        panoramaNo: 3001,
        name: "updated-panorama",
        description: "updated description"
      })
    });
    const updatePayload = JSON.parse(update.body);
    assert.strictEqual(update.statusCode, 200);
    assert.strictEqual(updatePayload.item.panoramaNo, 3001);
    assert.strictEqual(updatePayload.item.name, "updated-panorama");
    assert.strictEqual(updatePayload.item.description, "updated description");

    console.log("Backend tests passed");
  } finally {
    await request(port, "/api/gallery/clear", {
      method: "POST",
      body: JSON.stringify({})
    });
    writeGallery([]);
    await new Promise(function stop(resolve) {
      server.close(resolve);
    });
  }
}

run().catch(function onError(error) {
  console.error(error);
  process.exit(1);
});
