(function toolbarSettings(global) {
  "use strict";

  const controls = {
    previous: ["上一张", "control.previous"], next: ["下一张", "control.next"], "zoom-out": ["缩小", "control.zoomOut"], "zoom-in": ["放大", "control.zoomIn"],
    autorotate: ["自动旋转", "control.autorotate"], director: ["自动演示", "control.director"], reset: ["重置视角", "control.reset"], fullscreen: ["全屏", "control.fullscreen"]
  };
  let hidden = [];
  let saveSettings = null;
  let configured = false;
  let busy = false;

  function apply(nextHidden) {
    const hiddenSet = new Set(nextHidden);
    document.querySelectorAll("[data-toolbar-control]").forEach((element) => {
      element.classList.toggle("toolbar-control-hidden", hiddenSet.has(element.dataset.toolbarControl));
    });
  }

  function configure(options) {
    if (!options || !Array.isArray(options.toolbarHidden) || typeof options.save !== "function") throw new TypeError("Toolbar settings require server state and an async save callback");
    hidden = options.toolbarHidden.slice();
    saveSettings = options.save;
    apply(hidden);
    if (configured) return;
    configured = true;
    bindDialog();
  }

  function bindDialog() {
    const trigger = document.getElementById("customizeToolbarBtn");
    if (!trigger) return;
    const dialog = document.createElement("dialog");
    dialog.className = "toolbar-settings-dialog";
    dialog.setAttribute("aria-labelledby", "toolbarSettingsTitle");
    dialog.innerHTML = '<form>' +
      '<h2 id="toolbarSettingsTitle" data-i18n="toolbar.title">显示的查看工具</h2>' +
      '<p data-i18n="toolbar.description">选择要在主预览器中显示的工具。</p>' +
      '<div class="toolbar-settings-options"></div>' +
      '<p class="toolbar-settings-status" role="status" aria-live="polite"></p>' +
      '<div class="toolbar-settings-actions">' +
      '<button type="button" class="outlined-button" data-reset data-i18n="toolbar.reset">恢复默认</button>' +
      '<button type="button" class="outlined-button" data-cancel data-i18n="common.cancel">取消</button>' +
      '<button type="submit" class="primary-button" data-save data-i18n="common.save">保存</button></div></form>';
    const options = dialog.querySelector(".toolbar-settings-options");
    const inputs = Object.entries(controls).map(([key, definition]) => {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = key;
      const label = document.createElement("label");
      const text = document.createElement("span");
      text.setAttribute("data-i18n", definition[1]);
      text.textContent = definition[0];
      label.append(input, text);
      options.append(label);
      return input;
    });
    const form = dialog.querySelector("form");
    const status = dialog.querySelector(".toolbar-settings-status");
    (document.querySelector(".viewer-panel") || document.body).append(dialog);
    if (global.XinTI18n) global.XinTI18n.apply(dialog);
    global.addEventListener("xint-language-change", () => { if (global.XinTI18n) global.XinTI18n.apply(dialog); });
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.addEventListener("click", () => {
      inputs.forEach((input) => { input.checked = !hidden.includes(input.value); });
      status.textContent = "";
      dialog.showModal();
    });
    dialog.querySelector("[data-cancel]").addEventListener("click", () => { if (!busy) dialog.close("cancel"); });
    dialog.querySelector("[data-reset]").addEventListener("click", async () => {
      inputs.forEach((input) => { input.checked = true; });
      await save(inputs, [], dialog, status);
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const next = inputs.filter((input) => !input.checked).map((input) => input.value);
      await save(inputs, next, dialog, status);
    });
  }

  async function save(inputs, next, dialog, status) {
    if (busy || !saveSettings) return;
    busy = true;
    inputs.forEach((input) => { input.disabled = true; });
    dialog.querySelectorAll("button").forEach((button) => { button.disabled = true; });
    status.textContent = global.XinTI18n ? global.XinTI18n.t("toolbar.saving") : "正在保存…";
    try {
      const saved = await saveSettings(next.slice());
      hidden = Array.isArray(saved) ? saved.slice() : next.slice();
      apply(hidden);
      status.textContent = "";
      dialog.close("saved");
    } catch (_) {
      status.textContent = global.XinTI18n ? global.XinTI18n.t("toolbar.saveError") : "保存失败，请重试。";
    } finally {
      inputs.forEach((input) => { input.disabled = false; });
      dialog.querySelectorAll("button").forEach((button) => { button.disabled = false; });
      busy = false;
    }
  }

  global.XinTToolbarSettings = { configure: configure, getHidden: () => hidden.slice() };
})(window);
