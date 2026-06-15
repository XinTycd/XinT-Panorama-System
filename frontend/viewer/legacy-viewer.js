(function defineLegacyPanoramaViewer(global) {
  "use strict";

  var MIN_FOV = 30;
  var MAX_FOV = 105;
  function finite(value, fallback, min, max) {
    value = Number(value);
    return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
  }
  function wrap(value) { return ((value % 360) + 360) % 360; }

  function create(options) {
    options = options || {};
    var element = options.element;
    var THREE = options.THREE || global.THREE;
    if (!element || !THREE) throw new Error("Legacy viewer requires a container and local Three.js");
    var state = { yaw: finite(options.initialYaw, 180, -1e9, 1e9), pitch: finite(options.initialPitch, 0, -90, 90), fov: finite(options.initialFov, 75, MIN_FOV, MAX_FOV) };
    var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    if ("outputColorSpace" in renderer && THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
    else if ("outputEncoding" in renderer && THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(state.fov, 1, 0.1, 1600);
    var geometry = new THREE.SphereGeometry(500, 72, 48);
    geometry.scale(-1, 1, 1);
    var material = new THREE.MeshBasicMaterial({ color: 0x151515 });
    var sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.touchAction = "none";
    element.replaceChildren(renderer.domElement);
    element.tabIndex = 0;
    element.setAttribute("aria-label", "XinT 全景查看器");
    renderer.domElement.setAttribute("aria-label", "XinT 全景画布，拖动或使用方向键调整视角");
    element.dataset.viewerEngine = "legacy";
    element.dataset.viewerCompatibility = "active";

    var texture = null;
    var raf = 0;
    var resizeObserver = null;
    var disposed = false;
    var requestId = 0;
    var pointer = null;
    var viewVector = new THREE.Vector3();

    function updateCamera() {
      var phi = THREE.MathUtils.degToRad(90 - state.pitch);
      var theta = THREE.MathUtils.degToRad(state.yaw);
      var radius = 500;
      var target = new THREE.Vector3(radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi), radius * Math.sin(phi) * Math.sin(theta));
      camera.position.set(0, 0, 0);
      camera.up.set(0, 1, 0);
      camera.lookAt(target);
      camera.fov = state.fov;
      camera.updateProjectionMatrix();
      scheduleRender();
    }
    function scheduleRender() { if (!disposed && !global.document.hidden && !raf) raf = global.requestAnimationFrame(renderFrame); }
    function resize() {
      var width = Math.max(1, element.clientWidth || element.offsetWidth || 1);
      var height = Math.max(1, element.clientHeight || element.offsetHeight || 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      scheduleRender();
      notify();
    }
    function getView() { return { yaw: wrap(state.yaw), pitch: state.pitch, fov: state.fov, mode: "expand" }; }
    function notify() { if (typeof options.onViewChange === "function") options.onViewChange(getView()); }
    function stopDirector() {}
    function setView(view) {
      view = view || {};
      state = { yaw: wrap(finite(view.yaw, state.yaw, -1e9, 1e9)), pitch: finite(view.pitch, state.pitch, -90, 90), fov: finite(view.fov, state.fov, MIN_FOV, MAX_FOV) };
      updateCamera(); notify(); return getView();
    }
    function renderFrame() {
      raf = 0;
      if (disposed || global.document.hidden) return;
      renderer.render(scene, camera);
    }
    function setPanorama(url) {
      var id = ++requestId;
      if (disposed) return Promise.reject(new Error("Viewer has been disposed"));
      if (!url) { clear(); return Promise.resolve({ url: null, originalWidth: 0, originalHeight: 0, scaledWidth: 0, scaledHeight: 0 }); }
      var loader = new THREE.TextureLoader();
      loader.setCrossOrigin("anonymous");
      return new Promise(function load(resolve, reject) {
        loader.load(url, function loaded(nextTexture) {
          if (disposed || id !== requestId) { nextTexture.dispose(); resolve({ stale: true, url: url }); return; }
          if (texture) texture.dispose();
          texture = nextTexture;
          if ("colorSpace" in texture && THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
          else if ("encoding" in texture && THREE.sRGBEncoding) texture.encoding = THREE.sRGBEncoding;
          var image = texture.image || {};
          var originalWidth = image.naturalWidth || image.width || 0;
          var originalHeight = image.naturalHeight || image.height || 0;
          var maxTextureSize = renderer.capabilities.maxTextureSize || 4096;
          if (originalWidth > maxTextureSize || originalHeight > maxTextureSize) {
            var scale = Math.min(maxTextureSize / originalWidth, maxTextureSize / originalHeight);
            var canvas = global.document.createElement("canvas");
            canvas.width = Math.max(1, Math.floor(originalWidth * scale));
            canvas.height = Math.max(1, Math.floor(originalHeight * scale));
            canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
            texture.dispose();
            texture = new THREE.CanvasTexture(canvas);
            if ("colorSpace" in texture && THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
            else if ("encoding" in texture && THREE.sRGBEncoding) texture.encoding = THREE.sRGBEncoding;
          }
          texture.needsUpdate = true;
          material.map = texture; material.color.set(0xffffff); material.needsUpdate = true;
          updateCamera();
          var scaledImage = texture.image || {};
          resolve({ url: url, originalWidth: originalWidth, originalHeight: originalHeight, scaledWidth: scaledImage.naturalWidth || scaledImage.width || 0, scaledHeight: scaledImage.naturalHeight || scaledImage.height || 0 });
        }, undefined, function failed(error) { if (id !== requestId || disposed) resolve({ stale: true, url: url }); else reject(error instanceof Error ? error : new Error("Panorama failed to load")); });
      });
    }
    function clear() { requestId += 1; if (texture) texture.dispose(); texture = null; material.map = null; material.color.set(0x151515); material.needsUpdate = true; scheduleRender(); }
    function project(yaw, pitch) {
      if (!texture) return { x: 0, y: 0, visible: false };
      var phi = THREE.MathUtils.degToRad(90 - finite(pitch, 0, -90, 90)); var theta = THREE.MathUtils.degToRad(finite(yaw, 180, -1e9, 1e9));
      viewVector.set(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
      var cameraDirection = new THREE.Vector3(); camera.getWorldDirection(cameraDirection);
      var visible = cameraDirection.dot(viewVector) > 0;
      var projected = viewVector.project(camera);
      var rect = renderer.domElement.getBoundingClientRect();
      var inViewport = projected.x >= -1 && projected.x <= 1 && projected.y >= -1 && projected.y <= 1 && projected.z >= -1 && projected.z <= 1;
      return { x: (projected.x + 1) * rect.width / 2, y: (1 - projected.y) * rect.height / 2, visible: visible && inViewport };
    }
    function zoomBy(delta) { return setView({ fov: state.fov + Number(delta || 0) }); }
    function setAutorotate(enabled) { return false; }
    function playDirector(frames, options) { return false; }
    function onPointerDown(event) { if (event.target !== renderer.domElement || event.button !== 0) return; pointer = { id: event.pointerId, x: event.clientX, y: event.clientY }; if (element.focus) element.focus({ preventScroll: true }); renderer.domElement.setPointerCapture(event.pointerId); }
    function onPointerMove(event) { if (!pointer || event.pointerId !== pointer.id) return; var rect = renderer.domElement.getBoundingClientRect(); state.yaw = wrap(state.yaw - (event.clientX - pointer.x) / Math.max(1, rect.width) * 180); state.pitch = finite(state.pitch + (event.clientY - pointer.y) / Math.max(1, rect.height) * 110, 0, -90, 90); pointer.x = event.clientX; pointer.y = event.clientY; updateCamera(); notify(); }
    function onPointerUp(event) { if (!pointer || event.pointerId === undefined || event.pointerId === pointer.id) pointer = null; }
    function onWheel(event) { state.fov = finite(state.fov + Math.sign(event.deltaY) * 3, state.fov, MIN_FOV, MAX_FOV); updateCamera(); notify(); event.preventDefault(); }
    function onKey(event) { if (!element.contains(global.document.activeElement) || !/^Arrow/.test(event.key)) return; stopDirector(); var step = event.shiftKey ? 15 : 5; if (event.key === "ArrowLeft") state.yaw -= step; if (event.key === "ArrowRight") state.yaw += step; if (event.key === "ArrowUp") state.pitch += step; if (event.key === "ArrowDown") state.pitch -= step; state.yaw = wrap(state.yaw); state.pitch = finite(state.pitch, 0, -90, 90); updateCamera(); notify(); event.preventDefault(); event.stopPropagation(); }
    function onVisibility() { if (global.document.hidden) { if (raf) global.cancelAnimationFrame(raf); raf = 0; } else scheduleRender(); }
    function onContextLost(event) { event.preventDefault(); if (typeof options.onContextState === "function") options.onContextState("lost"); }
    function onContextRestored() { resize(); if (texture) texture.needsUpdate = true; if (typeof options.onContextState === "function") options.onContextState("restored"); }
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerUp);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
    renderer.domElement.addEventListener("webglcontextlost", onContextLost, false);
    renderer.domElement.addEventListener("webglcontextrestored", onContextRestored, false);
    element.addEventListener("keydown", onKey, true);
    global.document.addEventListener("visibilitychange", onVisibility);
    if (global.ResizeObserver) { resizeObserver = new ResizeObserver(resize); resizeObserver.observe(element); } else global.addEventListener("resize", resize);
    resize(); updateCamera();
    return {
      normalizeMode: function () { return "expand"; }, modes: [{ key: "expand", label: "展开模式" }], capabilities: { autorotate: false, director: false, autoDemo: false }, getCapabilities: function () { return { autorotate: false, director: false, autoDemo: false }; },
      setPanorama: setPanorama, clear: clear, getEngine: function () { return "legacy"; }, getMaxTextureSize: function () { return renderer.capabilities.maxTextureSize; }, resize: resize,
      getView: getView, project: project, setView: setView, zoomBy: zoomBy, resetView: function () { return setView({ yaw: 180, pitch: 0, fov: 75 }); },
      setAutorotate: setAutorotate, getAutorotate: function () { return false; }, toggleAutorotate: function () { return false; },
      playDirector: playDirector, stopDirector: stopDirector, isDirectorPlaying: function () { return false; },
      dispose: function () { if (disposed) return; clear(); disposed = true; if (raf) global.cancelAnimationFrame(raf); raf = 0; global.document.removeEventListener("visibilitychange", onVisibility); element.removeEventListener("keydown", onKey, true); renderer.domElement.removeEventListener("pointerdown", onPointerDown); renderer.domElement.removeEventListener("pointermove", onPointerMove); renderer.domElement.removeEventListener("pointerup", onPointerUp); renderer.domElement.removeEventListener("pointercancel", onPointerUp); renderer.domElement.removeEventListener("wheel", onWheel); renderer.domElement.removeEventListener("webglcontextlost", onContextLost, false); renderer.domElement.removeEventListener("webglcontextrestored", onContextRestored, false); if (resizeObserver) resizeObserver.disconnect(); else global.removeEventListener("resize", resize); geometry.dispose(); material.dispose(); renderer.dispose(); if (renderer.forceContextLoss) renderer.forceContextLoss(); element.replaceChildren(); element.dataset.viewerEngine = "disposed"; }
    };
  }

  global.XinTLegacyPanoramaViewer = { create: create };
})(window);
