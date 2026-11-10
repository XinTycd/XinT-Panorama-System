(function initXinTPanoramaEmbed() {
  var script = document.currentScript;
  if (!script) {
    return;
  }

  var apiBase = (script.getAttribute("data-api") || script.src.replace(/\/embed\.js.*$/, "")).replace(/\/$/, "");
  var targetId = script.getAttribute("data-target");
  var panoramaNo = script.getAttribute("data-panorama-no");
  var imageUrl = script.getAttribute("data-image-url") || script.getAttribute("data-src-url");
  var imageName = script.getAttribute("data-image-name") || script.getAttribute("data-title");
  var language = script.getAttribute("data-lang");
  var autorotate = script.getAttribute("data-autorotate");
  var mode = script.getAttribute("data-mode") || script.getAttribute("data-preview-mode");
  var controls = sanitizeControlList(script.getAttribute("data-controls"));
  var hiddenControls = sanitizeControlList(script.getAttribute("data-hide-controls"));
  var aspectRatio = parseAspectRatio(script.getAttribute("data-aspect-ratio")) || 16 / 9;
  var minHeight = Number(script.getAttribute("data-min-height")) || 280;
  var maxHeight = Number(script.getAttribute("data-max-height")) || 960;
  var container = targetId ? document.getElementById(targetId) : null;

  if (!isSecureServiceUrl(apiBase)) {
    if (container) {
      container.textContent = secureServiceMessage(language);
      container.setAttribute("role", "status");
    }
    return;
  }

  if (!container) {
    container = document.createElement("div");
    script.parentNode.insertBefore(container, script.nextSibling);
  }

  var iframe = document.createElement("iframe");
  var iframeUrl = apiBase + "/widget?api=" + encodeURIComponent(apiBase);
  if (imageUrl) {
    iframeUrl += "&imageUrl=" + encodeURIComponent(imageUrl);
  }
  if (imageName) {
    iframeUrl += "&imageName=" + encodeURIComponent(imageName);
  }
  if (["zh-CN", "zh-TW", "en"].indexOf(language) >= 0) {
    iframeUrl += "&lang=" + encodeURIComponent(language);
  }
  if (panoramaNo && !imageUrl) {
    iframeUrl += "&panoramaNo=" + encodeURIComponent(panoramaNo);
  }
  if (autorotate) {
    iframeUrl += "&autorotate=" + encodeURIComponent(autorotate);
  }
  if (mode) {
    iframeUrl += "&mode=" + encodeURIComponent(mode);
  }
  if (controls) {
    iframeUrl += "&controls=" + encodeURIComponent(controls);
  }
  if (hiddenControls) {
    iframeUrl += "&hideControls=" + encodeURIComponent(hiddenControls);
  }

  iframe.src = iframeUrl;
  iframe.loading = "lazy";
  iframe.style.width = "100%";
  iframe.style.display = "block";
  iframe.style.border = "0";
  iframe.style.borderRadius = "8px";
  iframe.style.background = "#050505";
  iframe.style.boxShadow = "0 22px 60px rgba(0,0,0,0.42)";
  iframe.allowFullscreen = true;
  container.innerHTML = "";
  container.appendChild(iframe);

  resizeIframe();
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(resizeIframe).observe(container);
  } else {
    window.addEventListener("resize", resizeIframe);
  }

  function resizeIframe() {
    var width = container.clientWidth || container.offsetWidth || 0;
    var nextHeight = Math.round(width / aspectRatio);
    nextHeight = Math.max(minHeight, Math.min(maxHeight, nextHeight || minHeight));
    iframe.style.height = nextHeight + "px";
  }

  function parseAspectRatio(value) {
    if (!value) {
      return null;
    }

    if (value.indexOf(":") > -1) {
      var parts = value.split(":");
      var width = Number(parts[0]);
      var height = Number(parts[1]);
      if (width > 0 && height > 0) {
        return width / height;
      }
    }

    var numeric = Number(value);
    return numeric > 0 ? numeric : null;
  }

  function isSecureServiceUrl(value) {
    try {
      var url = new URL(String(value || "").trim());
      if (url.username || url.password || url.search || url.hash) return false;
      if (url.protocol === "https:") return true;
      if (url.protocol !== "http:") return false;
      var hostname = url.hostname.toLowerCase();
      return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
    } catch (_) { return false; }
  }

  function secureServiceMessage(selectedLanguage) {
    if (window.XinTI18n && typeof window.XinTI18n.t === "function") return window.XinTI18n.t("error.secureServiceUrl");
    if (selectedLanguage === "zh-TW") return "遠端服務必須使用 HTTPS；HTTP 僅允許 localhost、127.0.0.1 或 ::1。";
    if (selectedLanguage === "zh-CN") return "远程服务必须使用 HTTPS；HTTP 仅允许 localhost、127.0.0.1 或 ::1。";
    return "Remote services must use HTTPS. HTTP is allowed only for localhost, 127.0.0.1, or ::1.";
  }

  function sanitizeControlList(value) {
    var allowed = {
      all: true,
      compact: true,
      none: true,
      default: true,
      brand: true,
      status: true,
      "panorama-no": true,
      resolution: true,
      previous: true,
      next: true,
      autorotate: true,
      "zoom-in": true,
      "zoom-out": true,
      focus: true,
      director: true,
      reset: true,
      fullscreen: true
    };
    var result = [];

    if (!value) {
      return "";
    }

    value.split(",").forEach(function filterControl(rawToken) {
      var token = rawToken.trim().toLowerCase();
      if (Object.prototype.hasOwnProperty.call(allowed, token) && result.indexOf(token) === -1) {
        result.push(token);
      }
    });

    return result.join(",");
  }
})();
