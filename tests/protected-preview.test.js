const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");

async function run() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "xint-protected-preview-"));
  process.env.PANORAMA_STORAGE_DIR = temp;
  const previews = require("../backend/protected-preview");
  try {
    const source = await sharp({ create: { width: 40, height: 20, channels: 3, background: { r: 51, g: 103, b: 151 } } })
      .jpeg().withMetadata({ exif: { IFD0: { Copyright: "fixture metadata" } } }).toBuffer();
    const originalMeta = await sharp(source).metadata();
    assert.equal(originalMeta.width, 40);
    assert.equal(originalMeta.height, 20);
    assert.equal(originalMeta.hasProfile, true, "Fixture contains metadata that the derivative must remove");

    const result = await previews.convertBuffer(source);
    assert.equal(result.width, 40);
    assert.equal(result.height, 20, "No downsampling is applied");
    assert.equal(result.format, "webp");
    assert.notDeepEqual(result.buffer, source);
    const resultMeta = await sharp(result.buffer).metadata();
    assert.equal(resultMeta.hasProfile, false, "Derived image has no EXIF/ICC profile");
    const sourceRaw = await sharp(source).raw().toBuffer({ resolveWithObject: true });
    const resultRaw = await sharp(result.buffer).raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual(resultRaw.info, sourceRaw.info);
    assert.deepEqual(resultRaw.data, sourceRaw.data, "Lossless derivative preserves decoded pixels");

    const orientedSource = await sharp({ create: { width: 40, height: 20, channels: 3, background: { r: 101, g: 52, b: 19 } } })
      .jpeg().withMetadata({ orientation: 6, exif: { IFD0: { Copyright: "orientation fixture" } } }).toBuffer();
    assert.equal((await sharp(orientedSource).metadata()).orientation, 6);
    const oriented = await previews.convertBuffer(orientedSource);
    assert.deepEqual({ width: oriented.width, height: oriented.height }, { width: 20, height: 40 }, "EXIF orientation is applied while keeping every pixel");
    const orientedMeta = await sharp(oriented.buffer).metadata();
    assert.equal(orientedMeta.orientation, undefined, "Output orientation is baked into pixels, not metadata");

    const canonicalWebp = await sharp({ create: { width: 40, height: 20, channels: 3, background: { r: 7, g: 17, b: 29 } } }).webp({ lossless: true, effort: 0 }).toBuffer();
    const webpDerivative = await previews.convertBuffer(canonicalWebp);
    assert.equal(webpDerivative.format, "png", "When canonical WebP re-encoding equals the source bytes, PNG is used instead");
    assert.notDeepEqual(webpDerivative.buffer, canonicalWebp);
    assert.deepEqual((await sharp(webpDerivative.buffer).raw().toBuffer()), await sharp(canonicalWebp).raw().toBuffer());

    const cachedA = await previews.prepareBuffer(source, { namespace: "test" });
    const cachedB = await previews.prepareBuffer(source, { namespace: "test" });
    assert.equal(cachedA.path, cachedB.path, "The persistent cache reuses a validated derivative");
    const manifest = JSON.parse(await fs.readFile(cachedA.path + ".json", "utf8"));
    assert.equal(manifest.version, previews.CONVERSION_VERSION);
    assert.notEqual(manifest.outputHash, crypto.createHash("sha256").update(source).digest("hex"));
    assert.equal(manifest.format, "webp");
    const cachedMeta = await sharp(await fs.readFile(cachedA.path)).metadata();
    assert.equal(cachedMeta.exif, undefined);
    assert.equal(cachedMeta.icc, undefined);
    assert.equal(cachedMeta.xmp, undefined);
    assert.equal(crypto.createHash("sha256").update(await fs.readFile(cachedA.path)).digest("hex"), manifest.outputHash);

    await fs.writeFile(cachedA.path, Buffer.from("tampered"));
    const repaired = await previews.prepareBuffer(source, { namespace: "test" });
    assert.equal((await sharp(await fs.readFile(repaired.path)).metadata()).format, "webp", "Changed cache files are rejected and rebuilt");

    const sameSource = await sharp({ create: { width: 41, height: 20, channels: 3, background: { r: 6, g: 14, b: 22 } } }).png().toBuffer();
    const concurrent = await Promise.all(Array.from({ length: 8 }, () => previews.prepareBuffer(sameSource, { namespace: "concurrent" })));
    assert(concurrent.every((entry) => entry.path === concurrent[0].path), "Concurrent requests for identical source bytes share one persistent derivative");

    const uniqueSources = await Promise.all(Array.from({ length: 15 }, (_, index) => sharp({ create: { width: 240, height: 200, channels: 3, background: { r: index * 11, g: index * 7, b: index * 3 } } }).png().toBuffer()));
    const saturated = uniqueSources.map((unique) => previews.prepareBuffer(unique, { namespace: "queue" }));
    const settled = await Promise.allSettled(saturated);
    assert.equal(settled.filter((item) => item.status === "fulfilled").length, 14, "Two active jobs and twelve queued jobs are accepted");
    const rejected = settled.filter((item) => item.status === "rejected");
    assert.equal(rejected.length, 1, "The queue refuses additional work once its bound is reached");
    assert.equal(rejected[0].reason.statusCode, 503);

    const uploadDir = path.join(temp, "uploads");
    await fs.mkdir(uploadDir, { recursive: true });
    const sourcePath = path.join(uploadDir, "mutable.png");
    await fs.writeFile(sourcePath, await sharp({ create: { width: 30, height: 15, channels: 3, background: "#123456" } }).png().toBuffer());
    const localItem = { id: "local-preview", sourceType: "database-record", viewerPath: "/media/uploads/mutable.png" };
    const localFirst = await previews.preparePreview(localItem);
    const localHot = await previews.preparePreview(localItem);
    assert.equal(localHot.path, localFirst.path, "A stable local file reuses its prepared derivative");
    await new Promise((resolve) => setTimeout(resolve, 10));
    await fs.writeFile(sourcePath, await sharp({ create: { width: 32, height: 16, channels: 3, background: "#654321" } }).png().toBuffer());
    const localChanged = await previews.preparePreview(localItem);
    assert.notEqual(localChanged.sha256, localFirst.sha256, "A local file stat change invalidates the source memo");
    assert.deepEqual({ width: localChanged.width, height: localChanged.height }, { width: 32, height: 16 });
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}

run().then(() => console.log("Protected preview tests passed")).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
