(function defineXinTPanoramaViewer(global) {
  "use strict";

  var MODES = [{ key: "expand", label: "全景" }];

  function normalizeMode() { return "expand"; }

  function create(options) {
    if (!global.XinTLegacyPanoramaViewer || !global.XinTLegacyPanoramaViewer.create) {
      throw new Error("Local spherical viewer must load before panorama-viewer.js");
    }
    return global.XinTLegacyPanoramaViewer.create(options || {});
  }

  global.XinTPanoramaViewer = {
    create: create,
    normalizeMode: normalizeMode,
    modes: MODES
  };
})(window);
