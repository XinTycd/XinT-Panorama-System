(function frontendPanoramaConsole() {
  var state = {
    apiBase: "",
    items: [],
    currentIndex: -1,
    previewMode: "expand",
    autorotate: true,
    requestId: 0,
    viewerController: null,
    maxTextureSize: 4096
  };

  var refs = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    cacheRefs();
    initApiBase();
    initViewer();
    bindEvents();
    renderGallery();
    updateEmbedExample();
    connectBackend();
  }

  function cacheRefs() {
    refs.apiBaseInput = document.getElementById("apiBaseInput");
    refs.connectBtn = document.getElementById("connectBtn");
    refs.refreshBtn = document.getElementById("refreshBtn");
    refs.clearBtn = document.getElementById("clearBtn");
    refs.databaseTitleInput = document.getElementById("databaseTitleInput");
    refs.databaseImageUrlInput = document.getElementById("databaseImageUrlInput");
    refs.databaseThumbnailInput = document.getElementById("databaseThumbnailInput");
    refs.createDatabaseRecordBtn = document.getElementById("createDatabaseRecordBtn");
    refs.fileInput = document.getElementById("fileInput");
    refs.remoteNameInput = document.getElementById("remoteNameInput");
    refs.remoteUrlInput = document.getElementById("remoteUrlInput");
    refs.registerUrlBtn = document.getElementById("registerUrlBtn");
    refs.galleryList = document.getElementById("galleryList");
    refs.galleryCount = document.getElementById("galleryCount");
    refs.viewer = document.getElementById("viewer");
    refs.modeButtons = Array.prototype.slice.call(document.querySelectorAll(".mode-button"));
    refs.statusBadge = document.getElementById("statusBadge");
    refs.resolutionText = document.getElementById("resolutionText");
    refs.sourceText = document.getElementById("sourceText");
    refs.prevBtn = document.getElementById("prevBtn");
    refs.nextBtn = document.getElementById("nextBtn");
    refs.autorotateBtn = document.getElementById("autorotateBtn");
    refs.resetBtn = document.getElementById("resetBtn");
    refs.fullscreenBtn = document.getElementById("fullscreenBtn");
    refs.metaId = document.getElementById("metaId");
    refs.metaName = document.getElementById("metaName");
    refs.metaPanoramaNo = document.getElementById("metaPanoramaNo");
    refs.metaSource = document.getElementById("metaSource");
    refs.metaSize = document.getElementById("metaSize");
    refs.metaCreatedAt = document.getElementById("metaCreatedAt");
    refs.metaDescription = document.getElementById("metaDescription");
    refs.editPanoramaNoInput = document.getElementById("editPanoramaNoInput");
    refs.editNameInput = document.getElementById("editNameInput");
    refs.editDescriptionInput = document.getElementById("editDescriptionInput");
    refs.saveMetaBtn = document.getElementById("saveMetaBtn");
    refs.currentIndexText = document.getElementById("currentIndexText");
    refs.embedExample = document.getElementById("embedExample");
  }

  function initApiBase() {
    var queryApi = new URLSearchParams(location.search).get("api");
    state.apiBase = (queryApi || localStorage.getItem("xint-panorama-system-api") || "http://127.0.0.1:7210").replace(/\/$/, "");
    refs.apiBaseInput.value = state.apiBase;
  }

  function initViewer() {
    state.previewMode = XinTPanoramaViewer.normalizeMode(
      new URLSearchParams(location.search).get("mode") ||
        localStorage.getItem("xint-panorama-system-preview-mode") ||
        "expand"
    );
    state.viewerController = XinTPanoramaViewer.create({
      element: refs.viewer,
      THREE: THREE,
      initialMode: state.previewMode,
      autorotate: state.autorotate
    });
    state.maxTextureSize = state.viewerController.getMaxTextureSize();
    updateModeButtons();
  }

  function bindEvents() {
    refs.connectBtn.addEventListener("click", connectBackend);
    refs.refreshBtn.addEventListener("click", loadGallery);
    refs.clearBtn.addEventListener("click", clearGallery);
    refs.createDatabaseRecordBtn.addEventListener("click", createDatabaseRecord);
    refs.fileInput.addEventListener("change", uploadFiles);
    refs.registerUrlBtn.addEventListener("click", registerRemoteUrl);
    refs.saveMetaBtn.addEventListener("click", saveCurrentMeta);
    refs.prevBtn.addEventListener("click", function onPrev() {
      moveSelection(-1);
    });
    refs.nextBtn.addEventListener("click", function onNext() {
      moveSelection(1);
    });
    refs.autorotateBtn.addEventListener("click", toggleAutorotate);
    refs.resetBtn.addEventListener("click", resetView);
    refs.fullscreenBtn.addEventListener("click", toggleFullscreen);
    refs.modeButtons.forEach(function bindModeButton(button) {
      button.addEventListener("click", function onModeClick() {
        setPreviewMode(button.getAttribute("data-mode"));
      });
    });

    document.addEventListener("keydown", function onKeydown(event) {
      if (event.target && /INPUT|TEXTAREA/.test(event.target.tagName)) {
        return;
      }

      if (event.key === "ArrowLeft") {
        moveSelection(-1);
      } else if (event.key === "ArrowRight") {
        moveSelection(1);
      } else if (event.key.toLowerCase() === "r") {
        resetView();
      } else if (event.key.toLowerCase() === "f") {
        toggleFullscreen();
      } else if (event.key === "1") {
        setPreviewMode("expand");
      } else if (event.key === "2") {
        setPreviewMode("planet");
      } else if (event.key === "3") {
        setPreviewMode("tunnel");
      } else if (event.key === "4") {
        setPreviewMode("crystal");
      } else if (event.key === " " || event.code === "Space") {
        event.preventDefault();
        toggleAutorotate();
      }
    });
  }

  function connectBackend() {
    state.apiBase = refs.apiBaseInput.value.trim().replace(/\/$/, "");
    localStorage.setItem("xint-panorama-system-api", state.apiBase);
    updateEmbedExample();
    loadGallery();
  }

  async function loadGallery() {
    setStatus("连接中...");
    try {
      var response = await fetchJson("/api/gallery");
      state.items = response.items || [];
      renderGallery();

      if (!state.items.length) {
        setStatus("图库为空");
        resetViewerSurface();
        updateMeta(null);
        return;
      }

      if (state.currentIndex < 0 || state.currentIndex >= state.items.length) {
        state.currentIndex = 0;
      }

      selectScene(state.currentIndex);
    } catch (error) {
      setStatus("连接失败");
      refs.galleryList.innerHTML = '<div class="gallery-item">后端未响应，请检查 API 地址与服务状态。</div>';
      updateMeta(null);
    }
  }

  async function clearGallery() {
    await fetchJson("/api/gallery/clear", {
      method: "POST"
    });
    state.items = [];
    state.currentIndex = -1;
    resetViewerSurface();
    renderGallery();
    updateMeta(null);
    setStatus("图库已清空");
  }

  async function registerRemoteUrl() {
    var url = refs.remoteUrlInput.value.trim();
    if (!/^https?:\/\//i.test(url)) {
      setStatus("请输入有效 URL");
      return;
    }

    await fetchJson("/api/panoramas/register", {
      method: "POST",
      body: JSON.stringify({
        name: refs.remoteNameInput.value.trim() || "远程全景图",
        url: url
      })
    });

    refs.remoteNameInput.value = "";
    refs.remoteUrlInput.value = "";
    loadGallery();
  }

  async function createDatabaseRecord() {
    var imageUrl = refs.databaseImageUrlInput.value.trim();
    if (!imageUrl) {
      setStatus("请输入图片地址");
      return;
    }

    setStatus("保存中...");

    try {
      await fetchJson("/api/panoramas/create", {
        method: "POST",
        body: JSON.stringify({
          title: refs.databaseTitleInput.value.trim() || "数据库全景图",
          imageUrl: imageUrl,
          thumbnailUrl: refs.databaseThumbnailInput.value.trim() || imageUrl
        })
      });

      refs.databaseTitleInput.value = "";
      refs.databaseImageUrlInput.value = "";
      refs.databaseThumbnailInput.value = "";
      loadGallery();
    } catch (error) {
      setStatus("保存失败");
    }
  }

  async function saveCurrentMeta() {
    var currentItem = state.currentIndex >= 0 ? state.items[state.currentIndex] : null;
    if (!currentItem) {
      setStatus("请先选择一张全景图");
      return;
    }

    var panoramaNoValue = refs.editPanoramaNoInput.value.trim();
    var panoramaNo = Number(panoramaNoValue);
    if (!panoramaNoValue || !Number.isFinite(panoramaNo) || panoramaNo <= 0) {
      setStatus("编号必须是正整数");
      return;
    }

    setStatus("保存中...");

    try {
      var payload = await fetchJson("/api/panoramas/update", {
        method: "POST",
        body: JSON.stringify({
          id: currentItem.id,
          panoramaNo: panoramaNo,
          name: refs.editNameInput.value.trim(),
          description: refs.editDescriptionInput.value.trim()
        })
      });

      state.items = payload.items || state.items;
      state.currentIndex = state.items.findIndex(function findUpdatedItem(item) {
        return item.id === currentItem.id;
      });
      renderGallery();
      if (state.currentIndex >= 0) {
        updateMeta(state.items[state.currentIndex]);
        updateEmbedExample();
      }
      setStatus("保存成功");
    } catch (error) {
      setStatus("保存失败");
    }
  }

  async function uploadFiles(event) {
    var files = Array.prototype.slice.call(event.target.files || []);
    if (!files.length) {
      return;
    }

    setStatus("上传中...");

    for (var i = 0; i < files.length; i += 1) {
      var file = files[i];
      var dataUrl = await fileToDataUrl(file);
      await fetchJson("/api/panoramas/upload-base64", {
        method: "POST",
        body: JSON.stringify({
          name: file.name.replace(/\.[^.]+$/, ""),
          dataUrl: dataUrl
        })
      });
    }

    event.target.value = "";
    loadGallery();
  }

  function fileToDataUrl(file) {
    return new Promise(function resolveFile(resolve, reject) {
      var reader = new FileReader();
      reader.onload = function onLoad() {
        resolve(reader.result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function selectScene(index) {
    if (index < 0 || index >= state.items.length) {
      return;
    }

    var item = state.items[index];
    var requestId = ++state.requestId;
    state.currentIndex = index;
    renderGallery();
    updateMeta(item);
    updateEmbedExample();
    setStatus("加载中...");
    refs.sourceText.textContent = "来源: " + (item.sourceType || "-");

    try {
      var loaded = await loadTexture(item);
      if (requestId !== state.requestId) {
        loaded.texture.dispose();
        return;
      }

      state.viewerController.setTexture(loaded.texture);
      refs.resolutionText.textContent =
        "分辨率: " +
        loaded.originalWidth +
        " × " +
        loaded.originalHeight +
        (loaded.scaledWidth !== loaded.originalWidth || loaded.scaledHeight !== loaded.originalHeight
          ? "，纹理已压缩到 " + loaded.scaledWidth + " × " + loaded.scaledHeight
          : "");
      setStatus("已就绪");
    } catch (error) {
      resetViewerSurface();
      setStatus("加载失败");
    }
  }

  function loadTexture(item) {
    return loadImageSource(item.viewerUrl).then(function buildTexture(source) {
      var originalWidth = source.naturalWidth || source.width;
      var originalHeight = source.naturalHeight || source.height;
      var maxEdge = Math.max(1024, state.maxTextureSize || 4096);
      var scale = Math.min(1, maxEdge / Math.max(originalWidth, originalHeight));
      var scaledWidth = Math.max(1, Math.round(originalWidth * scale));
      var scaledHeight = Math.max(1, Math.round(originalHeight * scale));
      var canvas = document.createElement("canvas");
      var context = canvas.getContext("2d", { alpha: false, desynchronized: true });
      var texture;

      item.width = originalWidth;
      item.height = originalHeight;

      canvas.width = scaledWidth;
      canvas.height = scaledHeight;
      context.drawImage(source, 0, 0, scaledWidth, scaledHeight);
      texture = new THREE.CanvasTexture(canvas);

      if (typeof source.close === "function") {
        source.close();
      }

      applyTextureSettings(texture);

      return {
        texture: texture,
        originalWidth: originalWidth,
        originalHeight: originalHeight,
        scaledWidth: scaledWidth,
        scaledHeight: scaledHeight
      };
    });
  }

  function loadImageSource(url) {
    if (typeof createImageBitmap === "function") {
      return fetch(url, { mode: "cors", cache: "no-cache" })
        .then(function onFetch(response) {
          if (!response.ok) {
            throw new Error("图片请求失败");
          }
          return response.blob();
        })
        .then(function onBlob(blob) {
          return createImageBitmap(blob);
        })
        .catch(function fallbackToImage() {
          return loadImageElement(url);
        });
    }

    return loadImageElement(url);
  }

  function loadImageElement(url) {
    return new Promise(function resolveImage(resolve, reject) {
      var image = new Image();
      image.crossOrigin = "anonymous";
      image.decoding = "async";
      image.onload = function onLoad() {
        resolve(image);
      };
      image.onerror = function onError() {
        reject(new Error("图片加载失败"));
      };
      image.src = url;
    });
  }

  function applyTextureSettings(texture) {
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

  function resetViewerSurface() {
    state.viewerController.clear();
    refs.resolutionText.textContent = "分辨率: -";
    refs.sourceText.textContent = "来源: -";
  }

  function renderGallery() {
    refs.galleryCount.textContent = String(state.items.length);
    refs.currentIndexText.textContent =
      state.items.length && state.currentIndex >= 0
        ? String(state.currentIndex + 1) + " / " + String(state.items.length)
        : "0 / 0";

    refs.galleryList.innerHTML = "";
    if (!state.items.length) {
      refs.galleryList.innerHTML = '<div class="gallery-item"><strong>暂无数据</strong><span>请上传图片或注册远程地址。</span></div>';
      return;
    }

    state.items.forEach(function eachItem(item, index) {
      var element = document.createElement("button");
      element.type = "button";
      element.className = "gallery-item" + (state.currentIndex === index ? " active" : "");
      element.innerHTML =
        "<strong>#" +
        escapeHtml(item.panoramaNo) +
        " " +
        escapeHtml(item.name) +
        "</strong><span>" +
        escapeHtml(item.sourceType || "-") +
        "</span>";
      element.addEventListener("click", function onClick() {
        selectScene(index);
      });
      refs.galleryList.appendChild(element);
    });
  }

  function updateMeta(item) {
    refs.metaId.textContent = item ? item.id : "-";
    refs.metaPanoramaNo.textContent = item && item.panoramaNo ? String(item.panoramaNo) : "-";
    refs.metaName.textContent = item ? item.name : "-";
    refs.metaSource.textContent = item ? item.sourceType || "-" : "-";
    refs.metaSize.textContent = item && item.size ? formatBytes(item.size) : "-";
    refs.metaCreatedAt.textContent = item && item.createdAt ? item.createdAt : "-";
    refs.metaDescription.textContent = item && item.description ? item.description : "-";
    refs.editPanoramaNoInput.value = item && item.panoramaNo ? String(item.panoramaNo) : "";
    refs.editNameInput.value = item ? item.name || "" : "";
    refs.editDescriptionInput.value = item ? item.description || "" : "";
  }

  function updateEmbedExample() {
    var currentItem = state.currentIndex >= 0 ? state.items[state.currentIndex] : null;
    refs.embedExample.textContent =
      "按编号嵌入：\n" +
      '<div id="panorama-widget"></div>\n' +
      '<script src="' +
      state.apiBase +
      '/embed.js" data-target="panorama-widget" data-api="' +
      state.apiBase +
      '"' +
      (currentItem && currentItem.panoramaNo ? ' data-panorama-no="' + currentItem.panoramaNo + '"' : "") +
      ' data-mode="' +
      state.previewMode +
      '"' +
      '><' +
      "/script>\n\n" +
      "按外部 URL 直接嵌入：\n" +
      '<div id="panorama-widget-url"></div>\n' +
      '<script src="' +
      state.apiBase +
      '/embed.js" data-target="panorama-widget-url" data-api="' +
      state.apiBase +
      '" data-image-url="https://example.com/panorama.jpg" data-image-name="外部全景图" data-mode="' +
      state.previewMode +
      '"><' +
      "/script>";
  }

  function moveSelection(delta) {
    if (!state.items.length) {
      return;
    }

    var nextIndex = (state.currentIndex + delta + state.items.length) % state.items.length;
    selectScene(nextIndex);
  }

  function setPreviewMode(mode) {
    state.previewMode = state.viewerController.setMode(mode);
    localStorage.setItem("xint-panorama-system-preview-mode", state.previewMode);
    updateModeButtons();
    updateEmbedExample();
  }

  function updateModeButtons() {
    refs.modeButtons.forEach(function updateButton(button) {
      var isActive = button.getAttribute("data-mode") === state.previewMode;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  function toggleAutorotate() {
    state.autorotate = state.viewerController.toggleAutorotate();
    refs.autorotateBtn.textContent = state.autorotate ? "关闭自动旋转" : "开启自动旋转";
  }

  function resetView() {
    state.viewerController.resetView();
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }

  async function fetchJson(pathname, options) {
    var response = await fetch(state.apiBase + pathname, Object.assign({
      headers: {
        "Content-Type": "application/json"
      }
    }, options || {}));

    if (!response.ok) {
      throw new Error("Request failed");
    }

    return response.json();
  }

  function setStatus(text) {
    refs.statusBadge.textContent = text;
  }

  function formatBytes(bytes) {
    var units = ["B", "KB", "MB", "GB"];
    var value = bytes;
    var index = 0;
    while (value >= 1024 && index < units.length - 1) {
      value /= 1024;
      index += 1;
    }
    return value.toFixed(index === 0 ? 0 : 2) + " " + units[index];
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
})();
