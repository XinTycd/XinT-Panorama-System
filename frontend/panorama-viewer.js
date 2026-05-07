(function defineXinTPanoramaViewer(global) {
  var MODE_DEFINITIONS = [
    { key: "expand", label: "展开模式" },
    { key: "planet", label: "小行星模式" },
    { key: "tunnel", label: "隧道模式" },
    { key: "crystal", label: "水晶球模式" }
  ];

  var MODE_ALIASES = {
    normal: "expand",
    panorama: "expand",
    equirectangular: "expand",
    "little-planet": "planet",
    "small-planet": "planet",
    "crystal-ball": "crystal",
    sphere: "crystal"
  };

  function create(options) {
    var THREE = options.THREE || global.THREE;
    var element = options.element;

    if (!THREE) {
      throw new Error("THREE is required before XinTPanoramaViewer");
    }
    if (!element) {
      throw new Error("viewer element is required");
    }

    var state = {
      mode: normalizeMode(options.initialMode || options.mode || "expand"),
      autorotate: options.autorotate !== false,
      yaw: options.initialYaw === undefined ? 180 : Number(options.initialYaw),
      pitch: options.initialPitch === undefined ? 0 : Number(options.initialPitch),
      fov: options.initialFov === undefined ? 75 : Number(options.initialFov),
      dragging: false,
      lastX: 0,
      lastY: 0,
      disposed: false,
      frameId: 0,
      startedAt: now()
    };

    var renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance"
    });
    if ("outputColorSpace" in renderer && THREE.SRGBColorSpace) {
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    } else if ("outputEncoding" in renderer && THREE.sRGBEncoding) {
      renderer.outputEncoding = THREE.sRGBEncoding;
    }
    renderer.setClearColor(0x050505, 0);
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "none";
    element.appendChild(renderer.domElement);

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1600);
    var world = new THREE.Group();
    scene.add(world);

    var placeholderTexture = createPlaceholderTexture(THREE);
    var expandMaterial = new THREE.MeshBasicMaterial({ color: 0x151515, map: placeholderTexture });
    var expandGeometry = new THREE.SphereGeometry(500, 72, 48);
    expandGeometry.scale(-1, 1, 1);
    var expandMesh = new THREE.Mesh(expandGeometry, expandMaterial);
    world.add(expandMesh);

    var crystal = createCrystalStage(THREE, placeholderTexture);
    world.add(crystal.root);

    var effectScene = new THREE.Scene();
    var effectCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    var planetMaterial = createProjectionMaterial(THREE, placeholderTexture, getPlanetFragmentShader());
    var tunnelMaterial = createProjectionMaterial(THREE, placeholderTexture, getTunnelFragmentShader());
    var effectMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), planetMaterial);
    effectScene.add(effectMesh);

    var currentTexture = null;
    var resizeObserver = null;

    bindPointerControls();
    bindResize();
    resize();
    updateModeVisibility();
    animate();

    return {
      setTexture: setTexture,
      clear: clear,
      setMode: setMode,
      getMode: function getMode() {
        return state.mode;
      },
      setAutorotate: setAutorotate,
      getAutorotate: function getAutorotate() {
        return state.autorotate;
      },
      toggleAutorotate: function toggleAutorotate() {
        setAutorotate(!state.autorotate);
        return state.autorotate;
      },
      resetView: resetView,
      resize: resize,
      getMaxTextureSize: function getMaxTextureSize() {
        return renderer.capabilities.maxTextureSize || 4096;
      },
      dispose: dispose
    };

    function bindPointerControls() {
      var canvas = renderer.domElement;

      canvas.addEventListener("pointerdown", function onPointerDown(event) {
        state.dragging = true;
        state.lastX = event.clientX;
        state.lastY = event.clientY;
        canvas.setPointerCapture(event.pointerId);
      });

      canvas.addEventListener("pointermove", function onPointerMove(event) {
        if (!state.dragging) {
          return;
        }

        var dx = event.clientX - state.lastX;
        var dy = event.clientY - state.lastY;
        var dragSpeed = state.mode === "crystal" ? 0.18 : 0.12;

        state.yaw -= dx * dragSpeed;
        state.pitch += dy * dragSpeed;
        state.lastX = event.clientX;
        state.lastY = event.clientY;
        clampView();
      });

      function stopDragging(event) {
        state.dragging = false;
        if (event.pointerId !== undefined && canvas.hasPointerCapture(event.pointerId)) {
          canvas.releasePointerCapture(event.pointerId);
        }
      }

      canvas.addEventListener("pointerup", stopDragging);
      canvas.addEventListener("pointercancel", stopDragging);
      canvas.addEventListener(
        "wheel",
        function onWheel(event) {
          event.preventDefault();
          state.fov += event.deltaY * 0.03;
          state.fov = clamp(state.fov, 35, 95);
          updateCameraProjection();
        },
        { passive: false }
      );
    }

    function bindResize() {
      global.addEventListener("resize", resize);
      if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(element);
      }
    }

    function setTexture(texture) {
      if (!texture) {
        clear();
        return;
      }

      applyTextureSettings(THREE, texture);
      if (currentTexture && currentTexture !== texture) {
        currentTexture.dispose();
      }
      currentTexture = texture;

      expandMaterial.map = texture;
      expandMaterial.color.setHex(0xffffff);
      expandMaterial.needsUpdate = true;

      crystal.surface.material.map = texture;
      crystal.surface.material.color.setHex(0xffffff);
      crystal.surface.material.needsUpdate = true;

      planetMaterial.uniforms.uTexture.value = texture;
      tunnelMaterial.uniforms.uTexture.value = texture;
    }

    function clear() {
      if (currentTexture) {
        currentTexture.dispose();
        currentTexture = null;
      }

      expandMaterial.map = placeholderTexture;
      expandMaterial.color.setHex(0x151515);
      expandMaterial.needsUpdate = true;

      crystal.surface.material.map = placeholderTexture;
      crystal.surface.material.color.setHex(0x151515);
      crystal.surface.material.needsUpdate = true;

      planetMaterial.uniforms.uTexture.value = placeholderTexture;
      tunnelMaterial.uniforms.uTexture.value = placeholderTexture;
    }

    function setMode(nextMode) {
      var normalized = normalizeMode(nextMode);
      if (state.mode === normalized) {
        return state.mode;
      }

      var wasStereographic = isStereographicMode(state.mode);
      state.mode = normalized;
      if (isStereographicMode(state.mode) && !wasStereographic) {
        state.pitch = 0;
        state.fov = 52;
      } else if (!isStereographicMode(state.mode) && wasStereographic) {
        state.pitch = clamp(state.pitch, -40, 40);
        state.fov = 75;
      }
      clampView();
      updateModeVisibility();
      updateCameraProjection();
      return state.mode;
    }

    function setAutorotate(value) {
      state.autorotate = value !== false;
    }

    function resetView() {
      state.yaw = state.mode === "crystal" ? 0 : 180;
      state.pitch = 0;
      state.fov = isStereographicMode(state.mode) ? 52 : 75;
      updateCameraProjection();
    }

    function resize() {
      var width = Math.max(1, element.clientWidth || element.offsetWidth || 1);
      var height = Math.max(1, element.clientHeight || element.offsetHeight || 1);

      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      updateCameraProjection();
      updateProjectionUniforms();
    }

    function updateModeVisibility() {
      expandMesh.visible = state.mode === "expand";
      crystal.root.visible = state.mode === "crystal";
      effectMesh.material = state.mode === "tunnel" ? tunnelMaterial : planetMaterial;
    }

    function updateCameraProjection() {
      if (state.mode === "crystal") {
        camera.fov = mapRange(state.fov, 35, 95, 36, 62);
      } else {
        camera.fov = state.fov;
      }
      camera.updateProjectionMatrix();
    }

    function animate() {
      if (state.disposed) {
        return;
      }

      state.frameId = global.requestAnimationFrame(animate);
      if (state.autorotate && !state.dragging) {
        state.yaw += state.mode === "tunnel" ? 0.045 : 0.028;
      }

      clampView();
      updateProjectionUniforms();

      if (state.mode === "expand") {
        updateExpandCamera();
        renderer.render(scene, camera);
      } else if (state.mode === "crystal") {
        updateCrystalCamera();
        renderer.render(scene, camera);
      } else {
        renderer.render(effectScene, effectCamera);
      }
    }

    function updateExpandCamera() {
      var phi = THREE.MathUtils.degToRad(90 - state.pitch);
      var theta = THREE.MathUtils.degToRad(state.yaw);
      var radius = 500;
      var target = new THREE.Vector3(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.sin(theta)
      );

      camera.position.set(0, 0, 0);
      camera.up.set(0, 1, 0);
      camera.lookAt(target);
    }

    function updateCrystalCamera() {
      var distance = mapRange(state.fov, 35, 95, 460, 700);

      crystal.pivot.rotation.y = THREE.MathUtils.degToRad(state.yaw);
      crystal.pivot.rotation.x = THREE.MathUtils.degToRad(clamp(state.pitch, -55, 55) * 0.5);
      crystal.ring.rotation.z += 0.002;

      camera.position.set(0, 0, distance);
      camera.up.set(0, 1, 0);
      camera.lookAt(new THREE.Vector3(0, 0, 0));
    }

    function updateProjectionUniforms() {
      var width = Math.max(1, element.clientWidth || 1);
      var height = Math.max(1, element.clientHeight || 1);
      var aspect = width / height;
      var yaw = THREE.MathUtils.degToRad(state.yaw);
      var pitch = THREE.MathUtils.degToRad(state.pitch);
      var zoom = mapRange(state.fov, 35, 95, 0.42, 1.08);
      var elapsed = (now() - state.startedAt) / 1000;

      setUniformSet(planetMaterial.uniforms, yaw, pitch, zoom, aspect, elapsed);
      setUniformSet(tunnelMaterial.uniforms, yaw, pitch, zoom, aspect, elapsed);
    }

    function setUniformSet(uniforms, yaw, pitch, zoom, aspect, elapsed) {
      uniforms.uYaw.value = yaw;
      uniforms.uPitch.value = pitch;
      uniforms.uZoom.value = zoom;
      uniforms.uAspect.value = aspect;
      uniforms.uTime.value = elapsed;
    }

    function clampView() {
      if (state.mode === "expand") {
        state.pitch = clamp(state.pitch, -85, 85);
      } else if (state.mode === "crystal") {
        state.pitch = clamp(state.pitch, -70, 70);
      } else {
        state.pitch = clamp(state.pitch, -35, 35);
      }
    }

    function dispose() {
      state.disposed = true;
      if (state.frameId) {
        global.cancelAnimationFrame(state.frameId);
      }
      global.removeEventListener("resize", resize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      clear();
      placeholderTexture.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    }
  }

  function createCrystalStage(THREE, placeholderTexture) {
    var root = new THREE.Group();
    var pivot = new THREE.Group();
    var surfaceMaterial = new THREE.MeshBasicMaterial({
      color: 0x151515,
      map: placeholderTexture
    });
    var surface = new THREE.Mesh(new THREE.SphereGeometry(185, 72, 48), surfaceMaterial);
    var glass = new THREE.Mesh(
      new THREE.SphereGeometry(196, 72, 48),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.13,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    var ring = new THREE.Mesh(
      new THREE.TorusGeometry(210, 1.4, 10, 128),
      new THREE.MeshBasicMaterial({
        color: 0xf5f5f5,
        transparent: true,
        opacity: 0.28
      })
    );
    var base = new THREE.Mesh(
      new THREE.CylinderGeometry(138, 206, 40, 72),
      new THREE.MeshBasicMaterial({
        color: 0x151515,
        transparent: true,
        opacity: 0.96
      })
    );
    var foot = new THREE.Mesh(
      new THREE.CylinderGeometry(214, 238, 12, 72),
      new THREE.MeshBasicMaterial({
        color: 0x050505,
        transparent: true,
        opacity: 0.9
      })
    );
    var grid = new THREE.GridHelper(720, 30, 0x595959, 0x242424);

    surface.position.y = 28;
    glass.position.y = 28;
    pivot.add(surface);
    pivot.add(glass);

    ring.position.y = 28;
    ring.rotation.x = Math.PI / 2;
    base.position.y = -190;
    foot.position.y = -218;
    grid.position.y = -226;

    root.add(pivot);
    root.add(ring);
    root.add(base);
    root.add(foot);
    root.add(grid);

    return {
      root: root,
      pivot: pivot,
      surface: surface,
      ring: ring
    };
  }

  function createProjectionMaterial(THREE, placeholderTexture, fragmentShader) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTexture: { value: placeholderTexture },
        uYaw: { value: 0 },
        uPitch: { value: 0 },
        uZoom: { value: 1 },
        uAspect: { value: 1 },
        uTime: { value: 0 }
      },
      vertexShader: [
        "varying vec2 vUv;",
        "void main() {",
        "  vUv = uv;",
        "  gl_Position = vec4(position.xy, 0.0, 1.0);",
        "}"
      ].join("\n"),
      fragmentShader: fragmentShader,
      depthTest: false,
      depthWrite: false
    });
  }

  function getPlanetFragmentShader() {
    return [
      "precision highp float;",
      "uniform sampler2D uTexture;",
      "uniform float uYaw;",
      "uniform float uPitch;",
      "uniform float uZoom;",
      "uniform float uAspect;",
      "varying vec2 vUv;",
      "const float PI = 3.141592653589793;",
      "mat3 rotateY(float a) {",
      "  float s = sin(a);",
      "  float c = cos(a);",
      "  return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c);",
      "}",
      "mat3 rotateX(float a) {",
      "  float s = sin(a);",
      "  float c = cos(a);",
      "  return mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c);",
      "}",
      "void main() {",
      "  vec2 p = vUv * 2.0 - 1.0;",
      "  p.x *= uAspect;",
      "  p *= uZoom;",
      "  float r2 = dot(p, p);",
      "  vec3 dir = normalize(vec3(2.0 * p.x, r2 - 1.0, 2.0 * p.y));",
      "  dir = rotateX(uPitch) * rotateY(uYaw) * dir;",
      "  float sampleU = fract(atan(dir.z, dir.x) / (2.0 * PI) + 0.5);",
      "  float sampleV = clamp(acos(clamp(dir.y, -1.0, 1.0)) / PI, 0.0, 1.0);",
      "  vec3 color = texture2D(uTexture, vec2(sampleU, sampleV)).rgb;",
      "  float vignette = smoothstep(2.2, 0.18, r2);",
      "  color *= 0.96 + 0.04 * vignette;",
      "  gl_FragColor = vec4(color, 1.0);",
      "}"
    ].join("\n");
  }

  function getTunnelFragmentShader() {
    return [
      "precision highp float;",
      "uniform sampler2D uTexture;",
      "uniform float uYaw;",
      "uniform float uPitch;",
      "uniform float uZoom;",
      "uniform float uAspect;",
      "uniform float uTime;",
      "varying vec2 vUv;",
      "const float PI = 3.141592653589793;",
      "mat3 rotateY(float a) {",
      "  float s = sin(a);",
      "  float c = cos(a);",
      "  return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c);",
      "}",
      "mat3 rotateX(float a) {",
      "  float s = sin(a);",
      "  float c = cos(a);",
      "  return mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c);",
      "}",
      "void main() {",
      "  vec2 p = vUv * 2.0 - 1.0;",
      "  p.x *= uAspect;",
      "  p *= uZoom;",
      "  float r2 = dot(p, p);",
      "  vec3 dir = normalize(vec3(2.0 * p.x, 1.0 - r2, 2.0 * p.y));",
      "  dir = rotateX(-uPitch) * rotateY(uYaw) * dir;",
      "  float sampleU = fract(atan(dir.z, dir.x) / (2.0 * PI) + 0.5);",
      "  float sampleV = clamp(acos(clamp(dir.y, -1.0, 1.0)) / PI, 0.0, 1.0);",
      "  vec3 color = texture2D(uTexture, vec2(sampleU, sampleV)).rgb;",
      "  float vignette = smoothstep(2.2, 0.18, r2);",
      "  color *= 0.96 + 0.04 * vignette;",
      "  gl_FragColor = vec4(color, 1.0);",
      "}"
    ].join("\n");
  }

  function isStereographicMode(mode) {
    return mode === "planet" || mode === "tunnel";
  }

  function createPlaceholderTexture(THREE) {
    var canvas = document.createElement("canvas");
    var context = canvas.getContext("2d");

    canvas.width = 2;
    canvas.height = 2;
    context.fillStyle = "#151515";
    context.fillRect(0, 0, 2, 2);

    var texture = new THREE.CanvasTexture(canvas);
    applyTextureSettings(THREE, texture);
    return texture;
  }

  function applyTextureSettings(THREE, texture) {
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    if ("colorSpace" in texture && THREE.SRGBColorSpace) {
      texture.colorSpace = THREE.SRGBColorSpace;
    } else if ("encoding" in texture && THREE.sRGBEncoding) {
      texture.encoding = THREE.sRGBEncoding;
    }
    texture.needsUpdate = true;
  }

  function normalizeMode(value) {
    var key = String(value || "expand").toLowerCase();
    key = MODE_ALIASES[key] || key;

    for (var i = 0; i < MODE_DEFINITIONS.length; i += 1) {
      if (MODE_DEFINITIONS[i].key === key) {
        return key;
      }
    }

    return "expand";
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function mapRange(value, inMin, inMax, outMin, outMax) {
    var ratio = (clamp(value, inMin, inMax) - inMin) / (inMax - inMin);
    return outMin + (outMax - outMin) * ratio;
  }

  function now() {
    return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  }

  global.XinTPanoramaViewer = {
    create: create,
    normalizeMode: normalizeMode,
    modes: MODE_DEFINITIONS.slice()
  };
})(window);
