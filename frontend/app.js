(function frontendPanoramaConsole() {
  var state = {
    apiBase: "",
    items: [],
    currentIndex: -1,
    autorotate: true,
    requestId: 0,
    connectionId: 0,
    galleryRequestId: 0,
    uploadRequestId: 0,
    projectRequestId: 0,
    projectListRequestId: 0,
    projectActionId: 0,
    engineSwitchId: 0,
    pendingViewerEngine: null,
    consoleSettings: null,
    settingsReady: false,
    settingsLoading: false,
    apiQueryOverride: null,
    pendingPluginId: null,
    pendingEmbedPreset: false,
    viewerController: null,
    viewerReady: false,
    viewerConfigReady: false,
    viewerEngine: "psv",
    viewerEngineForced: false,
    maxTextureSize: 4096,
    projects: [],
    currentProjectId: null,
    currentProject: null,
    currentSceneId: null,
    activeDrawerPanel: null,
    pendingUploads: [],
    directorMode: false,
    viewerStateAction: null,
    embedPreset: "all",
    activeHotspotId: null,
    hotspotNavigationTimer: 0,
    hotspotNavigationId: 0,
    availableModes: null,
    mediaStorageSettings: null,
    galleryGroups: [],
    galleryGroup: null,
    gallerySearch: "",
    galleryPage: 1,
    galleryPageSize: 8,
    appInfo: {
      name: "XinT 全景系统",
      version: null,
      repositoryUrl: "https://github.com/XinTycd/XinT-Panorama-System"
    }
  };

  var refs = {};
  var embedCopyResetTimers = new WeakMap();
  var embedCopyInFlight = new WeakSet();
  var settingsPatchQueue = Promise.resolve();
  var projectSceneActions = null;
  var projectPlugins = null;
  var ensureViewerEngineAssets = createEngineAssetLoader(loadViewerAsset);

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    cacheRefs();
    bindEvents();
    projectSceneActions = window.XinTProjectSceneActions.create({
      state: state,
      request: fetchJson,
      confirm: function confirmDelete(message) { return window.confirm(message); },
      setSceneStatus: function setSceneStatus(message) { refs.sceneActionStatus.textContent = window.XinTI18n.translateMessage(message); },
      setStatus: setStatus,
      setProjectDeleteButtonsDisabled: function disableDeleteButtons(disabled) {
        refs.projectSceneList.querySelectorAll("[data-scene-delete]").forEach(function updateButton(button) { button.disabled = disabled; });
      },
      renderProjects: renderProjects,
      renderProjectScenes: renderProjectScenes,
      renderSpatialHotspots: renderSpatialHotspots
    });
    refs.consoleSettingsOverlay.hidden = false;
    refs.appShell.inert = true;
    refs.consoleSettingsError.textContent = window.XinTI18n.t("settings.bootstrapLoading");
    await initializeConsoleSettings();
    window.addEventListener("pagehide", function disposeViewer(event) {
      if (event.persisted) return;
      cancelHotspotNavigation();
      state.viewerReady = false;
      if (state.viewerController) state.viewerController.dispose();
      state.viewerController = null;
    });
  }

  async function initializeConsoleSettings() {
    if (state.settingsLoading) return false;
    state.settingsLoading = true;
    refs.consoleSettingsRetry.disabled = true;
    refs.consoleSettingsError.textContent = window.XinTI18n.t("settings.bootstrapLoading");
    try {
      var settings = await fetchConsoleSettingsRequest({ method: "GET", cache: "no-store", credentials: "same-origin" });
      state.consoleSettings = settings;
      projectPlugins = window.XinTConsolePlugins.create(settings.plugins, {
        "project-workspace": {
          onEnable: function enableProjects() { loadProjects(); },
          onDisable: disableProjectWorkspace,
          onChange: renderProjectPluginState
        }
      }, function persistPluginEnabled(id, enabled) {
        return patchConsoleSettings({ plugins: { [id]: enabled } });
      });
      initApiBase(settings);
      initEmbedControls(settings);
      window.XinTToolbarSettings.configure({
        toolbarHidden: settings.toolbarHidden,
        save: async function persistToolbarSettings(toolbarHidden) {
          var updated = await patchConsoleSettings({ toolbarHidden: toolbarHidden });
          return updated.toolbarHidden;
        }
      });
      state.settingsReady = true;
      refs.appShell.inert = false;
      refs.consoleSettingsOverlay.hidden = true;
      renderProjectPluginState();
      renderAppInfo();
      updateAutorotateButton();
      updateDirectorButton();
      updateFullscreenButton();
      renderGallery();
      updateEmbedExample();
      if (!state.apiQueryOverride || window.XinTI18n.isSecureServiceUrl(state.apiBase)) await connectBackend({ persist: false });
      else {
        refs.settingsStatus.textContent = window.XinTI18n.t("error.secureServiceUrl");
        refs.apiBaseInput.focus();
      }
      return true;
    } catch (_) {
      state.settingsReady = false;
      refs.appShell.inert = true;
      refs.consoleSettingsOverlay.hidden = false;
      refs.consoleSettingsError.textContent = window.XinTI18n.t("settings.bootstrapError");
      refs.consoleSettingsRetry.hidden = false;
      return false;
    } finally {
      state.settingsLoading = false;
      refs.consoleSettingsRetry.disabled = false;
    }
  }

  function patchConsoleSettings(patch) {
    var operation = settingsPatchQueue.then(async function savePatch() {
      var settings = await fetchConsoleSettingsRequest({
        method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch)
      });
      state.consoleSettings = settings;
      return settings;
    });
    settingsPatchQueue = operation.catch(function keepQueueAlive() {});
    return operation;
  }

  async function fetchConsoleSettingsRequest(options) {
    var controller = new AbortController();
    var timer = setTimeout(function abortSettingsRequest() { controller.abort(); }, 10000);
    try {
      var response = await fetch("./api/console-settings", Object.assign({}, options, { signal: controller.signal }));
      if (!response.ok) throw new Error("HTTP " + response.status);
      return await response.json();
    }
    finally { clearTimeout(timer); }
  }

  function createIconActionButton(kind, label, danger, translationKey, userName) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "icon-action-button" + (danger ? " is-danger" : "");
    var accessibleLabel = translationKey ? window.XinTI18n.t(translationKey, { name: userName }) : label;
    button.title = accessibleLabel;
    button.setAttribute("aria-label", accessibleLabel);
    button.innerHTML = '<svg class="xint-icon" aria-hidden="true" focusable="false" viewBox="0 0 256 256"><use href="./icons/sprite.svg#' + (kind === "edit" ? "edit" : "delete") + '"></use></svg>';
    return button;
  }

  function cacheRefs() {
    refs.appShell = document.querySelector(".app-shell");
    refs.apiBaseInput = document.getElementById("apiBaseInput");
    refs.connectBtn = document.getElementById("connectBtn");
    refs.refreshBtn = document.getElementById("refreshBtn");
    refs.clearBtn = document.getElementById("clearBtn");
    refs.databaseTitleInput = document.getElementById("databaseTitleInput");
    refs.databaseImageUrlInput = document.getElementById("databaseImageUrlInput");
    refs.databaseThumbnailInput = document.getElementById("databaseThumbnailInput");
    refs.createDatabaseRecordBtn = document.getElementById("createDatabaseRecordBtn");
    refs.addSourceSelect = document.getElementById("addSourceSelect");
    refs.sourceAvailability = document.getElementById("sourceAvailability");
    refs.uploadSourceForm = document.getElementById("uploadSourceForm");
    refs.remoteSourceForm = document.getElementById("remoteSourceForm");
    refs.databaseSourceForm = document.getElementById("databaseSourceForm");
    refs.uploadProgress = document.getElementById("uploadProgress");
    refs.fileInput = document.getElementById("fileInput");
    refs.uploadInitPanel = document.getElementById("uploadInitPanel");
    refs.uploadInitCount = document.getElementById("uploadInitCount");
    refs.uploadInitList = document.getElementById("uploadInitList");
    refs.uploadCancelBtn = document.getElementById("uploadCancelBtn");
    refs.uploadSubmitBtn = document.getElementById("uploadSubmitBtn");
    refs.remoteNameInput = document.getElementById("remoteNameInput");
    refs.remoteUrlInput = document.getElementById("remoteUrlInput");
    refs.registerUrlBtn = document.getElementById("registerUrlBtn");
    refs.remoteFormStatus = document.getElementById("remoteFormStatus");
    refs.databaseFormStatus = document.getElementById("databaseFormStatus");
    refs.galleryList = document.getElementById("galleryList");
    refs.galleryCount = document.getElementById("galleryCount");
    refs.galleryGroupFilter = document.getElementById("galleryGroupFilter");
    refs.gallerySearchInput = document.getElementById("gallerySearchInput");
    refs.galleryPrevPage = document.getElementById("galleryPrevPage");
    refs.galleryNextPage = document.getElementById("galleryNextPage");
    refs.galleryPageStatus = document.getElementById("galleryPageStatus");
    refs.galleryActionStatus = document.getElementById("galleryActionStatus");
    refs.manageGalleryGroupsBtn = document.getElementById("manageGalleryGroupsBtn");
    refs.uploadGroupInput = document.getElementById("uploadGroupInput");
    refs.applyUploadGroupBtn = document.getElementById("applyUploadGroupBtn");
    refs.remoteGroupInput = document.getElementById("remoteGroupInput");
    refs.databaseGroupInput = document.getElementById("databaseGroupInput");
    refs.editGroupInput = document.getElementById("editGroupInput");
    refs.editActionStatus = document.getElementById("editActionStatus");
    refs.metaGroup = document.getElementById("metaGroup");
    refs.viewerPanel = document.querySelector(".viewer-panel");
    refs.viewer = document.getElementById("viewer");
    refs.viewerState = document.getElementById("viewerState");
    refs.viewerStateTitle = document.getElementById("viewerStateTitle");
    refs.viewerStateDetail = document.getElementById("viewerStateDetail");
    refs.viewerStateAction = document.getElementById("viewerStateAction");
    refs.statusBadge = document.getElementById("statusBadge");
    refs.resolutionText = document.getElementById("resolutionText");
    refs.hotspotLayer = document.getElementById("hotspotLayer");
    refs.sourceText = document.getElementById("sourceText");
    refs.prevBtn = document.getElementById("prevBtn");
    refs.nextBtn = document.getElementById("nextBtn");
    refs.autorotateBtn = document.getElementById("autorotateBtn");
    refs.resetBtn = document.getElementById("resetBtn");
    refs.zoomOutBtn = document.getElementById("zoomOutBtn");
    refs.zoomInBtn = document.getElementById("zoomInBtn");
    refs.directorBtn = document.getElementById("directorBtn");
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
    refs.embedIframeCode = document.getElementById("embedIframeCode");
    refs.embedScriptCode = document.getElementById("embedScriptCode");
    refs.embedCodeBlocks = Array.prototype.slice.call(document.querySelectorAll("[data-embed-code]"));
    refs.embedCopyButtons = Array.prototype.slice.call(document.querySelectorAll("[data-copy-embed]"));
    refs.embedCodeFeedback = {
      iframe: document.querySelector('[data-embed-feedback="iframe"]'),
      script: document.querySelector('[data-embed-feedback="script"]')
    };
    refs.embedPresetButtons = Array.prototype.slice.call(document.querySelectorAll("[data-embed-preset]"));
    refs.systemContextMenu = document.getElementById("systemContextMenu");
    refs.systemNameText = document.getElementById("systemNameText");
    refs.systemVersionText = document.getElementById("systemVersionText");
    refs.githubRepoLink = document.getElementById("githubRepoLink");
    refs.projectCount = document.getElementById("projectCount");
    refs.projectNameInput = document.getElementById("projectNameInput");
    refs.createProjectBtn = document.getElementById("createProjectBtn");
    refs.projectList = document.getElementById("projectList");
    refs.projectActionStatus = document.getElementById("projectActionStatus");
    refs.sceneNameInput = document.getElementById("sceneNameInput");
    refs.addCurrentSceneBtn = document.getElementById("addCurrentSceneBtn");
    refs.projectSceneList = document.getElementById("projectSceneList");
    refs.sceneActionStatus = document.getElementById("sceneActionStatus");
    refs.renameDialog = document.getElementById("renameDialog");
    refs.renameForm = document.getElementById("renameForm");
    refs.renameInput = document.getElementById("renameInput");
    refs.renameLabel = document.getElementById("renameLabel");
    refs.renameStatus = document.getElementById("renameStatus");
    refs.renameSubmit = document.getElementById("renameSubmit");
    refs.currentSceneTitle = document.getElementById("currentSceneTitle");
    refs.workspaceDrawer = document.getElementById("workspaceDrawer");
    refs.drawerBackdrop = document.getElementById("drawerBackdrop");
    refs.drawerCloseBtn = document.getElementById("drawerCloseBtn");
    refs.drawerTitle = document.getElementById("drawerTitle");
    refs.drawerEyebrow = document.getElementById("drawerEyebrow");
    refs.settingsStatus = document.getElementById("settingsStatus");
    refs.viewerEngineSelect = document.getElementById("viewerEngineSelect");
    refs.viewerEngineStatus = document.getElementById("viewerEngineStatus");
    refs.mediaStorageMode = document.getElementById("mediaStorageMode");
    refs.mediaStorageHelp = document.getElementById("mediaStorageHelp");
    refs.cloudSettingsPanel = document.getElementById("cloudSettingsPanel");
    refs.cloudDatabaseUrlInput = document.getElementById("cloudDatabaseUrlInput");
    refs.cloudTokenInput = document.getElementById("cloudTokenInput");
    refs.mediaFormatSelect = document.getElementById("mediaFormatSelect");
    refs.mediaFormatOriginalOption = refs.mediaFormatSelect.querySelector('option[value="original"]');
    refs.transcodeSettings = document.getElementById("transcodeSettings");
    refs.mediaCodecSelect = document.getElementById("mediaCodecSelect");
    refs.mediaQualityField = document.getElementById("mediaQualityField");
    refs.mediaQualityInput = document.getElementById("mediaQualityInput");
    refs.mediaQualityValue = document.getElementById("mediaQualityValue");
    refs.mediaStorageModeHelp = document.getElementById("mediaStorageModeHelp");
    refs.saveMediaStorageBtn = document.getElementById("saveMediaStorageBtn");
    refs.mediaStorageStatus = document.getElementById("mediaStorageStatus");
    refs.drawerPanels = Array.prototype.slice.call(document.querySelectorAll(".drawer-panel"));
    refs.drawerTriggers = Array.prototype.slice.call(document.querySelectorAll("[data-drawer-panel]"));
    refs.pluginList = document.getElementById("pluginList");
    refs.pluginSettingsStatus = document.getElementById("pluginSettingsStatus");
    refs.embedPresetStatus = document.getElementById("embedPresetStatus");
    refs.consoleSettingsOverlay = document.getElementById("consoleSettingsOverlay");
    refs.consoleSettingsError = document.getElementById("consoleSettingsError");
    refs.consoleSettingsRetry = document.getElementById("consoleSettingsRetry");
    refs.projectNavButtons = Array.prototype.slice.call(document.querySelectorAll("[data-project-entry]"));
  }

  function initApiBase(settings) {
    var params = new URLSearchParams(location.search);
    var queryApi = params.has("api") ? params.get("api") : null;
    state.apiQueryOverride = queryApi === null ? null : queryApi.trim().replace(/\/$/, "");
    state.apiBase = (state.apiQueryOverride === null ? settings.apiBase : state.apiQueryOverride).replace(/\/$/, "");
    refs.apiBaseInput.value = state.apiBase;
  }

  function initEmbedControls(settings) {
    state.embedPreset = settings.embedPreset;
    updateEmbedPresetButtons();
  }

  function createEngineAssetLoader(loadAsset) {
    var inFlight = Object.create(null);
    return function ensureAssets(engine) {
      if (inFlight[engine]) return inFlight[engine];
      var promise;
      if (engine === "legacy") {
        promise = loadAsset("script", "./vendor/three.min.js").then(function loadLegacyViewer() {
          return loadAsset("script", "./viewer/legacy-viewer.js");
        });
      } else {
        promise = Promise.all([
          loadAsset("link", "./vendor/psv.css"),
          loadAsset("script", "./vendor/psv.bundle.js")
        ]);
      }
      inFlight[engine] = Promise.resolve(promise).catch(function clearFailedAttempt(error) {
        delete inFlight[engine];
        throw error;
      });
      return inFlight[engine];
    };
  }

  function loadViewerAsset(tag, path) {
    return new Promise(function appendViewerAsset(resolve, reject) {
      var asset = document.createElement(tag);
      asset.onload = resolve;
      asset.onerror = function viewerAssetFailed() {
        if (asset.parentNode) asset.parentNode.removeChild(asset);
        reject(new Error("无法加载查看器资源：" + path));
      };
      if (tag === "script") asset.src = path;
      else {
        asset.rel = "stylesheet";
        asset.href = path;
      }
      document.head.appendChild(asset);
    });
  }

  function initViewer(engine, initialView) {
    state.autorotate = false;
    state.viewerEngine = engine || state.viewerEngine;
    refs.viewerPanel.classList.toggle("is-legacy", state.viewerEngine === "legacy");
    try {
      state.viewerController = XinTPanoramaViewer.create({
        element: refs.viewer,
        engine: state.viewerEngine,
        autorotate: state.autorotate,
        initialYaw: initialView && initialView.yaw,
        initialPitch: initialView && initialView.pitch,
        initialFov: initialView && initialView.fov,
        onViewChange: updateViewerTelemetry,
        onContextState: handleViewerContextState
      });
      state.viewerReady = false;
      state.maxTextureSize = state.viewerController.getMaxTextureSize();
      updateAutorotateButton();
      return true;
    } catch (error) {
      state.viewerController = null;
      setViewerState("error", "预览引擎启动失败", error.message + "；可在设置中切换引擎。", "");
      return false;
    }
  }

  function bindEvents() {
    refs.connectBtn.addEventListener("click", connectBackend);
    refs.consoleSettingsRetry.addEventListener("click", initializeConsoleSettings);
    refs.pluginList.addEventListener("click", async function toggleConsolePlugin(event) {
      var button = event.target.closest("[data-plugin-toggle]");
      if (!button || !projectPlugins || state.pendingPluginId) return;
      var pluginId = button.getAttribute("data-plugin-toggle");
      if (pluginId !== "project-workspace") return;
      var nextEnabled = !projectPlugins.isEnabled(pluginId);
      state.pendingPluginId = pluginId;
      refs.pluginSettingsStatus.textContent = "";
      renderProjectPluginState();
      try {
        await projectPlugins.setEnabled(pluginId, nextEnabled);
        refs.pluginSettingsStatus.textContent = "";
      } catch (_) {
        refs.pluginSettingsStatus.textContent = window.XinTI18n.t("settings.pluginSaveFailed");
      } finally {
        state.pendingPluginId = null;
        renderProjectPluginState();
        var updatedToggle = refs.pluginList.querySelector('[data-plugin-toggle="' + pluginId + '"]');
        if (updatedToggle) updatedToggle.focus();
      }
    });
    if (window.XinTGalleryGroups) {
      window.XinTGalleryGroups.bind(refs.manageGalleryGroupsBtn, fetchJson, loadGallery, function currentConnectionId() { return state.connectionId; });
    }
    refs.mediaStorageMode.addEventListener("change", updateMediaStorageForm);
    refs.mediaFormatSelect.addEventListener("change", updateMediaStorageForm);
    refs.mediaCodecSelect.addEventListener("change", updateMediaStorageForm);
    refs.mediaQualityInput.addEventListener("input", function updateQualityValue() {
      refs.mediaQualityValue.value = refs.mediaQualityInput.value;
      refs.mediaQualityValue.textContent = refs.mediaQualityInput.value;
    });
    refs.saveMediaStorageBtn.addEventListener("click", saveMediaStorageSettings);
    refs.viewerEngineSelect.addEventListener("change", saveViewerEngine);
    refs.refreshBtn.addEventListener("click", loadGallery);
    refs.clearBtn.addEventListener("click", clearGallery);
    refs.galleryGroupFilter.addEventListener("change", function onGalleryGroupChange() {
      var value = refs.galleryGroupFilter.value;
      state.galleryGroup = value === "" ? null : value === "ungrouped" ? "" : value.slice(6);
      state.galleryPage = 1;
      renderGallery();
    });
    refs.gallerySearchInput.addEventListener("input", function onGallerySearch() {
      state.gallerySearch = refs.gallerySearchInput.value.trim().toLocaleLowerCase();
      state.galleryPage = 1;
      renderGallery();
    });
    refs.galleryPrevPage.addEventListener("click", function previousGalleryPage() {
      state.galleryPage = Math.max(1, state.galleryPage - 1);
      renderGallery();
    });
    refs.galleryNextPage.addEventListener("click", function nextGalleryPage() {
      state.galleryPage += 1;
      renderGallery();
    });
    refs.createDatabaseRecordBtn.addEventListener("click", createDatabaseRecord);
    refs.fileInput.addEventListener("change", prepareUploadFiles);
    refs.uploadCancelBtn.addEventListener("click", clearPendingUploads);
    refs.uploadSubmitBtn.addEventListener("click", uploadPreparedFiles);
    refs.applyUploadGroupBtn.addEventListener("click", applyUploadGroupToAll);
    refs.registerUrlBtn.addEventListener("click", registerRemoteUrl);
    refs.addSourceSelect.addEventListener("change", updateSourceForms);
    refs.saveMetaBtn.addEventListener("click", saveCurrentMeta);
    refs.createProjectBtn.addEventListener("click", createProject);
    refs.renameForm.addEventListener("submit", submitRename);
    refs.renameDialog.querySelector("[data-rename-close]").addEventListener("click", function closeRenameDialog() { refs.renameDialog.close(); });
    refs.addCurrentSceneBtn.addEventListener("click", addCurrentPanoramaAsScene);
    refs.prevBtn.addEventListener("click", function onPrev() {
      moveSelection(-1);
    });
    refs.nextBtn.addEventListener("click", function onNext() {
      moveSelection(1);
    });
    refs.autorotateBtn.addEventListener("click", toggleAutorotate);
    refs.resetBtn.addEventListener("click", resetView);
    refs.zoomOutBtn.addEventListener("click", function onZoomOut() {
      if (!state.viewerReady || !state.viewerController) return;
      state.viewerController.zoomBy(8);
    });
    refs.zoomInBtn.addEventListener("click", function onZoomIn() {
      if (!state.viewerReady || !state.viewerController) return;
      state.viewerController.zoomBy(-8);
    });
    refs.directorBtn.addEventListener("click", toggleDirectorMode);
    refs.viewerStateAction.addEventListener("click", handleViewerStateAction);
    refs.embedPresetButtons.forEach(function bindEmbedPreset(button) {
      button.addEventListener("click", function applyEmbedPresetFromButton() {
        applyEmbedPreset(button.getAttribute("data-embed-preset"));
      });
    });
    refs.embedCopyButtons.forEach(function bindEmbedCopy(button) {
      button.addEventListener("click", function copyEmbedSnippet() {
        copyEmbedCode(button.getAttribute("data-copy-embed"));
      });
    });
    refs.fullscreenBtn.addEventListener("click", toggleFullscreen);
    document.addEventListener("fullscreenchange", updateFullscreenButton);
    refs.drawerCloseBtn.addEventListener("click", closeDrawer);
    refs.drawerBackdrop.addEventListener("click", closeDrawer);
    refs.drawerTriggers.forEach(function bindDrawerTrigger(button) {
      button.addEventListener("click", function onDrawerTrigger() {
        openDrawer(button.getAttribute("data-drawer-panel"));
      });
    });
    document.addEventListener("contextmenu", showSystemContextMenu);
    document.addEventListener("click", function onDocumentClick(event) {
      if (!refs.systemContextMenu.contains(event.target)) {
        hideSystemContextMenu();
      }
    });
    document.addEventListener("scroll", hideSystemContextMenu, true);
    window.addEventListener("resize", hideSystemContextMenu);

    document.addEventListener("keydown", function onKeydown(event) {
      if (event.key === "Escape") {
        if (!refs.systemContextMenu.hidden) {
          hideSystemContextMenu(true);
          return;
        }
        if (state.activeDrawerPanel) {
          closeDrawer();
          return;
        }
        hideSystemContextMenu();
        return;
      }

      if (event.defaultPrevented) {
        return;
      }

      var interactiveTarget = event.target?.closest?.(
        "input, textarea, select, button, a, pre, code, [data-embed-code], [role='slider'], [contenteditable='true']"
      );
      if (interactiveTarget) {
        return;
      }

      if (state.viewerEngine === "legacy" && ["r", "d", " "].includes(event.key.toLowerCase())) return;

      if (event.key === "ArrowLeft") {
        moveSelection(-1);
      } else if (event.key === "ArrowRight") {
        moveSelection(1);
      } else if (event.key.toLowerCase() === "r") {
        resetView();
      } else if (event.key.toLowerCase() === "f") {
        toggleFullscreen();
      } else if (event.key.toLowerCase() === "d") {
        toggleDirectorMode();
      } else if (event.key === "+" || event.key === "=") {
        if (!state.viewerReady || !state.viewerController || event.ctrlKey || event.metaKey || event.altKey) return;
        state.viewerController.zoomBy(-8);
      } else if (event.key === "-" || event.key === "_") {
        if (!state.viewerReady || !state.viewerController || event.ctrlKey || event.metaKey || event.altKey) return;
        state.viewerController.zoomBy(8);
      } else if (event.key === " " || event.code === "Space") {
        event.preventDefault();
        toggleAutorotate();
      }
    });
  }

  function toggleAutorotate() {
    if (!state.viewerReady || !state.viewerController) return;
    state.autorotate = state.viewerController.toggleAutorotate();
    updateAutorotateButton();
  }

  function updateAutorotateButton() {
    if (!refs.autorotateBtn) return;
    refs.autorotateBtn.classList.toggle("active", state.autorotate);
    setAttributeIfChanged(refs.autorotateBtn, "aria-pressed", state.autorotate ? "true" : "false");
    var label = window.XinTI18n.t(state.autorotate ? "widget.stopAutorotate" : "control.autorotate");
    setAttributeIfChanged(refs.autorotateBtn, "aria-label", label);
    if (refs.autorotateBtn.title !== label) refs.autorotateBtn.title = label;
  }

  function setAttributeIfChanged(element, name, value) {
    value = String(value);
    if (element.getAttribute(name) !== value) element.setAttribute(name, value);
  }

  function resetView() {
    if (!state.viewerReady || !state.viewerController) return;
    if (state.directorMode) stopDirectorMode();
    state.viewerController.resetView();
    state.autorotate = state.viewerController.getAutorotate();
    updateAutorotateButton();
  }

  async function connectBackend(options) {
    if (!state.settingsReady) {
      await initializeConsoleSettings();
      return;
    }
    var nextApiBase = refs.apiBaseInput.value.trim().replace(/\/$/, "");
    if (!window.XinTI18n.isSecureServiceUrl(nextApiBase)) {
      refs.settingsStatus.textContent = window.XinTI18n.t("error.secureServiceUrl");
      refs.apiBaseInput.focus();
      return;
    }
    refs.connectBtn.disabled = true;
    refs.settingsStatus.textContent = "";
    var persistApiBase = !(options && options.persist === false);
    try {
      if (persistApiBase) await patchConsoleSettings({ apiBase: nextApiBase });
    } catch (_) {
      refs.settingsStatus.textContent = window.XinTI18n.t("settings.saveFailed");
      refs.connectBtn.disabled = false;
      return;
    }
    refs.connectBtn.disabled = false;
    state.apiQueryOverride = persistApiBase ? null : state.apiQueryOverride;
    state.apiBase = nextApiBase;
    refs.apiBaseInput.value = nextApiBase;
    refs.settingsStatus.textContent = persistApiBase ? window.XinTI18n.t("status.connectionSaved") : "";
    startBackendConnection();
  }

  function startBackendConnection() {
    state.connectionId += 1;
    state.engineSwitchId += 1;
    state.pendingViewerEngine = null;
    state.viewerConfigReady = false;
    state.appInfo = { name: "XinT 全景系统", version: null, repositoryUrl: "https://github.com/XinTycd/XinT-Panorama-System" };
    renderAppInfo();
    cancelHotspotNavigation();
    var connectionId = state.connectionId;
    state.availableModes = null;
    state.galleryGroups = [];
    refs.fileInput.disabled = false;
    refs.uploadSubmitBtn.disabled = false;
    refs.uploadCancelBtn.disabled = false;
    refs.remoteFormStatus.textContent = "";
    refs.databaseFormStatus.textContent = "";
    updateSourceAvailability(null, "正在读取服务端支持的添加方式…");
    state.galleryRequestId += 1;
    state.projectRequestId += 1;
    state.projectActionId += 1;
    state.requestId += 1;
    state.currentProjectId = null;
    state.currentProject = null;
    state.currentSceneId = null;
    state.projects = [];
    state.items = [];
    state.currentIndex = -1;
    state.galleryGroup = null;
    state.gallerySearch = "";
    state.galleryPage = 1;
    refs.gallerySearchInput.value = "";
    refs.galleryGroupFilter.value = "*";
    refs.galleryActionStatus.textContent = "";
    refs.projectActionStatus.textContent = "";
    refs.sceneActionStatus.textContent = "";
    resetViewerSurface();
    updateMeta(null);
    renderGallery();
    renderProjects();
    renderProjectScenes();
    updateEmbedExample();
    Promise.all([loadAppInfo(connectionId), loadGallery(true)]).then(function startInitialPanorama() {
      if (state.connectionId !== connectionId || !state.viewerConfigReady || !state.viewerController || !state.items.length) return;
      var initialIndex = state.currentIndex < 0 || state.currentIndex >= state.items.length ? 0 : state.currentIndex;
      selectScene(initialIndex);
    });
    loadProjects();
  }

  async function loadProjects() {
    if (!projectPlugins) return false;
    return projectPlugins.runIfEnabled("project-workspace", async function loadEnabledProjects() {
      var connectionId = state.connectionId;
      var listRequestId = ++state.projectListRequestId;
      try {
        var response = await fetchJson("/api/projects?limit=100");
        if (connectionId !== state.connectionId || listRequestId !== state.projectListRequestId || !projectPlugins.isEnabled("project-workspace")) return;
        state.projects = response.items || [];
        var hasCurrentProject = state.projects.some(function findCurrentProject(project) {
          return project.id === state.currentProjectId;
        });
        var selectedProject = hasCurrentProject
          ? state.currentProjectId
          : state.projects[0] && state.projects[0].id;

        renderProjects();
        if (selectedProject) {
          await selectProject(selectedProject);
        } else {
          state.projectRequestId += 1;
          state.currentProjectId = null;
          state.currentProject = null;
          state.currentSceneId = null;
          renderProjectScenes();
        }
      } catch (error) {
        if (connectionId !== state.connectionId || listRequestId !== state.projectListRequestId || !projectPlugins.isEnabled("project-workspace")) return;
        state.projects = [];
        state.currentProjectId = null;
        state.currentProject = null;
        state.currentSceneId = null;
        renderProjects();
        renderProjectScenes();
      }
    });
  }

  async function createProject() {
    var connectionId = state.connectionId;
    var actionId = ++state.projectActionId;
    var name = refs.projectNameInput.value.trim();
    if (!name) {
      setStatus("请输入项目名称");
      return;
    }

    try {
      var response = await fetchJson("/api/projects", {
        method: "POST",
        body: JSON.stringify({ name: name })
      });
      if (connectionId !== state.connectionId || actionId !== state.projectActionId) return;
      refs.projectNameInput.value = "";
      refs.projectActionStatus.textContent = "";
      state.projects.unshift(response.project);
      renderProjects();
      await selectProject(response.project.id);
      if (connectionId !== state.connectionId || state.currentProjectId !== response.project.id) return;
      setStatus("项目已创建");
    } catch (error) {
      if (connectionId !== state.connectionId || actionId !== state.projectActionId) return;
      refs.projectActionStatus.textContent = "创建项目失败：" + error.message;
    }
  }

  async function deleteProject(project) {
    var message = "删除项目“" + project.name + "”及其全部场景、热点和发布版本？图库中的全景资源不会删除。";
    if (!window.confirm(message)) return;
    var connectionId = state.connectionId;
    var pluginGeneration = projectPlugins.getGeneration();
    refs.projectActionStatus.textContent = "正在删除项目…";
    try {
      await fetchJson("/api/projects/" + encodeURIComponent(project.id), { method: "DELETE" });
      if (connectionId !== state.connectionId || !projectPlugins.isEnabled("project-workspace") || pluginGeneration !== projectPlugins.getGeneration()) return;
      state.projects = state.projects.filter(function keepProject(item) { return item.id !== project.id; });
      refs.projectActionStatus.textContent = "项目及其场景、热点和发布版本已删除。";
      if (project.id === state.currentProjectId) {
        state.projectRequestId += 1;
        state.projectActionId += 1;
        state.currentProjectId = null;
        state.currentProject = null;
        state.currentSceneId = null;
        state.activeHotspotId = null;
        refs.hotspotLayer.innerHTML = "";
        var nextProject = state.projects[0];
        renderProjects();
        renderProjectScenes();
        renderSpatialHotspots();
        if (nextProject) await selectProject(nextProject.id);
      } else renderProjects();
      setStatus("项目已删除");
    } catch (error) {
      if (connectionId === state.connectionId && projectPlugins.isEnabled("project-workspace") && pluginGeneration === projectPlugins.getGeneration()) refs.projectActionStatus.textContent = "删除项目失败：" + error.message;
    }
  }

  function openRenameDialog(type, item) {
    refs.renameDialog.dataset.type = type;
    refs.renameDialog.dataset.id = item.id;
    refs.renameDialog.dataset.projectId = state.currentProjectId || "";
    refs.renameDialog.querySelector("h2").textContent = window.XinTI18n.t(type === "project" ? "status.renameProjectTitle" : "status.renameSceneTitle");
    refs.renameLabel.textContent = window.XinTI18n.t(type === "project" ? "status.projectNameLabel" : "status.sceneNameLabel");
    refs.renameInput.value = item.name || "";
    refs.renameInput.disabled = false;
    refs.renameStatus.textContent = "";
    refs.renameSubmit.disabled = false;
    refs.renameDialog.showModal();
    refs.renameInput.focus();
    refs.renameInput.select();
  }

  async function submitRename(event) {
    event.preventDefault();
    var dialog = refs.renameDialog;
    var type = dialog.dataset.type;
    var id = dialog.dataset.id;
    var projectId = dialog.dataset.projectId;
    var name = refs.renameInput.value.trim();
    if (!name) {
      refs.renameStatus.textContent = "名称不能为空。";
      refs.renameInput.focus();
      return;
    }
    var connectionId = state.connectionId;
    var requestId = ++state.projectActionId;
    refs.renameSubmit.disabled = true;
    refs.renameInput.disabled = true;
    refs.renameStatus.textContent = "正在保存…";
    try {
      var isProject = type === "project";
      var response = await fetchJson((isProject ? "/api/projects/" : "/api/scenes/") + encodeURIComponent(id), {
        method: "POST",
        body: JSON.stringify({ name: name })
      });
      if (connectionId !== state.connectionId || requestId !== state.projectActionId || !dialog.open) return;
      if (isProject) {
        var updated = response.project;
        state.projects = state.projects.map(function replaceProject(project) { return project.id === id ? updated : project; });
        renderProjects();
        if (state.currentProjectId === id) {
          await selectProject(id);
          if (connectionId !== state.connectionId || state.currentProjectId !== id) return;
        }
      } else {
        if (state.currentProjectId !== projectId) return;
        await selectProject(projectId);
        if (connectionId !== state.connectionId || state.currentProjectId !== projectId) return;
      }
      dialog.close();
      refs.projectActionStatus.textContent = isProject ? "项目名称已更新。" : "场景名称已更新。";
      refs.sceneActionStatus.textContent = isProject ? "" : "场景名称已更新。";
    } catch (error) {
      if (connectionId === state.connectionId && dialog.open) refs.renameStatus.textContent = "保存失败：" + error.message;
    } finally {
      if (dialog.open) {
        refs.renameSubmit.disabled = false;
        refs.renameInput.disabled = false;
      }
    }
  }

  async function selectProject(projectId) {
    if (!projectPlugins || !projectPlugins.isEnabled("project-workspace")) return;
    cancelHotspotNavigation();
    var connectionId = state.connectionId;
    var requestId = ++state.projectRequestId;
    state.projectActionId += 1;
    state.currentProjectId = projectId;
    state.currentProject = null;
    state.currentSceneId = null;
    refs.projectActionStatus.textContent = "";
    refs.sceneActionStatus.textContent = "";
    renderProjects();
    renderProjectScenes();
    try {
      var response = await fetchJson("/api/projects/" + encodeURIComponent(projectId));
      if (connectionId !== state.connectionId || requestId !== state.projectRequestId || state.currentProjectId !== projectId || !projectPlugins.isEnabled("project-workspace")) return;
      state.currentProject = response.project;
      renderProjects();
      renderProjectScenes();
      renderSpatialHotspots();
    } catch (error) {
      if (connectionId !== state.connectionId || requestId !== state.projectRequestId) return;
      state.currentProjectId = null;
      state.currentProject = null;
      state.currentSceneId = null;
      renderProjects();
      renderProjectScenes();
      setStatus("加载项目失败");
    }
  }

  async function addCurrentPanoramaAsScene() {
    var connectionId = state.connectionId;
    var projectId = state.currentProjectId;
    var actionId = ++state.projectActionId;
    var currentItem = state.currentIndex >= 0 ? state.items[state.currentIndex] : null;
    if (!projectId) {
      setStatus("请先创建或选择项目");
      return;
    }
    if (!currentItem) {
      setStatus("请先选择一张全景图");
      return;
    }

    try {
      await fetchJson("/api/projects/" + encodeURIComponent(projectId) + "/scenes", {
        method: "POST",
        body: JSON.stringify({
          name: refs.sceneNameInput.value.trim() || currentItem.name,
          panoramaId: currentItem.id
        })
      });
      if (connectionId !== state.connectionId || actionId !== state.projectActionId || projectId !== state.currentProjectId) return;
      refs.sceneNameInput.value = "";
      refs.sceneActionStatus.textContent = "";
      await selectProject(projectId);
      if (connectionId !== state.connectionId || state.currentProjectId !== projectId) return;
      setStatus("场景已加入项目");
    } catch (error) {
      if (connectionId !== state.connectionId || actionId !== state.projectActionId || projectId !== state.currentProjectId) return;
      refs.sceneActionStatus.textContent = "添加场景失败：" + error.message;
    }
  }

  function deleteProjectScene(scene) {
    return projectSceneActions.deleteScene(scene);
  }

  async function deletePanorama(item, index) {
    var label = "#" + item.panoramaNo + " “" + (item.name || "未命名全景图") + "”";
    var isClientItem = isClientUpload(item);
    if (!window.confirm("删除图库记录 " + label + "？" + (isClientItem ? "图片保存在此浏览器中，删除记录后也会尝试清理本地副本。" : "原始图片文件不会删除。") + "若项目场景仍引用它，系统会拒绝删除。")) return;
    var connectionId = state.connectionId;
    refs.galleryActionStatus.textContent = "正在删除图库记录…";
    try {
      await fetchJson("/api/panoramas/" + encodeURIComponent(item.id), { method: "DELETE" });
      if (connectionId !== state.connectionId) return;
      if (isClientUpload(item)) {
        try {
          var clientMediaId = getClientMediaId(item);
          if (clientMediaId && window.XinTClientMedia) await window.XinTClientMedia.remove(clientMediaId);
        } catch (cleanupError) {
          refs.galleryActionStatus.textContent = "图库记录已删除，但清理此浏览器中的图片失败：" + cleanupError.message;
        }
      }
      var wasCurrent = state.currentIndex === index;
      state.items = state.items.filter(function keepItem(entry) { return entry.id !== item.id; });
      if (wasCurrent) {
        state.currentIndex = state.items.length ? Math.min(index, state.items.length - 1) : -1;
        state.currentSceneId = null;
        state.activeHotspotId = null;
        state.requestId += 1;
        resetViewerSurface();
        updateMeta(null);
      } else if (state.currentIndex > index) state.currentIndex -= 1;
      var filteredEntries = getFilteredGalleryEntries();
      var pages = Math.max(1, Math.ceil(filteredEntries.length / state.galleryPageSize));
      state.galleryPage = Math.min(state.galleryPage, pages);
      state.activeHotspotId = null;
      renderGallery();
      refs.hotspotLayer.innerHTML = "";
      if (wasCurrent && state.currentIndex >= 0) await selectScene(state.currentIndex);
      else if (wasCurrent) updateMeta(null);
      if (connectionId !== state.connectionId) return;
      if (state.currentProjectId) await selectProject(state.currentProjectId);
      if (!refs.galleryActionStatus.textContent.includes("清理此浏览器")) refs.galleryActionStatus.textContent = isClientItem ? "图库记录已删除；此浏览器中的图片副本已清理。" : "图库记录已删除；原始图片文件保留。";
      setStatus("图库记录已删除");
    } catch (error) {
      if (connectionId === state.connectionId) refs.galleryActionStatus.textContent = "删除失败：" + error.message;
    }
  }

  async function loadAppInfo(connectionId) {
    connectionId = connectionId === undefined ? state.connectionId : connectionId;
    try {
      var response = await fetchJson("/api/config");
      if (connectionId !== state.connectionId) return;
      if (response.app) {
        state.appInfo = {
          name: response.app.name || state.appInfo.name,
          version: response.app.version || null,
          repositoryUrl: response.app.repositoryUrl || state.appInfo.repositoryUrl
        };
        renderAppInfo();
      }
      if (response.viewer && (response.viewer.engine === "psv" || response.viewer.engine === "legacy")) {
        await applyViewerEngine(response.viewer, connectionId);
      } else {
        refs.viewerEngineStatus.textContent = window.XinTI18n.t("status.unsupported");
        refs.viewerEngineSelect.disabled = true;
        await ensureViewerInitialized("psv", connectionId);
      }
      if (connectionId !== state.connectionId) return;
      state.viewerConfigReady = true;
      state.availableModes = Array.isArray(response.modes) ? response.modes : [];
      updateSourceAvailability(state.availableModes, "");
      refs.settingsStatus.textContent = window.XinTI18n.t("status.connected", { url: state.apiBase });
      if (response.mediaStorage) {
        configureMediaStorage(response.mediaStorage);
      } else {
        refs.mediaStorageMode.disabled = true;
        refs.mediaFormatSelect.disabled = true;
        refs.saveMediaStorageBtn.disabled = true;
        refs.mediaStorageHelp.textContent = window.XinTI18n.t("status.mediaUnsupported");
        refs.mediaStorageStatus.textContent = window.XinTI18n.t("status.storageUnavailable");
      }
      if (!response.app) return;
    } catch (error) {
      if (connectionId === state.connectionId) {
        state.availableModes = null;
        updateSourceAvailability(null, window.XinTI18n.t("status.connectionUnavailable"));
        refs.settingsStatus.textContent = window.XinTI18n.t("status.connectFailed", { message: error.message });
        await ensureViewerInitialized("psv", connectionId);
        if (connectionId === state.connectionId) state.viewerConfigReady = true;
      }
    }
  }

  async function applyViewerEngine(settings, connectionId) {
    if (connectionId !== state.connectionId) return;
    state.viewerEngineForced = settings.forcedByEnvironment === true;
    var engine = settings.engine === "legacy" ? "legacy" : "psv";
    refs.viewerEngineSelect.value = engine;
    refs.viewerEngineSelect.disabled = state.viewerEngineForced;
    refs.viewerEngineStatus.textContent = state.viewerEngineForced
      ? window.XinTI18n.t("status.engineForced", { engine: engine === "psv" ? "Photo Sphere Viewer" : window.XinTI18n.t("settings.engine.legacy") })
      : window.XinTI18n.t("status.engineSettingHelp");
    if (state.viewerController && engine !== state.viewerEngine) return await switchViewerEngine(engine, connectionId);
    if (!state.viewerController) return await ensureViewerInitialized(engine, connectionId);
    return true;
  }

  async function ensureViewerInitialized(engine, connectionId) {
    if (connectionId !== state.connectionId) return false;
    var initId = ++state.engineSwitchId;
    if (state.viewerController && state.viewerEngine === engine) {
      state.pendingViewerEngine = null;
      return true;
    }
    state.pendingViewerEngine = engine;
    try {
      await ensureViewerEngineAssets(engine);
      if (connectionId !== state.connectionId || initId !== state.engineSwitchId) return false;
      if (state.viewerController) {
        if (state.viewerEngine === engine) {
          state.pendingViewerEngine = null;
          return true;
        }
        return await switchViewerEngine(engine, connectionId);
      }
      state.viewerEngine = engine;
      if (initViewer(engine)) {
        state.pendingViewerEngine = null;
        if (state.viewerConfigReady && state.items.length && state.currentIndex >= 0) selectScene(state.currentIndex);
        return true;
      }
      throw new Error("无法创建查看器实例");
    } catch (error) {
      if (connectionId === state.connectionId && initId === state.engineSwitchId) {
        state.viewerReady = false;
        setViewerState("error", "查看器资源加载失败", error.message, "重新加载", "engine-reload");
      }
      return false;
    }
  }

  async function saveViewerEngine() {
    var engine = refs.viewerEngineSelect.value;
    var connectionId = state.connectionId;
    if (state.pendingUploads.length) {
      refs.viewerEngineSelect.value = state.viewerEngine;
      refs.viewerEngineStatus.textContent = window.XinTI18n.t("status.switchEngineBlocked");
      return;
    }
    refs.viewerEngineSelect.disabled = true;
    refs.viewerEngineStatus.textContent = window.XinTI18n.t("status.engineSaving");
    try {
      var result = await fetchJson("/api/settings/viewer", { method: "PUT", body: JSON.stringify({ engine: engine }) });
      if (connectionId !== state.connectionId) return;
      if (!result.viewer || result.viewer.engine !== engine) throw new Error("服务端未确认预览引擎设置");
      var switched = await applyViewerEngine(result.viewer, connectionId);
      if (connectionId !== state.connectionId) return;
      if (engine !== state.viewerEngine || switched === false) throw new Error("预览引擎已保存，但当前浏览器无法启动该引擎");
      refs.viewerEngineStatus.textContent = window.XinTI18n.t("status.engineSaved");
    } catch (error) {
      if (connectionId !== state.connectionId) return;
      refs.viewerEngineSelect.value = state.viewerEngine;
      refs.viewerEngineStatus.textContent = window.XinTI18n.t("status.saveFailed", { message: error.message });
    } finally {
      if (connectionId === state.connectionId && !state.viewerEngineForced) refs.viewerEngineSelect.disabled = false;
    }
  }

  async function switchViewerEngine(engine, connectionId) {
    if (engine !== "psv" && engine !== "legacy") return;
    if (connectionId !== state.connectionId) return false;
    var switchId = ++state.engineSwitchId;
    state.pendingViewerEngine = engine;
    if (state.viewerController && engine === state.viewerEngine) {
      state.pendingViewerEngine = null;
      return true;
    }
    try {
      await ensureViewerEngineAssets(engine);
    } catch (assetError) {
      if (connectionId === state.connectionId && switchId === state.engineSwitchId) {
        state.viewerReady = false;
        setViewerState("error", "查看器资源加载失败", assetError.message, "重新加载", "engine-reload");
      }
      return false;
    }
    if (connectionId !== state.connectionId || switchId !== state.engineSwitchId) return false;

    var savedView = state.viewerController ? state.viewerController.getView() : { yaw: 180, pitch: 0, fov: 75 };
    var item = state.currentIndex >= 0 ? state.items[state.currentIndex] : null;
    var previousController = state.viewerController;
    state.requestId += 1;
    state.viewerReady = false;
    if (state.directorMode) stopDirectorMode();
    state.viewerController = null;
    if (previousController) previousController.dispose();
    state.viewerEngine = engine;
    refs.viewerPanel.classList.toggle("is-legacy", engine === "legacy");
    if (!initViewer(engine, savedView)) {
      state.pendingViewerEngine = engine;
      setViewerState("error", "预览引擎启动失败", "查看器实例无法创建。", "重新加载", "engine-reload");
      return false;
    }
    state.pendingViewerEngine = null;
    var nextController = state.viewerController;
    state.maxTextureSize = nextController.getMaxTextureSize();
    state.autorotate = false;
    updateAutorotateButton();
    if (!item) return true;
    var requestId = ++state.requestId;
    try {
      var imageUrl = await resolveItemImageUrl(item, false);
      if (!imageUrl) throw new Error("当前图片资源不可用");
      if (connectionId !== state.connectionId || requestId !== state.requestId || state.viewerController !== nextController) return;
      var result = await nextController.setPanorama(imageUrl);
      if (connectionId !== state.connectionId || requestId !== state.requestId || state.viewerController !== nextController || result.stale) return;
      nextController.setView(savedView, 0);
      state.viewerReady = true;
      setViewerState("ready", "全景图片已加载", "预览引擎：" + (engine === "psv" ? "Photo Sphere Viewer" : "兼容球面引擎"));
      return true;
    } catch (error) {
      if (connectionId === state.connectionId && requestId === state.requestId) setViewerState("error", "预览引擎切换失败", error.message, "重新加载");
      return false;
    }
  }

  function configureMediaStorage(settings) {
    state.mediaStorageSettings = {
      mode: ["server", "client", "sqlite", "cloud"].includes(settings.mode) ? settings.mode : "server",
      cloud: settings.cloud || { url: "", hasToken: false },
      format: ["original", "base64", "transcode"].includes(settings.format) ? settings.format : "original",
      codec: ["jpeg", "png", "webp"].includes(settings.codec) ? settings.codec : "jpeg",
      quality: Number.isInteger(settings.quality) ? settings.quality : 85
    };
    refs.mediaStorageMode.value = state.mediaStorageSettings.mode;
    refs.mediaStorageMode.disabled = false;
    refs.cloudDatabaseUrlInput.value = state.mediaStorageSettings.cloud.url || "";
    refs.cloudTokenInput.value = "";
    refs.mediaFormatSelect.value = state.mediaStorageSettings.format;
    refs.mediaCodecSelect.value = state.mediaStorageSettings.codec;
    refs.mediaQualityInput.value = String(state.mediaStorageSettings.quality);
    refs.mediaQualityValue.value = String(state.mediaStorageSettings.quality);
    refs.mediaQualityValue.textContent = String(state.mediaStorageSettings.quality);
    refs.mediaFormatSelect.disabled = false;
    refs.saveMediaStorageBtn.disabled = false;
    refs.mediaStorageStatus.textContent = window.XinTI18n.t("status.storageRead");
    refs.mediaStorageHelp.textContent = window.XinTI18n.t("settings.help.imageFormat");
    updateMediaStorageForm();
  }

  function updateMediaStorageForm() {
    var mode = refs.mediaStorageMode.value || "server";
    var formState = window.XinTMediaStorageForm.getState(mode, refs.mediaFormatSelect.value, refs.mediaCodecSelect.value);
    refs.mediaFormatSelect.value = formState.format;
    refs.mediaFormatOriginalOption.disabled = !formState.originalAllowed;
    refs.cloudSettingsPanel.hidden = !formState.cloudVisible;
    refs.cloudDatabaseUrlInput.disabled = !formState.cloudVisible;
    refs.cloudTokenInput.disabled = !formState.cloudVisible;
    refs.transcodeSettings.hidden = !formState.transcodeVisible;
    refs.mediaQualityField.hidden = !formState.qualityVisible;
    var descriptions = {
      server: window.XinTI18n.t("status.storageHelp.server"),
      client: window.XinTI18n.t("status.storageHelp.client"),
      sqlite: window.XinTI18n.t("status.storageHelp.sqlite"),
      cloud: window.XinTI18n.t("status.storageHelp.cloud")
    };
    refs.mediaStorageModeHelp.textContent = descriptions[mode] || descriptions.server;
  }

  async function saveMediaStorageSettings() {
    if (!state.mediaStorageSettings) return;
    var connectionId = state.connectionId;
    var mode = refs.mediaStorageMode.value;
    var payload = {
      mode: mode,
      cloud: { url: refs.cloudDatabaseUrlInput.value.trim(), token: refs.cloudTokenInput.value },
      format: refs.mediaFormatSelect.value,
      codec: refs.mediaCodecSelect.value,
      quality: Number(refs.mediaQualityInput.value)
    };
    refs.saveMediaStorageBtn.disabled = true;
    refs.mediaStorageStatus.textContent = "正在保存图片存储设置…";
    try {
      var response = await fetchJson("/api/settings/media-storage", { method: "PUT", body: JSON.stringify(payload) });
      if (connectionId !== state.connectionId) return;
      if (response.mediaStorage) configureMediaStorage(response.mediaStorage);
      refs.mediaStorageStatus.textContent = "图片存储设置已保存。之后上传的图片将使用此设置。";
    } catch (error) {
      if (connectionId === state.connectionId) refs.mediaStorageStatus.textContent = "保存失败：" + error.message;
    } finally {
      if (connectionId === state.connectionId) refs.saveMediaStorageBtn.disabled = false;
    }
  }

  function updateSourceAvailability(modes, message) {
    var labels = {
      upload: window.XinTI18n.t("library.upload"),
      external: window.XinTI18n.t("library.remote"),
      database: window.XinTI18n.t("library.database")
    };
    var options = Array.prototype.slice.call(refs.addSourceSelect.querySelectorAll("[data-source-option]"));
    var available = [];
    options.forEach(function updateOption(option) {
      var mode = option.getAttribute("data-source-option");
      var enabled = Array.isArray(modes) && modes.indexOf(mode) !== -1;
      option.disabled = !enabled;
      if (enabled) available.push(mode);
    });
    refs.addSourceSelect.disabled = !Array.isArray(modes) || available.length === 0;
    if (!Array.isArray(modes)) {
      refs.addSourceSelect.value = "";
      refs.sourceAvailability.textContent = message ? window.XinTI18n.translateMessage(message) : window.XinTI18n.t("library.readingSources");
    } else if (!available.length) {
      refs.addSourceSelect.value = "";
      refs.sourceAvailability.textContent = message ? window.XinTI18n.translateMessage(message) : window.XinTI18n.t("status.sourcesDisabled");
    } else {
      if (available.indexOf(refs.addSourceSelect.value) === -1) refs.addSourceSelect.value = available[0];
      refs.sourceAvailability.textContent = message ? window.XinTI18n.translateMessage(message) : window.XinTI18n.t("status.sourceMethods", { methods: available.map(function getLabel(mode) { return labels[mode]; }).join(window.XinTI18n.getLanguage() === "en" ? ", " : "、") });
    }
    updateSourceForms();
  }

  function updateSourceForms() {
    var selected = refs.addSourceSelect.value;
    refs.uploadSourceForm.hidden = selected !== "upload";
    refs.remoteSourceForm.hidden = selected !== "external";
    refs.databaseSourceForm.hidden = selected !== "database";
  }

  function renderAppInfo() {
    refs.systemNameText.textContent = window.XinTI18n.translateMessage(state.appInfo.name);
    refs.systemVersionText.textContent = state.appInfo.version
      ? window.XinTI18n.t("widget.version", { version: String(state.appInfo.version).replace(/^v/i, "") })
      : window.XinTI18n.t("widget.versionPending");
    refs.githubRepoLink.href = state.appInfo.repositoryUrl;
  }

  function showSystemContextMenu(event) {
    if (event.target && event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) {
      hideSystemContextMenu();
      return;
    }

    event.preventDefault();
    state.systemContextMenuReturnFocus = document.activeElement;
    refs.systemContextMenu.hidden = false;

    var menuWidth = refs.systemContextMenu.offsetWidth;
    var menuHeight = refs.systemContextMenu.offsetHeight;
    var left = Math.min(Math.max(12, event.clientX), Math.max(12, window.innerWidth - menuWidth - 12));
    var top = Math.min(Math.max(12, event.clientY), Math.max(12, window.innerHeight - menuHeight - 12));

    refs.systemContextMenu.style.left = left + "px";
    refs.systemContextMenu.style.top = top + "px";
    refs.githubRepoLink.focus();
  }

  function hideSystemContextMenu(restoreFocus) {
    var wasVisible = !refs.systemContextMenu.hidden;
    refs.systemContextMenu.hidden = true;
    if (restoreFocus && wasVisible && state.systemContextMenuReturnFocus && state.systemContextMenuReturnFocus.focus) {
      state.systemContextMenuReturnFocus.focus();
    } else if (document.activeElement === refs.githubRepoLink) {
      refs.githubRepoLink.blur();
    }
    state.systemContextMenuReturnFocus = null;
  }

  function openDrawer(panelName) {
    if (panelName === "projects" && (!projectPlugins || !projectPlugins.isEnabled("project-workspace"))) {
      if (projectPlugins) openDrawer("plugins");
      return;
    }
    var labels = {
      library: { eyebrow: "drawer.eyebrow.library", title: "drawer.library" },
      projects: { eyebrow: "drawer.eyebrow.projects", title: "drawer.projects" },
      plugins: { eyebrow: "drawer.eyebrow.plugins", title: "drawer.plugins" },
      editor: { eyebrow: "drawer.eyebrow.editor", title: "drawer.editor" },
      embed: { eyebrow: "drawer.eyebrow.embed", title: "drawer.embed" },
      settings: { eyebrow: "drawer.eyebrow.settings", title: "drawer.settings" }
    };
    var panelExists = refs.drawerPanels.some(function findPanel(panel) {
      return panel.getAttribute("data-panel") === panelName;
    });

    if (!panelExists) {
      return;
    }

    state.activeDrawerPanel = panelName;
    refs.appShell.classList.add("drawer-open");
    refs.workspaceDrawer.hidden = false;
    refs.drawerBackdrop.hidden = false;
    refs.drawerEyebrow.textContent = window.XinTI18n.t(labels[panelName] ? labels[panelName].eyebrow : "nav.label");
    refs.drawerTitle.textContent = window.XinTI18n.t(labels[panelName] ? labels[panelName].title : "drawer.workspace");
    refs.drawerPanels.forEach(function updateDrawerPanel(panel) {
      panel.hidden = panel.getAttribute("data-panel") !== panelName;
    });
    refs.drawerTriggers.forEach(function updateDrawerTrigger(trigger) {
      var active = trigger.getAttribute("data-drawer-panel") === panelName;
      trigger.setAttribute("aria-pressed", active ? "true" : "false");
    });
    hideSystemContextMenu();
  }

  function renderProjectPluginState() {
    if (!refs.pluginList || !projectPlugins) return;
    var focusedToggle = document.activeElement && document.activeElement.getAttribute("data-plugin-toggle");
    refs.pluginList.innerHTML = "";
    projectPlugins.list().forEach(function renderPlugin(plugin) {
      var card = document.createElement("article");
      var icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      var use = document.createElementNS("http://www.w3.org/2000/svg", "use");
      var copy = document.createElement("div");
      var name = document.createElement("strong");
      var description = document.createElement("span");
      var kind = document.createElement("span");
      var toggle = document.createElement("button");
      card.className = "plugin-card";
      icon.setAttribute("class", "xint-icon plugin-card__icon");
      icon.setAttribute("aria-hidden", "true");
      icon.setAttribute("focusable", "false");
      icon.setAttribute("viewBox", "0 0 256 256");
      use.setAttribute("href", "./icons/sprite.svg#" + plugin.icon);
      icon.appendChild(use);
      copy.className = "plugin-card__copy";
      name.textContent = window.XinTI18n.translateMessage(plugin.name);
      description.textContent = window.XinTI18n.translateMessage(plugin.description);
      kind.className = "plugin-card__kind";
      kind.textContent = window.XinTI18n.t(plugin.kind === "built-in" ? "plugins.builtIn" : "nav.plugins");
      copy.append(name, description);
      toggle.type = "button";
      toggle.className = "plugin-action-button" + (plugin.enabled ? " plugin-action-button--disable" : " plugin-action-button--enable");
      toggle.setAttribute("aria-label", window.XinTI18n.t(plugin.enabled ? "plugins.disable" : "plugins.enable", { name: window.XinTI18n.translateMessage(plugin.name) }));
      toggle.setAttribute("data-plugin-toggle", plugin.id);
      toggle.textContent = window.XinTI18n.t(plugin.enabled ? "plugins.disableShort" : "plugins.enableShort");
      toggle.disabled = Boolean(state.pendingPluginId);
      card.append(icon, copy, kind, toggle);
      refs.pluginList.appendChild(card);
    });
    var enabled = projectPlugins.isEnabled("project-workspace");
    refs.projectNavButtons.forEach(function showProjectEntry(button) { button.hidden = !enabled; });
    refs.drawerPanels.forEach(function gateProjectPanel(panel) {
      if (panel.getAttribute("data-panel") === "projects") panel.hidden = !enabled || panel.getAttribute("data-panel") !== state.activeDrawerPanel;
    });
    if (focusedToggle) {
      var nextFocus = refs.pluginList.querySelector('[data-plugin-toggle="' + focusedToggle + '"]');
      if (nextFocus) nextFocus.focus();
    }
  }

  function disableProjectWorkspace() {
    cancelHotspotNavigation();
    state.projectRequestId += 1;
    state.projectListRequestId += 1;
    state.projectActionId += 1;
    state.currentProjectId = null;
    state.currentProject = null;
    state.currentSceneId = null;
    state.activeHotspotId = null;
    state.projects = [];
    refs.projectActionStatus.textContent = "";
    refs.sceneActionStatus.textContent = "";
    if (refs.renameDialog.open) refs.renameDialog.close();
    renderProjects();
    renderProjectScenes();
    renderSpatialHotspots();
    if (state.activeDrawerPanel === "projects") openDrawer("plugins");
  }

  function closeDrawer() {
    state.activeDrawerPanel = null;
    refs.appShell.classList.remove("drawer-open");
    refs.workspaceDrawer.hidden = true;
    refs.drawerBackdrop.hidden = true;
    refs.drawerTriggers.forEach(function resetDrawerTrigger(trigger) {
      trigger.setAttribute("aria-pressed", "false");
    });
  }

  async function loadGallery(deferInitialScene) {
    var connectionId = state.connectionId;
    var galleryRequestId = ++state.galleryRequestId;
    setStatus("连接中...");
    setViewerState("loading", "正在连接全景资源", "同步图库与查看器状态");
    try {
      var results = await Promise.all([
        fetchJson("/api/gallery"),
        fetchJson("/api/gallery/groups").catch(function missingGroups() { return { items: [] }; })
      ]);
      var response = results[0];
      if (connectionId !== state.connectionId || galleryRequestId !== state.galleryRequestId) return;
      state.galleryGroups = results[1].items || [];
      renderGalleryGroupSelects();
      state.items = response.items || [];
      renderGallery();
      updateEmbedExample();

      if (!state.items.length) {
        setStatus("图库为空");
        resetViewerSurface();
        state.currentIndex = -1;
        state.currentSceneId = null;
        setViewerState(
          "empty",
          "选择一个全景场景开始查看",
          "支持本地图片、远程资源与项目场景。",
          "打开资源库",
          "library"
        );
        updateMeta(null);
        return;
      }

      if (state.currentIndex < 0 || state.currentIndex >= state.items.length) {
        state.currentIndex = 0;
      }

      if (!deferInitialScene) await selectScene(state.currentIndex);
    } catch (error) {
      if (connectionId !== state.connectionId || galleryRequestId !== state.galleryRequestId) return;
      setStatus("连接失败");
      setViewerState(
        "error",
        "暂时无法连接全景资源",
        "请检查 API 地址与后端服务状态后重试。",
        "重新连接",
        "reload"
      );
      refs.galleryList.innerHTML = '<div class="gallery-item">后端未响应，请检查 API 地址与服务状态。</div>';
      updateMeta(null);
    }
  }

  async function clearGallery() {
    if (!window.confirm("清空图库会删除全部图库记录，项目中的场景关联也将无法显示；此浏览器中保存的图片副本也会清理。服务器端原始图片文件会保留。确定继续吗？")) {
      return;
    }
    var connectionId = state.connectionId;
    try {
      await fetchJson("/api/gallery/clear", {
        method: "POST"
      });
      if (connectionId !== state.connectionId) return;
      var clientItems = state.items.filter(isClientUpload);
      var cleanupFailures = 0;
      for (var clientIndex = 0; clientIndex < clientItems.length; clientIndex += 1) {
        var mediaId = getClientMediaId(clientItems[clientIndex]);
        if (!mediaId || !window.XinTClientMedia) continue;
        try { await window.XinTClientMedia.remove(mediaId); } catch (cleanupError) { cleanupFailures += 1; }
      }
      state.galleryRequestId += 1;
      state.requestId += 1;
      state.items = [];
      state.currentIndex = -1;
      state.currentSceneId = null;
      resetViewerSurface();
      renderGallery();
      updateMeta(null);
      setViewerState(
        "empty",
        "选择一个全景场景开始查看",
        "支持本地图片、远程资源与项目场景。",
        "打开资源库",
        "library"
      );
      setStatus(cleanupFailures ? "图库已清空；有 " + cleanupFailures + " 个浏览器本地图片副本未能清理" : "图库已清空");
      loadProjects();
    } catch (error) {
      if (connectionId !== state.connectionId) return;
      setStatus("清空图库失败：" + error.message);
    }
  }

  async function registerRemoteUrl() {
    var url = refs.remoteUrlInput.value.trim();
    if (!/^https?:\/\//i.test(url)) {
      refs.remoteFormStatus.textContent = "请输入有效的 HTTP 或 HTTPS 图片地址。";
      setStatus("请输入有效 URL");
      return;
    }
    var connectionId = state.connectionId;
    refs.registerUrlBtn.disabled = true;
    refs.remoteFormStatus.textContent = "正在添加图片链接…";
    setStatus("正在添加图片链接…");
    try {
      var response = await fetchJson("/api/panoramas/register", {
        method: "POST",
        body: JSON.stringify({ name: refs.remoteNameInput.value.trim() || "远程全景图", url: url, group: refs.remoteGroupInput.value.trim() })
      });
      if (connectionId !== state.connectionId) return;
      refs.remoteNameInput.value = "";
      refs.remoteUrlInput.value = "";
      refs.remoteGroupInput.value = "";
      refs.remoteFormStatus.textContent = "图片已添加到资源库。";
      await applyAddedItem(response, connectionId);
    } catch (error) {
      if (connectionId === state.connectionId) {
        refs.remoteFormStatus.textContent = "添加失败：" + error.message;
        setStatus("添加失败：" + error.message);
      }
    } finally {
      refs.registerUrlBtn.disabled = false;
    }
  }

  async function createDatabaseRecord() {
    var imageUrl = refs.databaseImageUrlInput.value.trim();
    if (!imageUrl) {
      refs.databaseFormStatus.textContent = "请输入已有图片地址。";
      setStatus("请输入图片地址");
      return;
    }

    setStatus("保存中...");
    var connectionId = state.connectionId;
    refs.createDatabaseRecordBtn.disabled = true;
    refs.databaseFormStatus.textContent = "正在保存图片记录…";
    try {
      var response = await fetchJson("/api/panoramas/create", {
        method: "POST",
        body: JSON.stringify({
          title: refs.databaseTitleInput.value.trim() || "数据库全景图",
          imageUrl: imageUrl,
          thumbnailUrl: refs.databaseThumbnailInput.value.trim() || imageUrl,
          group: refs.databaseGroupInput.value.trim()
        })
      });
      if (connectionId !== state.connectionId) return;
      refs.databaseTitleInput.value = "";
      refs.databaseImageUrlInput.value = "";
      refs.databaseGroupInput.value = "";
      refs.databaseThumbnailInput.value = "";
      refs.databaseFormStatus.textContent = "图片记录已添加到资源库。";
      await applyAddedItem(response, connectionId);
    } catch (error) {
      if (connectionId === state.connectionId) {
        refs.databaseFormStatus.textContent = "保存失败：" + error.message;
        setStatus("保存失败：" + error.message);
      }
    } finally {
      refs.createDatabaseRecordBtn.disabled = false;
    }
  }

  async function applyAddedItem(response, connectionId) {
    if (connectionId !== state.connectionId || !response) return;
    var galleryRequestId = ++state.galleryRequestId;
    if (Array.isArray(response.items)) {
      state.items = response.items;
    } else {
      try {
        var gallery = await fetchJson("/api/gallery");
        if (connectionId !== state.connectionId || galleryRequestId !== state.galleryRequestId) return;
        state.items = gallery.items || [];
      } catch (_) {
        if (connectionId === state.connectionId && galleryRequestId === state.galleryRequestId) {
          setStatus("资源已保存，刷新图库失败，请重新加载图库");
        }
        return false;
      }
    }
    var itemId = response.item && response.item.id;
    var index = state.items.findIndex(function findAddedItem(item) { return item.id === itemId; });
    state.galleryGroup = null;
    state.gallerySearch = "";
    refs.gallerySearchInput.value = "";
    refs.galleryGroupFilter.value = "*";
    if (index >= 0) state.currentIndex = index;
    if (index >= 0) state.galleryPage = Math.floor(index / state.galleryPageSize) + 1;
    renderGallery();
    if (index >= 0) {
      state.currentIndex = index;
      await selectScene(index);
    }
    if (connectionId === state.connectionId) setStatus("已添加到资源库");
    return true;
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
          group: refs.editGroupInput.value.trim(),
          description: refs.editDescriptionInput.value.trim()
        })
      });

      state.items = payload.items || state.items;
      state.currentIndex = state.items.findIndex(function findUpdatedItem(item) {
        return item.id === currentItem.id;
      });
      state.galleryGroup = null;
      state.gallerySearch = "";
      refs.gallerySearchInput.value = "";
      refs.galleryGroupFilter.value = "*";
      if (state.currentIndex >= 0) state.galleryPage = Math.floor(state.currentIndex / state.galleryPageSize) + 1;
      renderGallery();
      if (state.currentIndex >= 0) {
        updateMeta(state.items[state.currentIndex]);
        updateEmbedExample();
      }
      setStatus("保存成功");
      refs.editActionStatus.textContent = "修改已保存。";
    } catch (error) {
      refs.editActionStatus.textContent = "保存失败：" + error.message;
      setStatus("保存失败：" + error.message);
    }
  }

  async function prepareUploadFiles(event) {
    if (refs.uploadSubmitBtn.disabled) return;
    var files = Array.prototype.slice.call(event.target.files || []);
    if (!files.length) {
      return;
    }

    state.pendingUploads = files.map(function buildPendingUpload(file) {
      return {
        file: file,
        name: file.name.replace(/\.[^.]+$/, ""),
        group: refs.uploadGroupInput.value,
        description: ""
      };
    });
    refs.uploadProgress.textContent = "";
    event.target.value = "";
    renderPendingUploads();
  }

  function renderPendingUploads() {
    refs.uploadInitList.innerHTML = "";
    refs.uploadInitCount.textContent = String(state.pendingUploads.length);
    refs.uploadInitPanel.hidden = !state.pendingUploads.length;

    state.pendingUploads.forEach(function renderPendingUpload(upload, index) {
      var item = document.createElement("article");
      item.className = "upload-init-item";
      item.innerHTML =
        '<div class="upload-init-item__heading"><strong title="' + escapeHtml(upload.file.name) + '">' +
        escapeHtml(upload.file.name) +
        "</strong><span>" + window.XinTI18n.t("upload.pending") + "</span>" +
        "</div>" +
        '<label class="field"><span>' + window.XinTI18n.t("field.panoramaName") + '</span><input class="text-input" type="text" value="' + escapeHtml(upload.name) + '" data-upload-name="' + index + '" /></label>' +
        '<label class="field"><span>' + window.XinTI18n.t("field.group") + '</span><select class="text-input" data-upload-group="' + index + '"><option value="">' + window.XinTI18n.t("field.ungrouped") + '</option>' + state.galleryGroups.map(function renderGroupOption(group) { var name = typeof group === "string" ? group : String(group.name || ""); return name ? "<option value=\"" + escapeHtml(name) + "\"" + (name === upload.group ? " selected" : "") + ">" + escapeHtml(name) + "</option>" : ""; }).join("") + "</select></label>" +
        '<label class="field"><span>' + window.XinTI18n.t("field.descriptionInfo") + '</span><textarea class="text-area compact" data-upload-description="' + index + '" placeholder="' + escapeHtml(window.XinTI18n.t("placeholder.description")) + '"></textarea></label>';
      refs.uploadInitList.appendChild(item);
      var description = item.querySelector("[data-upload-description]");
      if (description) description.value = upload.description || "";
    });
  }

  function clearPendingUploads() {
    state.pendingUploads = [];
    refs.uploadInitList.innerHTML = "";
    refs.uploadInitCount.textContent = "0";
    refs.uploadInitPanel.hidden = true;
    refs.uploadProgress.textContent = "";
  }

  function collectPendingUploadValues() {
    state.pendingUploads.forEach(function collectUploadValues(upload, index) {
      var nameInput = refs.uploadInitList.querySelector('[data-upload-name="' + index + '"]');
      var groupInput = refs.uploadInitList.querySelector('[data-upload-group="' + index + '"]');
      var descriptionInput = refs.uploadInitList.querySelector('[data-upload-description="' + index + '"]');
      upload.name = nameInput && nameInput.value.trim() ? nameInput.value.trim() : upload.file.name.replace(/\.[^.]+$/, "");
      upload.group = groupInput ? groupInput.value : "";
      upload.description = descriptionInput ? descriptionInput.value.trim() : "";
    });
  }

  function applyUploadGroupToAll() {
    collectPendingUploadValues();
    var group = refs.uploadGroupInput.value;
    state.pendingUploads.forEach(function applyGroup(upload) { upload.group = group; });
    renderPendingUploads();
    refs.galleryActionStatus.textContent = "已将分组应用到全部待上传图片。";
  }

  function refreshPendingUploadsForLanguage() {
    if (!state.pendingUploads.length) return;
    var active = document.activeElement;
    var attribute = active && ["data-upload-name", "data-upload-group", "data-upload-description"].find(function findAttribute(name) { return active.hasAttribute(name); });
    var index = attribute && active.getAttribute(attribute);
    var start = active && typeof active.selectionStart === "number" ? active.selectionStart : null;
    var end = active && typeof active.selectionEnd === "number" ? active.selectionEnd : null;
    collectPendingUploadValues();
    renderPendingUploads();
    if (!attribute) return;
    var replacement = refs.uploadInitList.querySelector("[" + attribute + '=\"' + index + '\"]');
    if (replacement) {
      replacement.focus();
      if (start !== null && end !== null && replacement.setSelectionRange) replacement.setSelectionRange(start, end);
    }
  }

  async function uploadPreparedFiles() {
    if (!state.pendingUploads.length) {
      return;
    }

    collectPendingUploadValues();
    var batch = state.pendingUploads;
    refs.uploadSubmitBtn.disabled = true;
    refs.fileInput.disabled = true;
    var connectionId = state.connectionId;
    var uploadRequestId = ++state.uploadRequestId;
    var totalCount = batch.length;
    var completed = 0;
    var latestResponse = null;
    var galleryRefreshed = true;
    var uploadPath = "/api/panoramas/upload-base64?includeItems=0";
    refs.uploadCancelBtn.disabled = true;
    try {
      while (batch.length && connectionId === state.connectionId && state.pendingUploads === batch) {
        var upload = batch[0];
        var response;
        if (state.mediaStorageSettings && state.mediaStorageSettings.mode === "client") {
          var clientMediaId = createClientMediaId();
          await window.XinTClientMedia.put(clientMediaId, upload.file, getMediaFormatOptions());
          if (connectionId !== state.connectionId || state.pendingUploads !== batch) {
            window.XinTClientMedia.remove(clientMediaId);
            break;
          }
          try {
            response = await fetchJson(uploadPath, {
              method: "POST",
              body: JSON.stringify({ name: upload.name, description: upload.description, group: upload.group, clientMediaId: clientMediaId })
            });
          } catch (error) {
            window.XinTClientMedia.remove(clientMediaId);
            throw error;
          }
        } else {
          var dataUrl = await fileToDataUrl(upload.file);
          if (connectionId !== state.connectionId || state.pendingUploads !== batch) break;
          response = await fetchJson(uploadPath, {
            method: "POST",
            body: JSON.stringify({ name: upload.name, description: upload.description, group: upload.group, dataUrl: dataUrl })
          });
        }
        if (connectionId !== state.connectionId || state.pendingUploads !== batch) break;
        batch.shift();
        completed += 1;
        renderPendingUploads();
        refs.uploadProgress.textContent = "已上传 " + completed + " / " + totalCount + "，剩余 " + state.pendingUploads.length + " 张";
        latestResponse = response;
      }
      if (connectionId !== state.connectionId || state.pendingUploads !== batch) {
        if (connectionId === state.connectionId) refs.uploadProgress.textContent = "上传队列已更换，旧批次已停止。";
      } else if (state.pendingUploads.length) {
        refs.uploadProgress.textContent = "连接已切换，上传已停止；未完成的图片仍保留在列表中。";
      } else if (!state.pendingUploads.length) {
        clearPendingUploads();
      }
      if (latestResponse && connectionId === state.connectionId && state.pendingUploads === batch) {
        galleryRefreshed = await applyAddedItem(latestResponse, connectionId);
      } else if (latestResponse && connectionId === state.connectionId && !state.pendingUploads.length) {
        galleryRefreshed = await applyAddedItem(latestResponse, connectionId);
      }
      if (galleryRefreshed && connectionId === state.connectionId && !state.pendingUploads.length) setStatus("上传完成，共 " + completed + " 张");
    } catch (error) {
      if (connectionId === state.connectionId && state.pendingUploads === batch) {
        refs.uploadProgress.textContent = "上传失败：" + error.message + "。剩余 " + state.pendingUploads.length + " 张，可重试。";
        setStatus("上传失败，剩余图片已保留");
        if (latestResponse) await applyAddedItem(latestResponse, connectionId);
      }
    } finally {
      if (state.uploadRequestId === uploadRequestId) {
        refs.uploadSubmitBtn.disabled = false;
        refs.uploadCancelBtn.disabled = false;
        refs.fileInput.disabled = false;
      }
    }
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

  function createClientMediaId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    if (!window.crypto || typeof window.crypto.getRandomValues !== "function") {
      throw new Error("当前浏览器无法安全生成本地图片标识；请在 HTTPS 或 localhost 环境中使用。");
    }
    var bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    var hex = Array.prototype.map.call(bytes, function byteToHex(value) { return value.toString(16).padStart(2, "0"); }).join("");
    return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" + hex.slice(16, 20) + "-" + hex.slice(20);
  }

  function getMediaFormatOptions() {
    var settings = state.mediaStorageSettings || {};
    return { format: settings.format || "original", codec: settings.codec || "jpeg", quality: settings.quality || 85 };
  }

  async function selectScene(index) {
    cancelHotspotNavigation();
    if (index < 0 || index >= state.items.length) {
      return;
    }

    var item = state.items[index];
    var requestId = ++state.requestId;
    var connectionId = state.connectionId;
    var requestedProjectId = state.currentProjectId;
    var requestedProject = state.currentProject;
    var requestedController = state.viewerController;
    var requestedScene = arguments.length > 1 ? arguments[1] : null;
    var projectScenes = requestedProject && requestedProjectId === state.currentProjectId
      ? (requestedProject.scenes || [])
      : [];
    if (requestedScene && !projectScenes.some(function matchScene(scene) { return scene.id === requestedScene; })) {
      requestedScene = null;
    }
    if (!requestedScene && state.currentSceneId && projectScenes.some(function matchCurrent(scene) {
      return scene.id === state.currentSceneId && scene.panoramaId === item.id;
    })) requestedScene = state.currentSceneId;
    if (!requestedScene) {
      var matchingScene = projectScenes.find(function matchPanorama(scene) { return scene.panoramaId === item.id; });
      requestedScene = matchingScene ? matchingScene.id : null;
    }
    state.currentSceneId = requestedScene;
    state.currentIndex = index;
    state.viewerReady = false;
    renderProjectScenes();
    if (!state.viewerController) {
      if (!state.viewerConfigReady) {
        setViewerState("loading", "正在初始化查看器", item.name || "正在准备图片纹理", "", null, Boolean(item.name));
      } else if (state.viewerStateAction !== "engine-reload") {
        setViewerState("error", "预览引擎未启动", "请检查查看器资源后重新加载。", "重新加载", "engine-reload");
      }
      return;
    }
    renderGallery();
    updateMeta(item);
    updateEmbedExample();
    setStatus("加载中...");
    setViewerState("loading", "正在加载全景图片", item.name || "正在准备图片纹理", "", null, Boolean(item.name));
    refs.sourceText.textContent = window.XinTI18n.t("status.sourcePrefix", { source: item.sourceType || "-" });

    try {
      var imageUrl = await resolveItemImageUrl(item, false);
      if (!imageUrl) throw new Error("这张图片保存在上传时的浏览器中，当前浏览器找不到本地副本；请在此浏览器重新上传。");
      if (connectionId !== state.connectionId || requestId !== state.requestId || state.viewerController !== requestedController) return;
      var loaded = await requestedController.setPanorama(imageUrl);
      if (connectionId !== state.connectionId || requestId !== state.requestId || state.viewerController !== requestedController) {
        return;
      }
      if (loaded.stale) return;
      var currentProjectScenes = state.currentProject ? (state.currentProject.scenes || []) : [];
      var resolvedScene = requestedScene && currentProjectScenes.find(function resolveRequestedScene(scene) {
        return scene.id === requestedScene && scene.panoramaId === item.id;
      });
      if (!resolvedScene && state.currentSceneId) {
        resolvedScene = currentProjectScenes.find(function resolveCurrentScene(scene) {
          return scene.id === state.currentSceneId && scene.panoramaId === item.id;
        });
      }
      if (!resolvedScene) {
        resolvedScene = currentProjectScenes.find(function resolvePanoramaScene(scene) {
          return scene.panoramaId === item.id;
        });
      }
      state.currentSceneId = resolvedScene ? resolvedScene.id : null;
      renderProjectScenes();
      var projectScene = getCurrentProjectScene();
      if (projectScene) {
        state.viewerController.setView({
          yaw: projectScene.initialYaw === null ? 180 : projectScene.initialYaw,
          pitch: projectScene.initialPitch === null ? 0 : projectScene.initialPitch,
          fov: projectScene.initialFov === null ? 72 : projectScene.initialFov
        }, 900);
      }
      state.viewerReady = true;
      refs.resolutionText.textContent =
        loaded.originalWidth +
        " × " +
        loaded.originalHeight +
        (loaded.scaledWidth !== loaded.originalWidth || loaded.scaledHeight !== loaded.originalHeight
          ? "，纹理已压缩到 " + loaded.scaledWidth + " × " + loaded.scaledHeight
          : "");
      renderSpatialHotspots();
      setViewerState("ready", "全景图片已就绪", item.name || "", "", null, Boolean(item.name));
      setStatus("已就绪");
    } catch (error) {
      if (connectionId !== state.connectionId || requestId !== state.requestId) {
        return;
      }
      resetViewerSurface();
      state.viewerReady = false;
      setViewerState(
        "error",
        "当前场景暂时无法显示",
        "资源可能不可访问或格式不受支持。",
        "重新加载",
        "reload"
      );
      setStatus("加载失败");
    }
  }

  function resetViewerSurface() {
    cancelHotspotNavigation();
    state.viewerReady = false;
    if (state.viewerController) state.viewerController.clear();
    refs.resolutionText.textContent = "-";
    refs.sourceText.textContent = window.XinTI18n.t("status.sourcePrefix", { source: "-" });
    refs.hotspotLayer.innerHTML = "";
  }

  function renderGallery() {
    refs.galleryCount.textContent = String(state.items.length);
    refs.currentIndexText.textContent =
      state.items.length && state.currentIndex >= 0
        ? String(state.currentIndex + 1) + " / " + String(state.items.length)
        : "0 / 0";

    updateGalleryGroupOptions();
    var entries = getFilteredGalleryEntries();
    var pageCount = Math.max(1, Math.ceil(entries.length / state.galleryPageSize));
    state.galleryPage = Math.min(Math.max(1, state.galleryPage), pageCount);
    var start = (state.galleryPage - 1) * state.galleryPageSize;
    var pageEntries = entries.slice(start, start + state.galleryPageSize);
    refs.galleryList.innerHTML = "";
    refs.galleryPageStatus.textContent = entries.length
      ? window.XinTI18n.t("status.pageCount", { page: state.galleryPage, total: pageCount, count: entries.length })
      : window.XinTI18n.t("status.noMatches");
    refs.galleryPrevPage.disabled = state.galleryPage <= 1;
    refs.galleryNextPage.disabled = state.galleryPage >= pageCount;
    if (!entries.length) {
      refs.galleryList.textContent = "";
      var emptyGallery = document.createElement("div");
      emptyGallery.className = "project-empty";
      emptyGallery.textContent = window.XinTI18n.t(state.items.length ? "library.emptyFiltered" : "library.empty");
      refs.galleryList.appendChild(emptyGallery);
      renderSceneRail();
      return;
    }

    pageEntries.forEach(function eachEntry(entry) {
      var item = entry.item;
      var row = document.createElement("article");
      var select = document.createElement("button");
      var actions = document.createElement("div");
      var itemLabel = item.name || item.id;
      var edit = createIconActionButton("edit", "编辑全景图：" + itemLabel, false, "a11y.editPanorama", itemLabel);
      var remove = createIconActionButton("delete", "删除全景图：" + itemLabel, true, "a11y.deletePanorama", itemLabel);
      var selected = state.currentIndex === entry.index;
      row.className = "gallery-row" + (selected ? " is-active" : "");
      select.type = "button";
      select.className = "gallery-item";
      select.setAttribute("aria-pressed", selected ? "true" : "false");
      var thumbWrap = document.createElement("span");
      var image = document.createElement("img");
      var copy = document.createElement("span");
      var title = document.createElement("strong");
      var detail = document.createElement("span");
      title.textContent = "#" + item.panoramaNo + " " + (item.name || window.XinTI18n.t("library.unnamed"));
      detail.textContent = (item.group ? window.XinTI18n.t("library.groupPrefix") + item.group : window.XinTI18n.t("field.ungrouped")) + " · " + (item.sourceType || "-");
      thumbWrap.className = "gallery-item__thumb";
      image.loading = "lazy";
      image.alt = "";
      setItemThumbnail(image, item);
      thumbWrap.appendChild(image);
      copy.className = "gallery-item__copy";
      copy.append(title, detail);
      select.append(thumbWrap, copy);
      select.addEventListener("click", function onSelect() { selectScene(entry.index); });
      actions.className = "gallery-row__actions";
      edit.addEventListener("click", function onEdit(event) {
        event.stopPropagation();
        selectScene(entry.index);
        openDrawer("editor");
      });
      remove.addEventListener("click", function onDelete(event) {
        event.stopPropagation();
        deletePanorama(item, entry.index);
      });
      actions.append(edit, remove);
      row.append(select, actions);
      refs.galleryList.appendChild(row);
    });
    renderSceneRail();
  }

  function updateGalleryGroupOptions() {
    var selected = state.galleryGroup;
    var groups = state.galleryGroups.map(function getGroupName(group) { return typeof group === "string" ? group : String(group.name || ""); }).filter(Boolean);
    refs.galleryGroupFilter.innerHTML = "";
    var allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent = window.XinTI18n.t("library.allGroups");
    refs.galleryGroupFilter.appendChild(allOption);
    groups.forEach(function addGroup(group) {
      var option = document.createElement("option");
      option.value = "group:" + group;
      option.textContent = group;
      refs.galleryGroupFilter.appendChild(option);
    });
    if (state.items.some(function hasUngrouped(item) { return !String(item.group || "").trim(); })) {
      var ungroupedOption = document.createElement("option");
      ungroupedOption.value = "ungrouped";
      ungroupedOption.textContent = window.XinTI18n.t("field.ungrouped");
      refs.galleryGroupFilter.appendChild(ungroupedOption);
    }
    if (selected !== null && selected !== "" && groups.indexOf(selected) === -1) selected = null;
    state.galleryGroup = selected;
    refs.galleryGroupFilter.value = selected === null ? "" : selected === "" ? "ungrouped" : "group:" + selected;
  }

  function renderGalleryGroupSelects() {
    [refs.uploadGroupInput, refs.remoteGroupInput, refs.databaseGroupInput, refs.editGroupInput].forEach(function fillGroupSelect(select) {
      if (!select) return;
      var previous = select.value;
      select.innerHTML = "";
      var empty = document.createElement("option");
      empty.value = "";
      empty.textContent = window.XinTI18n.t("field.ungrouped");
      select.appendChild(empty);
      state.galleryGroups.forEach(function appendGroup(group) {
        var name = typeof group === "string" ? group : String(group.name || "");
        if (!name) return;
        var option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
      });
      select.value = Array.prototype.some.call(select.options, function hasValue(option) { return option.value === previous; }) ? previous : "";
    });
  }

  function getFilteredGalleryEntries() {
    return state.items.map(function mapItem(item, index) { return { item: item, index: index }; })
      .filter(function filterEntry(entry) {
        var group = String(entry.item.group || "").trim();
        if (state.galleryGroup !== null && group !== state.galleryGroup) return false;
        if (!state.gallerySearch) return true;
        return (String(entry.item.name || "") + " " + String(entry.item.panoramaNo || ""))
          .toLocaleLowerCase().indexOf(state.gallerySearch) !== -1;
      });
  }

  function isClientUpload(item) {
    return Boolean(item && (item.sourceType === "client-upload" || item.viewerPath && item.viewerPath.indexOf("/media/client/") === 0));
  }

  function getClientMediaId(item) {
    if (item && item.clientMediaId) return String(item.clientMediaId);
    var match = item && String(item.viewerPath || "").match(/^\/media\/client\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : "";
  }

  async function resolveItemImageUrl(item, thumbnail) {
    if (isClientUpload(item)) {
      var mediaId = getClientMediaId(item);
      if (!mediaId || !window.XinTClientMedia) return null;
      return await window.XinTClientMedia.getUrl(mediaId);
    }
    return thumbnail ? (item.thumbnailUrl || item.thumbnailPath || item.viewerUrl || item.viewerPath) : (item.viewerUrl || item.viewerPath);
  }

  function setItemThumbnail(image, item) {
    if (!isClientUpload(item)) {
      image.src = item.thumbnailUrl || item.thumbnailPath || item.viewerUrl || item.viewerPath || "";
      return;
    }
    resolveItemImageUrl(item, true).then(function useClientThumbnail(url) {
      if (url && image.isConnected) image.src = url;
    }).catch(function ignoreUnavailableClientThumbnail() {});
  }

  function renderProjects() {
    refs.projectCount.textContent = String(state.projects.length);
    refs.projectList.innerHTML = "";
    if (!state.projects.length) {
      refs.projectList.textContent = "";
      var emptyProjects = document.createElement("div");
      emptyProjects.className = "project-empty";
      emptyProjects.textContent = window.XinTI18n.t("projects.empty");
      refs.projectList.appendChild(emptyProjects);
      return;
    }

    state.projects.forEach(function eachProject(project) {
      var row = document.createElement("article");
      var select = document.createElement("button");
      var edit = createIconActionButton("edit", "重命名项目：" + project.name, false, "a11y.renameProject", project.name);
      var remove = createIconActionButton("delete", "删除项目：" + project.name, true, "a11y.deleteProject", project.name);
      var selected = project.id === state.currentProjectId;
      row.className = "project-row" + (selected ? " is-active" : "");
      select.type = "button";
      select.className = "project-item";
      select.setAttribute("aria-pressed", selected ? "true" : "false");
      var title = document.createElement("strong");
      var detail = document.createElement("span");
      title.textContent = project.name;
      detail.textContent = project.description || window.XinTI18n.t("projects.workspace");
      select.append(title, detail);
      select.addEventListener("click", function onProjectClick() { selectProject(project.id); });
      edit.addEventListener("click", function onRenameProject(event) { event.stopPropagation(); openRenameDialog("project", project); });
      remove.addEventListener("click", function onDeleteProject(event) { event.stopPropagation(); deleteProject(project); });
      var actions = document.createElement("div");
      actions.className = "gallery-row__actions";
      actions.append(edit, remove);
      row.append(select, actions);
      refs.projectList.appendChild(row);
    });
  }

  function renderProjectScenes() {
    refs.projectSceneList.innerHTML = "";
    if (!state.currentProject) {
      refs.projectSceneList.textContent = "";
      var noProject = document.createElement("div");
      noProject.className = "project-empty";
      noProject.textContent = window.XinTI18n.t("projects.unselected");
      refs.projectSceneList.appendChild(noProject);
      return;
    }

    var scenes = state.currentProject.scenes || [];
    if (!scenes.length) {
      refs.projectSceneList.textContent = "";
      var noScenes = document.createElement("div");
      noScenes.className = "project-empty";
      noScenes.textContent = window.XinTI18n.t("projects.emptyScenes");
      refs.projectSceneList.appendChild(noScenes);
      return;
    }

    scenes.forEach(function eachProjectScene(scene) {
      var row = document.createElement("article");
      var select = document.createElement("button");
      var edit = createIconActionButton("edit", "重命名场景：" + scene.name, false, "a11y.renameScene", scene.name);
      var remove = createIconActionButton("delete", "删除项目场景：" + scene.name, true, "a11y.deleteScene", scene.name);
      var selected = scene.id === state.currentSceneId;
      row.className = "project-scene-row" + (selected ? " is-active" : "");
      select.type = "button";
      select.className = "project-scene-item";
      select.setAttribute("aria-pressed", selected ? "true" : "false");
      var title = document.createElement("strong");
      var detail = document.createElement("span");
      title.textContent = scene.name;
      detail.textContent = scene.panoramaId || window.XinTI18n.t("projects.unlinkedPanorama");
      select.append(title, detail);
      select.addEventListener("click", function onSceneClick() {
        var index = state.items.findIndex(function findPanorama(item) {
          return item.id === scene.panoramaId;
        });
        if (index >= 0) {
          selectScene(index, scene.id);
        } else {
          setStatus("该场景关联的全景图已不存在");
        }
      });
      edit.addEventListener("click", function onRenameScene(event) { event.stopPropagation(); openRenameDialog("scene", scene); });
      remove.dataset.sceneDelete = scene.id;
      remove.addEventListener("click", function onDeleteScene(event) { event.stopPropagation(); deleteProjectScene(scene); });
      var actions = document.createElement("div");
      actions.className = "gallery-row__actions";
      remove.disabled = Boolean(projectSceneActions && projectSceneActions.isBusyForCurrentProject());
      actions.append(edit, remove);
      row.append(select, actions);
      refs.projectSceneList.appendChild(row);
    });
  }

  function updateMeta(item) {
    refs.currentSceneTitle.textContent = item ? item.name || window.XinTI18n.t("library.unnamed") : window.XinTI18n.t("scene.unselected");
    refs.metaId.textContent = item ? item.id : "-";
    refs.metaPanoramaNo.textContent = item && item.panoramaNo ? String(item.panoramaNo) : "-";
    refs.metaName.textContent = item ? item.name : "-";
    refs.metaSource.textContent = item ? item.sourceType || "-" : "-";
    refs.metaGroup.textContent = item && item.group ? item.group : window.XinTI18n.t("field.ungrouped");
    refs.metaSize.textContent = item && item.size ? formatBytes(item.size) : "-";
    refs.metaCreatedAt.textContent = item && item.createdAt ? formatDateTime(item.createdAt) : "-";
    refs.metaDescription.textContent = item && item.description ? item.description : "-";
    refs.editPanoramaNoInput.value = item && item.panoramaNo ? String(item.panoramaNo) : "";
    refs.editNameInput.value = item ? item.name || "" : "";
    refs.editGroupInput.value = item ? item.group || "" : "";
    refs.editDescriptionInput.value = item ? item.description || "" : "";
  }

  function updateEmbedExample() {
    var currentItem = state.currentIndex >= 0 ? state.items[state.currentIndex] : null;
    var result;
    try {
      result = window.XinTEmbedCode.generate({
        apiBase: state.apiBase,
        item: currentItem,
        clientOnly: isClientUpload(currentItem),
        language: window.XinTI18n.getLanguage(),
        controls: window.XinTEmbedPresets.controlsFor(state.embedPreset)
      });
    } catch (_) {
      result = { available: false, message: "服务地址无效，请检查系统设置。" };
    }
    var available = Boolean(result.available);
    refs.embedIframeCode.textContent = available ? result.iframe : "";
    refs.embedScriptCode.textContent = available ? result.script : "";
    refs.embedCodeBlocks.forEach(function updateCodeBlock(block) { block.hidden = !available; });
    refs.embedCopyButtons.forEach(function updateCopyButton(button) {
      setEmbedCopyButtonState(button, false);
      button.disabled = !available || embedCopyInFlight.has(button);
    });
    refs.embedCodeFeedback.iframe.textContent = available ? "" : window.XinTI18n.translateMessage(result.message);
    refs.embedCodeFeedback.script.textContent = available ? "" : window.XinTI18n.translateMessage(result.message);
    refs.embedCodeFeedback.iframe.classList.remove("sr-only");
    refs.embedCodeFeedback.script.classList.remove("sr-only");
  }

  function setEmbedCopyButtonState(button, copied) {
    var timer = embedCopyResetTimers.get(button);
    if (timer) clearTimeout(timer);
    embedCopyResetTimers.delete(button);
    var use = button.querySelector("svg use");
    var label = button.querySelector("[data-copy-label]");
    var success = copied === true;
    if (use) use.setAttribute("href", "./icons/sprite.svg#" + (success ? "check" : "copy"));
    if (label) label.textContent = window.XinTI18n.t(success ? "embed.copied" : "embed.copy");
    button.setAttribute("data-copy-state", success ? "success" : "idle");
    button.classList.toggle("is-copied", success);
    if (success) embedCopyResetTimers.set(button, setTimeout(function resetCopyButton() { setEmbedCopyButtonState(button, false); }, 2600));
  }

  async function copyEmbedCode(kind) {
    var code = kind === "iframe" ? refs.embedIframeCode : refs.embedScriptCode;
    var feedback = refs.embedCodeFeedback[kind];
    var button = refs.embedCopyButtons.find(function findCopyButton(candidate) { return candidate.getAttribute("data-copy-embed") === kind; });
    var block = code.closest("pre");
    var copiedText = code.textContent;
    if (!copiedText || !button || button.disabled || embedCopyInFlight.has(button)) return;
    embedCopyInFlight.add(button);
    button.disabled = true;
    feedback.classList.remove("sr-only");
    try {
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(copiedText);
      if (code.textContent === copiedText) {
        setEmbedCopyButtonState(button, true);
        feedback.textContent = window.XinTI18n.t("status.copySuccess");
        feedback.classList.add("sr-only");
      }
    } catch (_) {
      if (code.textContent !== copiedText) return;
      setEmbedCopyButtonState(button, false);
      block.focus();
      try {
        var selection = window.getSelection && window.getSelection();
        if (selection && document.createRange) {
          var range = document.createRange();
          range.selectNodeContents(code);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      } catch (_) {
        // Keep focus on the code block as a manual copy fallback.
      }
      feedback.textContent = window.XinTI18n.t("status.copyManual");
    } finally {
      embedCopyInFlight.delete(button);
      button.disabled = !code.textContent;
    }
  }

  async function applyEmbedPreset(preset) {
    if (state.pendingEmbedPreset || ["all", "compact", "none"].indexOf(preset) === -1 || preset === state.embedPreset) return;
    state.pendingEmbedPreset = true;
    refs.embedPresetStatus.textContent = "";
    updateEmbedPresetButtons();
    try {
      await patchConsoleSettings({ embedPreset: preset });
      state.embedPreset = preset;
      updateEmbedExample();
    } catch (_) {
      refs.embedPresetStatus.textContent = window.XinTI18n.t("settings.embedSaveFailed");
    } finally {
      state.pendingEmbedPreset = false;
      updateEmbedPresetButtons();
    }
  }

  function updateEmbedPresetButtons() {
    refs.embedPresetButtons.forEach(function updateEmbedPreset(button) {
      var selected = button.getAttribute("data-embed-preset") === state.embedPreset;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
      button.disabled = state.pendingEmbedPreset;
    });
  }

  function moveSelection(delta) {
    if (!state.items.length) {
      return;
    }

    var nextIndex = (state.currentIndex + delta + state.items.length) % state.items.length;
    selectScene(nextIndex);
  }

  function toggleDirectorMode() {
    if (!state.viewerReady || !state.viewerController) return;
    if (state.directorMode) {
      stopDirectorMode();
      return;
    }
    var view = state.viewerController.getView();
    var hotspots = getCurrentSceneHotspots();
    var frames = hotspots.slice(0, 4).map(function hotspotFrame(hotspot, index) {
      return {
        yaw: hotspot.yaw,
        pitch: hotspot.pitch,
        fov: 48,
        duration: 2500,
        hold: 900,
        label: hotspot.title || "热点 " + String(index + 1)
      };
    });

    if (!frames.length) {
      frames = [
        { yaw: view.yaw, pitch: view.pitch, fov: 68, duration: 1200, hold: 500, label: "起始视角" },
        { yaw: view.yaw + 70, pitch: 7, fov: 54, duration: 3200, hold: 700, label: "空间细节" },
        { yaw: view.yaw + 160, pitch: -4, fov: 64, duration: 3800, hold: 700, label: "纵深观察" },
        { yaw: view.yaw + 265, pitch: 10, fov: 50, duration: 3600, hold: 650, label: "重点回看" }
      ];
    }

    state.viewerController.setAutorotate(false);
    state.autorotate = false;
    updateAutorotateButton();
    state.directorMode = state.viewerController.playDirector(frames, { loop: true });
    updateDirectorButton();
  }

  function stopDirectorMode() {
    state.directorMode = false;
    if (state.viewerController) state.viewerController.stopDirector();
    updateDirectorButton();
  }

  function updateDirectorButton() {
    var label = window.XinTI18n.t(state.directorMode ? "widget.stopDirector" : "control.director");
    refs.directorBtn.classList.toggle("active", state.directorMode);
    setAttributeIfChanged(refs.directorBtn, "aria-pressed", state.directorMode ? "true" : "false");
    setAttributeIfChanged(refs.directorBtn, "aria-label", label);
    if (refs.directorBtn.title !== label) refs.directorBtn.title = label;
    setAttributeIfChanged(refs.directorBtn.querySelector("use"), "href", "./icons/sprite.svg#" + (state.directorMode ? "pause" : "play"));
  }

  function updateViewerTelemetry(view) {
    if (!state.viewerController) return;
    state.autorotate = state.viewerController.getAutorotate();
    updateAutorotateButton();
    updateHotspotPositions(view);

    if (state.directorMode && !state.viewerController.isDirectorPlaying()) {
      stopDirectorMode();
    }
  }

  function renderSceneRail() {
    // Scene navigation stays in the library and project panels.
  }

  function getCurrentProjectScene() {
    if (!state.currentProject || !state.currentSceneId || state.currentIndex < 0) {
      return null;
    }
    var currentItem = state.items[state.currentIndex];
    return (state.currentProject.scenes || []).find(function findScene(scene) {
      return scene.id === state.currentSceneId && scene.panoramaId === currentItem.id;
    }) || null;
  }

  function getCurrentSceneHotspots() {
    var currentScene = getCurrentProjectScene();
    if (!currentScene || !state.currentProject) {
      return [];
    }
    return (state.currentProject.hotspots || []).filter(function filterHotspot(hotspot) {
      return hotspot.sceneId === currentScene.id;
    });
  }

  function renderSpatialHotspots() {
    refs.hotspotLayer.innerHTML = "";
    if (refs.hotspotLayer.hidden) {
      return;
    }
    var hotspots = getCurrentSceneHotspots();
    hotspots.forEach(function renderHotspot(hotspot, index) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "spatial-hotspot";
      button.dataset.hotspotId = hotspot.id;
      button.dataset.yaw = String(hotspot.yaw || 0);
      button.dataset.pitch = String(hotspot.pitch || 0);
      button.innerHTML =
        '<span class="spatial-hotspot__marker"><i></i><b>' +
        String(index + 1).padStart(2, "0") +
        '</b></span><span class="spatial-hotspot__label"><strong>' +
        escapeHtml(hotspot.title || (hotspot.type === "scene" ? "进入场景" : "空间信息")) +
        "</strong><small>" +
        escapeHtml(hotspot.description || getHotspotTypeLabel(hotspot.type)) +
        "</small></span>";
      button.addEventListener("click", function onHotspotClick() {
        activateHotspot(hotspot);
      });
      refs.hotspotLayer.appendChild(button);
    });
    updateHotspotPositions(state.viewerController.getView());
  }

  function updateHotspotPositions(view) {
    if (!state.viewerReady || !state.viewerController) return;
    Array.prototype.forEach.call(refs.hotspotLayer.children, function positionHotspot(element) {
      var yaw = Number(element.dataset.yaw) || 0;
      var pitch = Number(element.dataset.pitch) || 0;
      var projected = state.viewerController.project(yaw, pitch);
      var hidden = !projected.visible;
      if (element.hidden !== hidden) element.hidden = hidden;
      if (!projected.visible) return;
      var x = Math.round(projected.x - 15);
      var y = Math.round(projected.y - 15);
      if (element.__xintHotspotX !== x || element.__xintHotspotY !== y) {
        element.__xintHotspotX = x;
        element.__xintHotspotY = y;
        element.style.transform = "translate3d(" + x + "px, " + y + "px, 0)";
      }
    });
  }

  function activateHotspot(hotspot) {
    cancelHotspotNavigation();
    var navigationId = ++state.hotspotNavigationId;
    var connectionId = state.connectionId;
    var projectId = state.currentProjectId;
    var sceneId = state.currentSceneId;
    var controller = state.viewerController;
    if (!controller) return;
    controller.setView({ yaw: hotspot.yaw, pitch: hotspot.pitch, fov: 46 }, 700);
    if (hotspot.type === "scene" && hotspot.targetSceneId && state.currentProject) {
      var targetScene = (state.currentProject.scenes || []).find(function findTarget(scene) {
        return scene.id === hotspot.targetSceneId;
      });
      if (targetScene) {
        var targetIndex = state.items.findIndex(function findTargetItem(item) {
          return item.id === targetScene.panoramaId;
        });
        if (targetIndex >= 0) {
          state.hotspotNavigationTimer = window.setTimeout(function moveToTargetScene() {
            state.hotspotNavigationTimer = 0;
            if (navigationId !== state.hotspotNavigationId || connectionId !== state.connectionId || projectId !== state.currentProjectId || sceneId !== state.currentSceneId || controller !== state.viewerController) return;
            selectScene(targetIndex, targetScene.id);
          }, 420);
        }
      }
    } else if (hotspot.targetUrl) {
      window.open(hotspot.targetUrl, "_blank", "noopener,noreferrer");
    }
  }

  function cancelHotspotNavigation() {
    state.hotspotNavigationId += 1;
    if (state.hotspotNavigationTimer) window.clearTimeout(state.hotspotNavigationTimer);
    state.hotspotNavigationTimer = 0;
  }

  function getHotspotTypeLabel(type) {
    if (type === "scene") {
      return "场景导航";
    }
    if (type === "link") {
      return "外部资料";
    }
    return "空间注释";
  }

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        if (document.fullscreenEnabled === false || !document.documentElement.requestFullscreen) throw new Error("当前浏览器不支持全屏预览");
        await document.documentElement.requestFullscreen();
      } else {
        if (!document.exitFullscreen) throw new Error("当前浏览器不支持退出全屏");
        await document.exitFullscreen();
      }
    } catch (error) {
      setStatus(error && error.message || "全屏操作失败");
    }
  }

  function updateFullscreenButton() {
    var active = Boolean(document.fullscreenElement);
    refs.fullscreenBtn.setAttribute("aria-pressed", active ? "true" : "false");
    var label = window.XinTI18n.t(active ? "widget.exitFullscreen" : "control.fullscreen");
    refs.fullscreenBtn.setAttribute("aria-label", label);
    refs.fullscreenBtn.title = label;
    refs.fullscreenBtn.querySelector("use").setAttribute("href", "./icons/sprite.svg#" + (active ? "exit-fullscreen" : "fullscreen"));
  }

  async function fetchJson(pathname, options) {
    var response = await fetch(state.apiBase + pathname, Object.assign({
      headers: {
        "Content-Type": "application/json"
      }
    }, options || {}));

    if (!response.ok) {
      var errorPayload = await response.json().catch(function ignoreInvalidJson() {
        return null;
      });
      var error = new Error(errorPayload && errorPayload.message ? errorPayload.message : "请求失败");
      error.payload = errorPayload;
      error.status = response.status;
      throw error;
    }

    return response.json();
  }

  function setStatus(text) {
    refs.statusBadge.textContent = window.XinTI18n.translateMessage(text);
  }

  function setViewerState(kind, title, detail, actionLabel, actionName, detailIsUserData) {
    refs.viewerState.className = "viewer-state is-" + kind;
    refs.viewerState.setAttribute("role", kind === "error" ? "alert" : "status");
    refs.viewerStateTitle.textContent = window.XinTI18n.translateMessage(title);
    state.viewerStateDetailIsUserData = Boolean(detailIsUserData);
    refs.viewerStateDetail.textContent = state.viewerStateDetailIsUserData ? (detail || "") : window.XinTI18n.translateMessage(detail || "");
    refs.viewer.setAttribute("aria-busy", kind === "loading" ? "true" : "false");
    state.viewerStateAction = actionName || null;
    refs.viewerStateAction.hidden = !actionLabel;
    refs.viewerStateAction.textContent = window.XinTI18n.translateMessage(actionLabel || "");
  }

  function handleViewerContextState(contextState) {
    if (contextState === "lost") {
      setViewerState(
        "error",
        "图形加速暂时中断",
        "系统正在等待浏览器恢复 WebGL 上下文。",
        "重新加载",
        "reload"
      );
      setStatus("查看器渲染中断");
      return;
    }
    if (state.currentIndex >= 0) {
      selectScene(state.currentIndex);
    }
  }

  function handleViewerStateAction() {
    if (state.viewerStateAction === "library") {
      openDrawer("library");
      return;
    }
    if (state.viewerStateAction === "reload") {
      loadGallery();
      return;
    }
    if (state.viewerStateAction === "engine-reload") retryViewerEngine();
  }

  async function retryViewerEngine() {
    var connectionId = state.connectionId;
    var engine = state.pendingViewerEngine || state.viewerEngine;
    var ready = state.viewerController && state.viewerEngine !== engine
      ? await switchViewerEngine(engine, connectionId)
      : await ensureViewerInitialized(engine, connectionId);
    if (connectionId !== state.connectionId || !ready) return;
    if (state.currentIndex >= 0 && state.currentIndex < state.items.length) selectScene(state.currentIndex);
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

  function formatDateTime(value) {
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value || "-");
    }

    var locale = window.XinTI18n ? window.XinTI18n.getLanguage() : "zh-CN";
    var parts = new Intl.DateTimeFormat(locale === "en" ? "en-CA" : locale, {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).formatToParts(date).reduce(function collectDateParts(result, part) {
      result[part.type] = part.value;
      return result;
    }, {});

    return parts.year + "-" + parts.month + "-" + parts.day + " " +
      parts.hour + ":" + parts.minute + ":" + parts.second;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  window.addEventListener("xint-language-change", function redrawLocalizedUi() {
    window.XinTI18n.apply(document);
    window.XinTI18n.applyMessages(document);
    refreshPendingUploadsForLanguage();
    renderGallery();
    renderGalleryGroupSelects();
    renderProjects();
    renderProjectScenes();
    renderProjectPluginState();
    updateAutorotateButton();
    updateDirectorButton();
    updateFullscreenButton();
    updateEmbedExample();
    if (state.currentIndex < 0) refs.currentSceneTitle.textContent = window.XinTI18n.t("scene.unselected");
    if (state.currentIndex >= 0) {
      var selected = state.items[state.currentIndex];
      if (selected) {
        refs.metaGroup.textContent = selected.group || window.XinTI18n.t("field.ungrouped");
        refs.sourceText.textContent = window.XinTI18n.t("status.sourcePrefix", { source: selected.sourceType || "-" });
      }
    } else {
      refs.sourceText.textContent = window.XinTI18n.t("status.sourcePrefix", { source: "-" });
    }
    [refs.statusBadge, refs.viewerStateTitle, refs.viewerStateAction,
      refs.settingsStatus, refs.viewerEngineStatus, refs.mediaStorageStatus, refs.mediaStorageHelp,
      refs.mediaStorageModeHelp, refs.sourceAvailability, refs.uploadProgress, refs.remoteFormStatus,
      refs.databaseFormStatus, refs.galleryActionStatus, refs.projectActionStatus, refs.sceneActionStatus,
      refs.editActionStatus, refs.renameStatus].forEach(function translateVisibleMessage(element) {
      if (element) element.textContent = window.XinTI18n.translateMessage(element.textContent);
    });
    if (!state.viewerStateDetailIsUserData) refs.viewerStateDetail.textContent = window.XinTI18n.translateMessage(refs.viewerStateDetail.textContent);
    if (state.activeDrawerPanel) {
      openDrawer(state.activeDrawerPanel);
    }
  });
})();
