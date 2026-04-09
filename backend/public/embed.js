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
  var autorotate = script.getAttribute("data-autorotate");
  var aspectRatio = parseAspectRatio(script.getAttribute("data-aspect-ratio")) || 16 / 9;
  var minHeight = Number(script.getAttribute("data-min-height")) || 280;
  var maxHeight = Number(script.getAttribute("data-max-height")) || 960;
  var container = targetId ? document.getElementById(targetId) : null;

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
  if (panoramaNo && !imageUrl) {
    iframeUrl += "&panoramaNo=" + encodeURIComponent(panoramaNo);
  }
  if (autorotate) {
    iframeUrl += "&autorotate=" + encodeURIComponent(autorotate);
  }

  iframe.src = iframeUrl;
  iframe.loading = "lazy";
  iframe.style.width = "100%";
  iframe.style.display = "block";
  iframe.style.border = "0";
  iframe.style.borderRadius = "20px";
  iframe.style.boxShadow = "0 18px 48px rgba(0,0,0,0.22)";
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
})();
