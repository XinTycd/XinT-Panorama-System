const path = require("node:path");
const { buildViewerAssets } = require("./viewer-assets");

buildViewerAssets(path.resolve(__dirname, "..")).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
