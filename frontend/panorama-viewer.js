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
  function abortError(message) {
    var error = new Error(message || "Panorama loading was aborted");
    error.name = "AbortError";
    return error;
  }

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
    var generation = 0;
    var lifecycle = { generation: 0, disposed: false, cancelDecodes: function cancelDecodes() {} };
    var activeLoads = new Map();
    var retryTimers = new Set();
    var pendingDecodes = new Set();
    var loadedUrl = null;
    var loadedResult = null;
    var directorId = 0;
    var director = null;
    var directorTimer = 0;
    var autoRotate = false;
    var reduceMotion = false;
    var contextLost = false;
    var pageSuspended = false;
    var skipNextRotateFrame = true;
    var notifyFrame = 0;
    var disposed = false;
    var state = { yaw: finite(options.initialYaw, 180, -1e9, 1e9), pitch: finite(options.initialPitch, 0, -85, 85), fov: finite(options.initialFov, 75, MIN_FOV, MAX_FOV) };
    var motionQuery = global.matchMedia ? global.matchMedia("(prefers-reduced-motion: reduce)") : null;
    reduceMotion = Boolean(motionQuery && motionQuery.matches);

    function getView() {
      if (viewer) {
        var position = viewer.getPosition();
        state.yaw = psvYawToOldYaw(position.yaw);
        state.pitch = finite(position.pitch * 180 / Math.PI, state.pitch, -90, 90);
        state.fov = zoomToFov(viewer.getZoomLevel());
      }
      return { yaw: wrapDegrees(state.yaw), pitch: state.pitch, fov: state.fov, mode: "expand" };
    }

    function notifyNow() {
      if (disposed || pageSuspended || contextLost || global.document.hidden || typeof options.onViewChange !== "function") return;
      options.onViewChange(getView());
    }

    function scheduleNotify() {
      if (disposed || pageSuspended || contextLost || global.document.hidden || notifyFrame) return;
      var request = global.requestAnimationFrame || function fallback(callback) { return global.setTimeout(callback, 16); };
      notifyFrame = request(function flushViewChange() {
        notifyFrame = 0;
        notifyNow();
      });
    }

    function cancelNotify() {
      if (!notifyFrame) return;
      if (global.cancelAnimationFrame) global.cancelAnimationFrame(notifyFrame);
      else global.clearTimeout(notifyFrame);
      notifyFrame = 0;
    }

    function cancelPendingDecodes() {
      Array.from(pendingDecodes).forEach(function cancelDecode(decode) { decode.abort(); });
    }
    lifecycle.cancelDecodes = cancelPendingDecodes;

    function prepareSvgBlob(blob, decode) {
      if (!blob || !blob.slice || (blob.type && !/^(?:application\/octet-stream|text\/plain)$/i.test(blob.type))) return Promise.resolve(blob);
      return blob.slice(0, 2048).text().then(function inspectImageHeader(header) {
        if (decode.cancelled) throw abortError();
        var prefix = header.replace(/^\uFEFF/, "").trimStart();
        var isSvg = /^(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg\b/i.test(prefix);
        if (!isSvg) return blob;
        return new global.Blob([blob], { type: "image/svg+xml" });
      });
    }

    function decodeBlob(blob) {
      var decode = { cancelled: false, image: null, objectUrl: null, settle: null, abort: null };
      pendingDecodes.add(decode);
      return new Promise(function loadBlob(resolve, reject) {
        var settled = false;
        function finish(error, image) {
          if (settled) return;
          settled = true;
          pendingDecodes.delete(decode);
          if (decode.objectUrl) {
            global.URL.revokeObjectURL(decode.objectUrl);
            decode.objectUrl = null;
          }
          if (decode.image) {
            decode.image.onload = null;
            decode.image.onerror = null;
            decode.image.onabort = null;
          }
          if (error) reject(error);
          else resolve(image);
        }
        decode.abort = function abortDecode() {
          decode.cancelled = true;
          if (decode.image) {
            decode.image.onload = null;
            decode.image.onerror = null;
            decode.image.onabort = null;
            try { decode.image.src = ""; } catch (_) {}
          }
          finish(abortError());
        };
        prepareSvgBlob(blob, decode).then(function createImage(preparedBlob) {
          if (decode.cancelled || settled) throw abortError();
          var image = new global.Image();
          decode.image = image;
          image.onload = function onImageLoad() { finish(null, image); };
          image.onerror = function onImageError() { finish(new Error("The panorama image could not be decoded. Check that the file is a supported image.")); };
          image.onabort = function onImageAbort() { finish(abortError()); };
          decode.objectUrl = global.URL.createObjectURL(preparedBlob);
          image.src = decode.objectUrl;
        }).catch(function onPrepareError(error) { finish(error); });
      });
    }

    function installBlobDecoder(instance) {
      if (!instance.textureLoader || typeof instance.textureLoader.blobToImage !== "function") return;
      instance.textureLoader.blobToImage = decodeBlob;
    }

    function detachViewerEvents(instance, listeners) {
      listeners.forEach(function removeViewerListener(pair) { instance.removeEventListener(pair[0], pair[1]); });
    }

    function createViewer() {
      if (disposed) throw new Error("Viewer has been disposed");
      element.replaceChildren();
      var adapter = global.XinTPSV.createGenerationGuardedAdapter
        ? global.XinTPSV.createGenerationGuardedAdapter(lifecycle)
        : null;
      var instance = new global.XinTPSV.Viewer({
        container: element,
        panorama: null,
        adapter: adapter ? [adapter, null] : undefined,
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
      if (!instance.renderer || !instance.renderer.renderer || !instance.textureLoader || !instance.dataHelper) {
        try { if (instance.destroy) instance.destroy(); } catch (_) {}
        element.replaceChildren();
        throw new Error("此浏览器无法启动 Photo Sphere Viewer，可在设置选择兼容原引擎");
      }
      viewer = instance;
      installBlobDecoder(instance);
      element.dataset.viewerEngine = "psv";
      element.dataset.viewerCompatibility = "inactive";
      var boundListeners = [];
      function listen(type, callback) {
        var handler = function handleViewerEvent(event) {
          if (disposed || viewer !== instance) return;
          callback(event);
        };
        instance.addEventListener(type, handler);
        boundListeners.push([type, handler]);
      }
      listen("position-updated", scheduleNotify);
      listen("zoom-updated", scheduleNotify);
      listen("size-updated", function onSizeUpdated() { updatePixelRatio(instance); scheduleNotify(); });
      listen("before-render", onBeforeRender);
      instance.__xintListeners = boundListeners;
      element.tabIndex = 0;
      element.setAttribute("aria-label", "XinT 全景查看器");
      var canvas = instance.renderer.renderer.domElement;
      canvas.setAttribute("aria-label", "XinT 全景画布，拖动或使用方向键调整视角");
      canvas.addEventListener("webglcontextlost", onContextLost, false);
      canvas.addEventListener("webglcontextrestored", onContextRestored, false);
      updatePixelRatio(instance);
      return instance;
    }

    function updatePixelRatio(instance) {
      if (!instance || !instance.renderer || !instance.renderer.renderer || disposed) return;
      var width = Math.max(1, element.clientWidth || element.offsetWidth || 1);
      var height = Math.max(1, element.clientHeight || element.offsetHeight || 1);
      var dpr = Math.max(0.01, Number(global.devicePixelRatio) || 1);
      var ratio = Math.min(2, dpr, Math.sqrt(4000000 / (width * height)));
      var renderer = instance.renderer.renderer;
      if (typeof renderer.getPixelRatio === "function" && Math.abs(renderer.getPixelRatio() - ratio) > 0.01) renderer.setPixelRatio(ratio);
    }

    function onBeforeRender(event) {
      if (!autoRotate || reduceMotion || disposed || pageSuspended || contextLost || global.document.hidden || !viewer) return;
      if (skipNextRotateFrame) { skipNextRotateFrame = false; return; }
      var elapsed = Math.min(100, Math.max(0, Number(event && event.elapsed) || 0)) / 1000;
      if (!elapsed) return;
      var position = viewer.getPosition();
      position.yaw = (position.yaw + elapsed * 0.035) % (Math.PI * 2);
      viewer.rotate(position);
    }

    function stopAutomaticMotion() {
      autoRotate = false;
      stopDirector();
    }

    function setPanorama(url, loadOptions) {
      if (disposed) return Promise.reject(new Error("Viewer has been disposed"));
      if (!url) { clear(); return Promise.resolve({ url: null, originalWidth: 0, originalHeight: 0 }); }
      url = String(url);
      loadOptions = loadOptions || {};
      if (director) stopDirector();
      if (loadOptions.force !== true && url === loadedUrl && loadedResult) return Promise.resolve(Object.assign({}, loadedResult));
      var existing = activeLoads.get(url);
      if (loadOptions.force !== true && existing && existing.generation === generation) return existing.promise;

      generation += 1;
      lifecycle.generation = generation;
      loadedUrl = null;
      loadedResult = null;
      cancelPendingDecodes();
      var requestGeneration = generation;
      var instance;
      try { instance = viewer || createViewer(); }
      catch (error) { return Promise.reject(error); }
      var resolveStale;
      var stalePromise = new Promise(function createStaleResult(resolve) { resolveStale = resolve; });
      var load = { generation: requestGeneration, resolveStale: resolveStale, promise: null };
      activeLoads.forEach(function stalePreviousLoad(previous) {
        if (previous.generation !== requestGeneration) previous.resolveStale({ stale: true, url: previous.url });
      });
      load.url = url;
      load.promise = Promise.race([
        startCurrentLoad(instance, url, requestGeneration, 0),
        stalePromise
      ]).then(function onLoaded(loaded) {
        if (requestGeneration !== generation || disposed || viewer !== instance || loaded && loaded.stale) return { stale: true, url: url };
        if (loaded === false) throw abortError();
        var textureData = instance.state && instance.state.textureData;
        var data = textureData && textureData.panoData;
        var result = { url: url, originalWidth: data && data.fullWidth || 0, originalHeight: data && data.fullHeight || 0, scaledWidth: data && data.fullWidth || 0, scaledHeight: data && data.fullHeight || 0, loaded: loaded };
        state = getView();
        loadedUrl = url;
        loadedResult = result;
        skipNextRotateFrame = true;
        return Object.assign({}, result);
      }).catch(function onLoadError(error) {
        if (requestGeneration !== generation || disposed || viewer !== instance || error && error.name === "AbortError") return { stale: true, url: url };
        throw error;
      }).finally(function releaseLoad() {
        if (activeLoads.get(url) === load) activeLoads.delete(url);
      });
      activeLoads.set(url, load);
      return load.promise;
    }

    function destroyViewer() {
      if (!viewer) return;
      var instance = viewer;
      var renderer = instance.renderer && instance.renderer.renderer;
      var canvas = renderer && renderer.domElement;
      viewer = null;
      if (instance.__xintListeners) detachViewerEvents(instance, instance.__xintListeners);
      if (canvas) {
        canvas.removeEventListener("webglcontextlost", onContextLost, false);
        canvas.removeEventListener("webglcontextrestored", onContextRestored, false);
      }
      try {
        if (typeof instance.stopAll === "function") instance.stopAll();
        instance.destroy();
      } finally {
        if (renderer && typeof renderer.forceContextLoss === "function") renderer.forceContextLoss();
      }
    }

    function invalidateLoads() {
      generation += 1;
      lifecycle.generation = generation;
      activeLoads.forEach(function settleStaleLoad(load) { load.resolveStale({ stale: true, url: load.url }); });
      activeLoads.clear();
      retryTimers.forEach(function clearRetryTimer(timer) { global.clearTimeout(timer); });
      retryTimers.clear();
      loadedUrl = null;
      loadedResult = null;
      cancelPendingDecodes();
    }

    function startCurrentLoad(instance, url, requestGeneration, retry) {
      return Promise.resolve().then(function checkBeforeLoad() {
        if (requestGeneration !== generation || disposed || viewer !== instance) return { stale: true, url: url };
        return instance.setPanorama(url, { transition: false });
      }).then(function retryAbortedLoad(loaded) {
        if (loaded !== false || retry > 0) return loaded;
        return retryLoad();
      }, function retryAbortError(error) {
        if (!error || error.name !== "AbortError" || retry > 0) throw error;
        return retryLoad();
      });

      function retryLoad() {
        return new Promise(function waitOneTask(resolve) {
          var timer = global.setTimeout(function retryTaskElapsed() {
            retryTimers.delete(timer);
            resolve();
          }, 0);
          retryTimers.add(timer);
        }).then(function verifyRetry() {
          if (requestGeneration !== generation || disposed || viewer !== instance) return { stale: true, url: url };
          return instance.setPanorama(url, { transition: false });
        }).then(function validateRetry(loaded) {
          if (loaded === false) throw new Error("The panorama request was interrupted. Please try loading it again.");
          return loaded;
        }, function explainRetryFailure(error) {
          if (error && error.name === "AbortError") throw new Error("The panorama request was interrupted. Please try loading it again.");
          throw error;
        });
      }
    }

    function clear() {
      if (disposed) return;
      state = getView();
      invalidateLoads();
      stopDirector();
      autoRotate = false;
      if (viewer) destroyViewer();
      element.replaceChildren();
      element.dataset.viewerEngine = "psv";
      element.dataset.viewerCompatibility = "inactive";
      contextLost = false;
      cancelNotify();
    }

    function setView(view, duration, manual) {
      if (disposed) return getView();
      view = view || {};
      var yaw = finite(view.yaw, state.yaw, -1e9, 1e9);
      var pitch = finite(view.pitch, state.pitch, -85, 85);
      var fov = finite(view.fov, state.fov, MIN_FOV, MAX_FOV);
      state = { yaw: wrapDegrees(yaw), pitch: pitch, fov: fov };
      if (manual) stopAutomaticMotion();
      if (manual && viewer && typeof viewer.stopAll === "function") viewer.stopAll();
      if (viewer) {
        var position = { yaw: oldYawToPsvYaw(yaw), pitch: pitch * Math.PI / 180 };
        if (director) stopDirector();
        if (Number(duration) > 0 && !reduceMotion) viewer.animate(Object.assign(position, { zoom: fovToZoom(fov), speed: Number(duration) }));
        else { viewer.rotate(position); viewer.zoom(fovToZoom(fov)); }
      }
      scheduleNotify();
      return getView();
    }

    function project(yaw, pitch) {
      if (disposed || !viewer || !viewer.state.textureData) return { x: 0, y: 0, visible: false };
      var position = { yaw: oldYawToPsvYaw(finite(yaw, 180, -1e9, 1e9)), pitch: finite(pitch, 0, -90, 90) * Math.PI / 180 };
      var point = viewer.dataHelper.sphericalCoordsToViewerCoords(position);
      return { x: point.x, y: point.y, visible: viewer.dataHelper.isPointVisible(position) };
    }

    function zoomBy(delta) {
      if (disposed) return getView();
      stopAutomaticMotion();
      return setView({ fov: getView().fov + Number(delta || 0) }, 0, true);
    }

    function resetView() {
      if (disposed) return getView();
      stopAutomaticMotion();
      return setView({ yaw: 180, pitch: 0, fov: 75 }, 0, true);
    }

    function setAutorotate(enabled) {
      if (disposed) return false;
      var next = enabled === true && !reduceMotion;
      var changed = autoRotate !== next;
      autoRotate = next;
      if (autoRotate) {
        stopDirector();
        skipNextRotateFrame = true;
        if (viewer) viewer.needsUpdate();
      }
      if (changed) scheduleNotify();
      return autoRotate;
    }

    function playDirector(keyframes, directorOptions) {
      stopDirector();
      if (disposed || !Array.isArray(keyframes) || !keyframes.length || !viewer || reduceMotion) return false;
      director = { keyframes: keyframes, index: 0, loop: !directorOptions || directorOptions.loop !== false };
      autoRotate = false;
      var id = ++directorId;
      function playNext() {
        if (disposed || id !== directorId || !viewer || !director) return;
        if (director.index >= director.keyframes.length) {
          if (!director.loop) { director = null; scheduleNotify(); return; }
          director.index = 0;
        }
        var instance = viewer;
        var frame = director.keyframes[director.index++];
        var duration = Math.max(500, Number(frame.duration) || 3200);
        var target = { yaw: finite(frame.yaw, 180, -1e9, 1e9), pitch: finite(frame.pitch, 0, -85, 85) };
        var animation;
        try { animation = instance.animate({ yaw: oldYawToPsvYaw(target.yaw), pitch: target.pitch * Math.PI / 180, zoom: fovToZoom(finite(frame.fov, 68, MIN_FOV, MAX_FOV)), speed: duration }); }
        catch (_) { stopDirector(); return; }
        Promise.resolve(animation).then(function afterAnimation(completed) {
          if (disposed || id !== directorId || viewer !== instance || !director) return;
          if (completed === false) { stopDirector(); return; }
          directorTimer = global.setTimeout(function nextFrame() {
            directorTimer = 0;
            playNext();
          }, Math.max(0, Number.isFinite(Number(frame.hold)) ? Number(frame.hold) : 500));
        }).catch(function ignoreCancelledAnimation() {});
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
      if (wasPlaying) scheduleNotify();
    }

    function onUserInteraction(event) {
      var keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "=", "-", "_"];
      if (event.type === "keydown" && (!keys.includes(event.key) || event.ctrlKey || event.metaKey || event.altKey)) return;
      if (event.target && event.target.closest && event.target.closest("input, textarea, select, button, a, [contenteditable='true']")) return;
      if (director) stopDirector();
      if (autoRotate) setAutorotate(false);
      if (event.type !== "keydown") return;
      var current = getView();
      var step = event.shiftKey ? 15 : 5;
      if (event.key === "ArrowLeft") current.yaw -= step;
      if (event.key === "ArrowRight") current.yaw += step;
      if (event.key === "ArrowUp") current.pitch += step;
      if (event.key === "ArrowDown") current.pitch -= step;
      if (["+", "="].includes(event.key)) current.fov -= step;
      if (["-", "_"].includes(event.key)) current.fov += step;
      setView(current, 0, true);
      event.preventDefault();
      event.stopPropagation();
    }

    function onVisibility() {
      if (global.document.hidden) {
        skipNextRotateFrame = true;
        cancelNotify();
        if (director) stopDirector();
      } else {
        skipNextRotateFrame = true;
        if (viewer && !contextLost) { viewer.autoSize(); viewer.needsUpdate(); }
        scheduleNotify();
      }
    }

    function onMotionChange(event) {
      reduceMotion = Boolean(event.matches);
      if (reduceMotion) {
        autoRotate = false;
        stopDirector();
        scheduleNotify();
      }
    }

    function onContextLost(event) {
      event.preventDefault();
      contextLost = true;
      skipNextRotateFrame = true;
      cancelNotify();
      if (director) stopDirector();
      if (typeof options.onContextState === "function") options.onContextState("lost");
    }

    function onContextRestored() {
      if (!viewer || disposed) return;
      contextLost = false;
      skipNextRotateFrame = true;
      viewer.autoSize();
      viewer.needsUpdate();
      if (typeof options.onContextState === "function") options.onContextState("restored");
      scheduleNotify();
    }

    function onPageHide(event) {
      if (event && event.persisted) {
        pageSuspended = true;
        cancelNotify();
        skipNextRotateFrame = true;
        if (director) stopDirector();
        return;
      }
      if (!disposed) dispose();
    }

    function onPageShow(event) {
      if (!event || !event.persisted || disposed) return;
      pageSuspended = false;
      skipNextRotateFrame = true;
      onVisibility();
    }

    global.document.addEventListener("visibilitychange", onVisibility);
    ["pointerdown", "wheel", "keydown"].forEach(function bindInput(type) { element.addEventListener(type, onUserInteraction, true); });
    if (motionQuery) {
      if (motionQuery.addEventListener) motionQuery.addEventListener("change", onMotionChange);
      else if (motionQuery.addListener) motionQuery.addListener(onMotionChange);
    }
    if (global.addEventListener) global.addEventListener("pagehide", onPageHide);
    if (global.addEventListener) global.addEventListener("pageshow", onPageShow);
    setAutorotate(options.autorotate === true);

    function dispose() {
      if (disposed) return;
      state = getView();
      invalidateLoads();
      lifecycle.disposed = true;
      autoRotate = false;
      stopDirector();
      disposed = true;
      cancelNotify();
      global.document.removeEventListener("visibilitychange", onVisibility);
      ["pointerdown", "wheel", "keydown"].forEach(function unbindInput(type) { element.removeEventListener(type, onUserInteraction, true); });
      if (motionQuery) {
        if (motionQuery.removeEventListener) motionQuery.removeEventListener("change", onMotionChange);
        else if (motionQuery.removeListener) motionQuery.removeListener(onMotionChange);
      }
      if (global.removeEventListener) global.removeEventListener("pagehide", onPageHide);
      if (global.removeEventListener) global.removeEventListener("pageshow", onPageShow);
      try { if (viewer) destroyViewer(); }
      finally {
        element.replaceChildren();
        element.dataset.viewerEngine = "disposed";
      }
    }

    return {
      normalizeMode: normalizeMode,
      modes: MODES,
      capabilities: { autorotate: true, director: true, autoDemo: true },
      getCapabilities: function getCapabilities() { return { autorotate: true, director: true, autoDemo: true }; },
      setPanorama: setPanorama,
      clear: clear,
      getEngine: function getEngine() { return "psv"; },
      getMaxTextureSize: function getMaxTextureSize() { return viewer ? viewer.renderer.renderer.capabilities.maxTextureSize : 4096; },
      resize: function resize() { if (viewer && !disposed && !contextLost) viewer.autoSize(); },
      getView: getView,
      project: project,
      setView: setView,
      zoomBy: zoomBy,
      resetView: resetView,
      setAutorotate: setAutorotate,
      getAutorotate: function getAutorotate() { return autoRotate; },
      toggleAutorotate: function toggleAutorotate() { setAutorotate(!autoRotate); return autoRotate; },
      playDirector: playDirector,
      stopDirector: stopDirector,
      isDirectorPlaying: function isDirectorPlaying() { return Boolean(director); },
      dispose: dispose
    };
  }

  global.XinTPanoramaViewer = {
    normalizeMode: normalizeMode,
    modes: MODES,
    create: create,
    viewMapping: { oldYawToPsvYaw: oldYawToPsvYaw, psvYawToOldYaw: psvYawToOldYaw, fovToZoom: fovToZoom, zoomToFov: zoomToFov }
  };
})(window);
