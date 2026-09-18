(function projectSceneActions() {
  function create(options) {
    const state = options.state;
    const request = options.request;
    const lockedProjects = new Set();
    const timeoutMs = options.timeoutMs || 15000;

    function isCurrent(connectionId, projectId, requestId) {
      return connectionId === state.connectionId &&
        projectId === state.currentProjectId &&
        requestId === state.projectRequestId;
    }

    function isBusyForCurrentProject() {
      return lockedProjects.has(state.connectionId + ":" + state.currentProjectId);
    }

    async function requestWithTimeout(path, requestOptions) {
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
      try {
        return await request(path, Object.assign({}, requestOptions || {}, { signal: controller.signal }));
      } catch (error) {
        if (timedOut) throw new Error("请求超时，请稍后重试。");
        throw error;
      } finally {
        clearTimeout(timer);
      }
    }

    function removeSceneFromPackage(projectPackage, sceneId) {
      projectPackage.scenes = (projectPackage.scenes || []).filter((scene) => scene.id !== sceneId);
      projectPackage.hotspots = (projectPackage.hotspots || []).filter((hotspot) =>
        hotspot.sceneId !== sceneId && !(hotspot.type === "scene" && hotspot.targetSceneId === sceneId)
      );
    }

    async function deleteScene(scene) {
      const projectPackage = state.currentProject;
      const projectId = state.currentProjectId;
      const connectionId = state.connectionId;
      const projectRequestId = state.projectRequestId;
      if (!projectPackage || !projectId || !scene || !scene.id) return false;
      const lockKey = connectionId + ":" + projectId;
      if (lockedProjects.has(lockKey)) return false;
      if (!options.confirm("删除场景“" + scene.name + "”及其热点？项目和图库中的全景资源会保留。")) return false;

      lockedProjects.add(lockKey);
      options.setProjectDeleteButtonsDisabled(true);
      options.setSceneStatus("正在删除场景…");
      let alreadyMissing = false;
      try {
        try {
          await requestWithTimeout("/api/scenes/" + encodeURIComponent(scene.id), { method: "DELETE" });
        } catch (error) {
          if (error.status === 404) alreadyMissing = true;
          else throw error;
        }
        if (!isCurrent(connectionId, projectId, projectRequestId)) return false;

        const wasCurrentScene = scene.id === state.currentSceneId;
        removeSceneFromPackage(projectPackage, scene.id);
        if (wasCurrentScene) {
          state.currentSceneId = null;
          state.activeHotspotId = null;
        }
        options.renderProjects();
        options.renderProjectScenes();
        options.renderSpatialHotspots();

        const refreshResults = await Promise.allSettled([
          requestWithTimeout("/api/projects/" + encodeURIComponent(projectId), {}),
          requestWithTimeout("/api/projects?limit=100", {})
        ]);
        if (!isCurrent(connectionId, projectId, projectRequestId)) return false;

        const refreshErrors = [];
        if (refreshResults[0].status === "fulfilled" && refreshResults[0].value.project) {
          removeSceneFromPackage(refreshResults[0].value.project, scene.id);
          state.currentProject = refreshResults[0].value.project;
        } else {
          refreshErrors.push(refreshResults[0].status === "rejected" ? refreshResults[0].reason : new Error("项目数据格式无效"));
        }
        if (refreshResults[1].status === "fulfilled" && Array.isArray(refreshResults[1].value.items)) {
          state.projects = refreshResults[1].value.items;
        } else {
          refreshErrors.push(refreshResults[1].status === "rejected" ? refreshResults[1].reason : new Error("项目列表格式无效"));
        }
        options.renderProjects();
        options.renderProjectScenes();
        options.renderSpatialHotspots();

        if (refreshErrors.length) {
          const detail = refreshErrors.map((error) => error && error.message || "请求失败").join("；");
          options.setSceneStatus("场景已删除，但项目刷新失败：" + detail);
          options.setStatus("场景已删除");
        } else if (alreadyMissing) {
          options.setSceneStatus("场景已不存在，项目列表已同步。");
          options.setStatus("项目场景已同步");
        } else {
          options.setSceneStatus("场景及关联热点已删除。");
          options.setStatus("项目场景已删除");
        }
        return true;
      } catch (error) {
        if (isCurrent(connectionId, projectId, projectRequestId)) {
          options.setSceneStatus("删除场景失败：" + error.message);
        }
        return false;
      } finally {
        lockedProjects.delete(lockKey);
        if (connectionId === state.connectionId && projectId === state.currentProjectId) {
          options.setProjectDeleteButtonsDisabled(isBusyForCurrentProject());
        }
      }
    }

    return { deleteScene: deleteScene, isBusyForCurrentProject: isBusyForCurrentProject };
  }

  window.XinTProjectSceneActions = { create: create };
})();
