const { ensureViewerAssets } = require("./viewer-assets");

ensureViewerAssets().then(({ built }) => {
  if (built) console.log("Built local Photo Sphere Viewer assets.");
}).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
