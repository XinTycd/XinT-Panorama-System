(function defineXinTPanoramaViewer(global) {
  "use strict";

  var MIN_FOV = 30;
  var MAX_FOV = 105;
  var MODES = [{ key: "expand", label: "展开模式" }];

  function normalizeMode() { return "expand"; }
  function finite(value, fallback, min, max) {
    value = Number(value);
    return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  }
  function wrapDegrees(value) { return ((value % 360) + 360) % 360; }
  function oldYawToPsvYaw(yaw) { return wrapDegrees(finite(yaw, 180, -1e9, 1e9) + 180) * Math.PI / 180; }
  function psvYawToOldYaw(yaw) { return wrapDegrees(yaw * 180 / Math.PI + 180); }
  function fovToZoom(fov) { return (MAX_FOV - finite(fov, 75, MIN_FOV, MAX_FOV)) / (MAX_FOV - MIN_FOV) * 100; }
  function zoomToFov(zoom) { return MAX_FOV - finite(zoom, 50, 0, 100) / 100 * (MAX_FOV - MIN_FOV); }

  function create(options) {
    options = options || {};
    if (!options.element) throw new Error("viewer element is required");
    if ((options.engine || "psv") === "legacy") {
      if (!global.XinTLegacyPanoramaViewer || typeof global.XinTLegacyPanoramaViewer.create !== "function") throw new Error("Local legacy viewer module must load before panorama-viewer.js");
      return global.XinTLegacyPanoramaViewer.create(options);
    }
    if (!global.XinTPSV || !global.XinTPSV.Viewer) throw new Error("Local Photo Sphere Viewer bundle must load before panorama-viewer.js");
    var element = options.element;
    var viewer = null;
    var loadId = 0;
    var directorId = 0;
    var director = null;
    var directorTimer = 0;
    var autoRotate = false;
    var rotateTimer = 0;
    var lastRotateTime = 0;
    var disposed = false;
    var state = { yaw: finite(options.initialYaw, 180, -1e9, 1e9), pitch: finite(options.initialPitch, 0, -85, 85), fov: finite(options.initialFov, 75, MIN_FOV, MAX_FOV) };
    var reduceMotion = Boolean(global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches);

    function getView() {
      if (viewer) {
        var position = viewer.getPosition();
        state.yaw = psvYawToOldYaw(position.yaw);
        state.pitch = finite(position.pitch * 180 / Math.PI, state.pitch, -90, 90);
        state.fov = zoomToFov(viewer.getZoomLevel());
      }
      return { yaw: wrapDegrees(state.yaw), pitch: state.pitch, fov: state.fov, mode: "expand" };
    }

    function notify() { if (typeof options.onViewChange === "function") options.onViewChange(getView()); }

    function createViewer() {
      if (viewer) viewer.destroy();
      element.replaceChildren();
      viewer = new global.XinTPSV.Viewer({
        container: element,
        panorama: null,
        minFov: MIN_FOV,
        maxFov: MAX_FOV,
        defaultZoomLvl: fovToZoom(state.fov),
        defaultYaw: oldYawToPsvYaw(state.yaw),
        defaultPitch: state.pitch * Math.PI / 180,
        moveInertia: 0.15,
        mousewheel: true,
        mousemove: true,
        keyboard: false,
        navbar: false,
        defaultTransition: null,
        canvasBackground: "#050505",
        rendererParameters: { alpha: true, antialias: true, powerPreference: "high-performance" }
      });
      if (!viewer.renderer || !viewer.renderer.renderer || !viewer.textureLoader || !viewer.dataHelper) {
        var partial = viewer;
        viewer = null;
        try { if (partial.renderer && partial.renderer.renderer && partial.renderer.renderer.dispose) partial.renderer.renderer.dispose(); } catch (_) {}
        try { if (partial.destroy) partial.destroy(); } catch (_) {}
        element.replaceChildren();
        throw new Error("此浏览器无法启动 Photo Sphere Viewer，可在设置选择兼容原引擎");
      }
      installSvgMimeRepair(viewer.textureLoader);
      element.dataset.viewerEngine = "psv";
      element.dataset.viewerCompatibility = "inactive";
      viewer.addEventListener("position-updated", notify);
      viewer.addEventListener("zoom-updated", notify);
      viewer.addEventListener("size-updated", notify);
      element.tabIndex = 0;
      element.setAttribute("aria-label", "XinT 全景查看器");
      var canvas = viewer.renderer.renderer.domElement;
      canvas.setAttribute("aria-label", "XinT 全景画布，拖动或使用方向键调整视角");
      canvas.addEventListener("webglcontextlost", onContextLost, false);
      canvas.addEventListener("webglcontextrestored", onContextRestored, false);
      return viewer;
    }

    function installSvgMimeRepair(textureLoader) {
      if (!textureLoader || typeof textureLoader.blobToImage !== "function") return;
      var originalBlobToImage = textureLoader.blobToImage.bind(textureLoader);
      textureLoader.blobToImage = function decodeBlobWithSvgMime(blob) {
        return prepareSvgBlob(blob).then(originalBlobToImage);
      };
    }

    function prepareSvgBlob(blob) {
      if (!blob || !blob.slice || (blob.type && !/^(?:application\/octet-stream|text\/plain)$/i.test(blob.type))) {
        return Promise.resolve(blob);
      }
      return blob.slice(0, 2048).text().then(function inspectImageHeader(header) {
        var prefix = header.replace(/^\uFEFF/, "").trimStart();
        var isSvg = /^(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg\b/i.test(prefix);
        if (!isSvg) return blob;
        // three FileLoader rebuilds streamed Responses without response headers; restore SVG MIME at the PSV image-loader boundary.
        return new global.Blob([blob], { type: "image/svg+xml" });
      }, function keepUnrecognizedBlob() { return blob; });
    }

    function stopAutoRotateTimer() {
      if (rotateTimer) global.clearInterval(rotateTimer);
      rotateTimer = 0;
      lastRotateTime = 0;
    }

    function startAutoRotateTimer() {
      stopAutoRotateTimer();
      if (!autoRotate || reduceMotion || !viewer || global.document.hidden) return;
      lastRotateTime = Date.now();
      rotateTimer = global.setInterval(function rotateByElapsedTime() {
        var now = Date.now();
        var elapsed = Math.min(0.1, Math.max(0, (now - lastRotateTime) / 1000));
        lastRotateTime = now;
        if (!autoRotate || reduceMotion || global.document.hidden || !viewer) return;
        var current = viewer.getPosition();
        current.yaw = (current.yaw + elapsed * 0.035) % (Math.PI * 2);
        viewer.rotate(current);
      }, 50);
    }

    function setPanorama(url) {
      var request = ++loadId;
      if (disposed) return Promise.reject(new Error("Viewer has been disposed"));
      if (!url) { clear(); return Promise.resolve({ url: null, originalWidth: 0, originalHeight: 0 }); }
      if (director) stopDirector();
      if (!viewer) createViewer();
      return viewer.setPanorama(url, { transition: false }).then(function onLoaded(loaded) {
        if (request !== loadId || disposed || !viewer) return { stale: true, url: url };
        if (loaded === false) throw new Error("Panorama loading was aborted");
        var data = viewer.state.textureData && viewer.state.textureData.panoData;
        state = getView();
        startAutoRotateTimer();
        return { url: url, originalWidth: data && data.fullWidth || 0, originalHeight: data && data.fullHeight || 0, scaledWidth: data && data.fullWidth || 0, scaledHeight: data && data.fullHeight || 0, loaded: loaded };
      }).catch(function onLoadError(error) {
        if (request !== loadId || disposed) return { stale: true, url: url };
        throw error;
      });
    }

    function destroyViewer() {
      if (!viewer) return;
      var instance = viewer;
      var renderer = instance.renderer && instance.renderer.renderer;
      var canvas = renderer && renderer.domElement;
      viewer = null;
      if (canvas) {
        canvas.removeEventListener("webglcontextlost", onContextLost, false);
        canvas.removeEventListener("webglcontextrestored", onContextRestored, false);
      }
      instance.destroy();
      if (renderer && typeof renderer.forceContextLoss === "function") renderer.forceContextLoss();
    }

    function clear() {
      state = getView();
      loadId += 1;
      stopDirector();
      stopAutoRotateTimer();
      if (viewer) {
        destroyViewer();
        element.replaceChildren();
        element.dataset.viewerEngine = "psv";
      }
    }

    function setView(view, duration) {
      view = view || {};
      var yaw = finite(view.yaw, state.yaw, -1e9, 1e9);
      var pitch = finite(view.pitch, state.pitch, -85, 85);
      var fov = finite(view.fov, state.fov, MIN_FOV, MAX_FOV);
      state = { yaw: wrapDegrees(yaw), pitch: pitch, fov: fov };
      if (viewer) {
        var position = { yaw: oldYawToPsvYaw(yaw), pitch: pitch * Math.PI / 180 };
        if (director) stopDirector();
        if (Number(duration) > 0) viewer.animate(Object.assign(position, { zoom: fovToZoom(fov), speed: Number(duration) }));
        else { viewer.rotate(position); viewer.zoom(fovToZoom(fov)); }
      }
      notify();
      return getView();
    }

    function project(yaw, pitch) {
      if (!viewer || !viewer.state.textureData) return { x: 0, y: 0, visible: false };
      var position = { yaw: oldYawToPsvYaw(finite(yaw, 180, -1e9, 1e9)), pitch: finite(pitch, 0, -90, 90) * Math.PI / 180 };
      var point = viewer.dataHelper.sphericalCoordsToViewerCoords(position);
      return { x: point.x, y: point.y, visible: viewer.dataHelper.isPointVisible(position) };
    }

    function zoomBy(delta) { return setView({ fov: getView().fov + Number(delta || 0) }); }
    function resetView() { stopDirector(); return setView({ yaw: 180, pitch: 0, fov: 75 }, 0); }
    function setAutorotate(enabled) {
      var changed = autoRotate !== (enabled === true);
      autoRotate = enabled === true;
      if (autoRotate) stopDirector();
      startAutoRotateTimer();
      if (changed) notify();
    }
    function toggleAutorotate() { setAutorotate(!autoRotate); return autoRotate; }

    function playDirector(keyframes, directorOptions) {
      stopDirector();
      if (!Array.isArray(keyframes) || !keyframes.length || !viewer || reduceMotion) return false;
      director = { keyframes: keyframes, index: 0, loop: !directorOptions || directorOptions.loop !== false };
      autoRotate = false;
      stopAutoRotateTimer();
      var id = ++directorId;
      function playNext() {
        if (disposed || id !== directorId || !viewer || !director) return;
        if (director.index >= director.keyframes.length) {
          if (!director.loop) { director = null; notify(); return; }
          director.index = 0;
        }
        var frame = director.keyframes[director.index++];
        var target = { yaw: finite(frame.yaw, 180, -1e9, 1e9), pitch: finite(frame.pitch, 0, -85, 85) };
        viewer.animate({ yaw: oldYawToPsvYaw(target.yaw), pitch: target.pitch * Math.PI / 180, zoom: fovToZoom(finite(frame.fov, 68, MIN_FOV, MAX_FOV)), speed: Math.max(500, Number(frame.duration) || 3200) });
        directorTimer = global.setTimeout(function nextFrame() {
          directorTimer = 0;
          playNext();
        }, Math.max(500, Number(frame.duration) || 3200) + Math.max(0, Number(frame.hold) || 500));
      }
      playNext();
      return true;
    }
    function stopDirector() {
      var wasPlaying = Boolean(director);
      directorId += 1;
      director = null;
      if (directorTimer) global.clearTimeout(directorTimer);
      directorTimer = 0;
      if (wasPlaying && viewer) viewer.stopAnimation();
      if (wasPlaying) notify();
    }

    function onUserInteraction(event) {
      if (event.type === "keydown" && !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "=", "-", "_"].includes(event.key)) return;
      if (event.target && event.target.closest && event.target.closest("input, textarea, select, button, a, [contenteditable='true']")) return;
      if (director) stopDirector();
      if (autoRotate) { autoRotate = false; startAutoRotateTimer(); notify(); }
      if (event.type === "keydown" && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        var current = getView();
        var step = event.shiftKey ? 15 : 5;
        if (event.key === "ArrowLeft") current.yaw -= step;
        if (event.key === "ArrowRight") current.yaw += step;
        if (event.key === "ArrowUp") current.pitch += step;
        if (event.key === "ArrowDown") current.pitch -= step;
        setView(current, 0);
        event.preventDefault();
        event.stopPropagation();
      }
    }

    function onVisibility() {
      if (global.document.hidden) { stopAutoRotateTimer(); if (director) stopDirector(); }
      else startAutoRotateTimer();
    }
    function onContextLost(event) {
      event.preventDefault();
      stopAutoRotateTimer();
      if (typeof options.onContextState === "function") options.onContextState("lost");
    }
    function onContextRestored() {
      if (!viewer) return;
      viewer.autoSize();
      viewer.needsUpdate();
      startAutoRotateTimer();
      if (typeof options.onContextState === "function") options.onContextState("restored");
    }
    global.document.addEventListener("visibilitychange", onVisibility);
    ["pointerdown", "wheel", "keydown"].forEach(function bindInput(type) { element.addEventListener(type, onUserInteraction, true); });
    setAutorotate(options.autorotate === true);

    return {
      normalizeMode: normalizeMode,
      modes: MODES,
      capabilities: { autorotate: true, director: true, autoDemo: true },
      getCapabilities: function getCapabilities() { return { autorotate: true, director: true, autoDemo: true }; },
      setPanorama: setPanorama,
      clear: clear,
      getEngine: function getEngine() { return "psv"; },
      getMaxTextureSize: function getMaxTextureSize() { return viewer ? viewer.renderer.renderer.capabilities.maxTextureSize : 4096; },
      resize: function resize() { if (viewer) viewer.autoSize(); },
      getView: getView,
      project: project,
      setView: setView,
      zoomBy: zoomBy,
      resetView: resetView,
      setAutorotate: setAutorotate,
      getAutorotate: function getAutorotate() { return autoRotate; },
      toggleAutorotate: toggleAutorotate,
      playDirector: playDirector,
      stopDirector: stopDirector,
      isDirectorPlaying: function isDirectorPlaying() { return Boolean(director); },
      dispose: function dispose() { if (disposed) return; state = getView(); loadId += 1; stopAutoRotateTimer(); stopDirector(); disposed = true; global.document.removeEventListener("visibilitychange", onVisibility); ["pointerdown", "wheel", "keydown"].forEach(function unbindInput(type) { element.removeEventListener(type, onUserInteraction, true); }); if (viewer) destroyViewer(); element.replaceChildren(); element.dataset.viewerEngine = "disposed"; }
    };
  }

  global.XinTPanoramaViewer = {
    normalizeMode: normalizeMode,
    modes: MODES,
    create: create,
    viewMapping: { oldYawToPsvYaw: oldYawToPsvYaw, psvYawToOldYaw: psvYawToOldYaw, fovToZoom: fovToZoom, zoomToFov: zoomToFov }
  };
})(window);
