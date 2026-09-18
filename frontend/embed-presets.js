(function embedPresets() {
  const controls = {
    all: "all",
    compact: "zoom-in,zoom-out,autorotate,fullscreen",
    none: "none"
  };
  const legacyCompact = new Set("brand,status,zoom-in,zoom-out,autorotate,reset,fullscreen".split(","));
  const compactCore = new Set("zoom-in,zoom-out,autorotate,fullscreen".split(","));

  function fromLegacy(value) {
    const tokens = String(value || "default").toLowerCase().split(",").map((token) => token.trim()).filter(Boolean);
    if (tokens.length === 1 && ["all", "default"].includes(tokens[0])) return "all";
    if (tokens.length === 1 && tokens[0] === "compact") return "compact";
    if (tokens.length === 1 && tokens[0] === "none") return "none";
    const tokenSet = new Set(tokens);
    if (tokenSet.size === legacyCompact.size && Array.from(legacyCompact).every((token) => tokenSet.has(token))) return "compact";
    const coreMatches = Array.from(compactCore).filter((token) => tokenSet.has(token)).length;
    return coreMatches >= 2 && tokenSet.size <= 5 ? "compact" : "all";
  }

  function controlsFor(preset) {
    return controls[preset] || controls.all;
  }

  window.XinTEmbedPresets = { fromLegacy: fromLegacy, controlsFor: controlsFor };
})();
