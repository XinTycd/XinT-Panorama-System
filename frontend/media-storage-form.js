(function mediaStorageForm() {
  function getState(mode, format, codec) {
    var normalizedMode = ["server", "client", "sqlite", "cloud"].indexOf(mode) === -1 ? "server" : mode;
    var originalAllowed = normalizedMode === "server" || normalizedMode === "client";
    var normalizedFormat = ["original", "base64", "transcode"].indexOf(format) === -1 ? "original" : format;
    if (!originalAllowed && normalizedFormat === "original") normalizedFormat = "base64";
    var normalizedCodec = ["jpeg", "png", "webp"].indexOf(codec) === -1 ? "jpeg" : codec;
    return {
      mode: normalizedMode,
      format: normalizedFormat,
      codec: normalizedCodec,
      originalAllowed: originalAllowed,
      cloudVisible: normalizedMode === "cloud",
      transcodeVisible: normalizedFormat === "transcode",
      qualityVisible: normalizedFormat === "transcode" && normalizedCodec !== "png"
    };
  }

  window.XinTMediaStorageForm = { getState: getState };
})();
