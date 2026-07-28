(function toolbarSettings() {
  const controls = {
    previous: "上一张", next: "下一张", "zoom-out": "缩小", "zoom-in": "放大",
    autorotate: "自动旋转", director: "自动演示", reset: "重置视角", fullscreen: "全屏"
  };
  const cookieName = "xint_viewer_controls";

  function readHidden() {
    const cookie = document.cookie.split(";").map((part) => part.trim())
      .find((part) => part.startsWith(cookieName + "="));
    try {
      return new Set(cookie ? decodeURIComponent(cookie.slice(cookieName.length + 1)).split(",") : []);
    } catch (_) {
      return new Set();
    }
  }

  function apply(hidden) {
    document.querySelectorAll("[data-toolbar-control]").forEach((element) => {
      element.classList.toggle("toolbar-control-hidden", hidden.has(element.dataset.toolbarControl));
    });
  }

  const hidden = readHidden();
  apply(hidden);
  const trigger = document.getElementById("customizeToolbarBtn");
  if (!trigger) return;

  const dialog = document.createElement("dialog");
  dialog.className = "toolbar-settings-dialog";
  dialog.setAttribute("aria-labelledby", "toolbarSettingsTitle");
  dialog.innerHTML = '<form method="dialog">' +
    '<h2 id="toolbarSettingsTitle">显示的查看工具</h2>' +
    '<p>选择要在主预览器中显示的工具。</p>' +
    '<div class="toolbar-settings-options"></div>' +
    '<div class="toolbar-settings-actions">' +
    '<button type="button" class="outlined-button" data-reset>恢复默认</button>' +
    '<button value="cancel" class="outlined-button">取消</button>' +
    '<button value="save" class="primary-button">保存</button></div></form>';
  const options = dialog.querySelector(".toolbar-settings-options");
  const inputs = Object.entries(controls).map(([key, text]) => {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = key;
    const label = document.createElement("label");
    label.append(input, document.createTextNode(text));
    options.append(label);
    return input;
  });
  const form = dialog.querySelector("form");
  const viewer = document.querySelector(".viewer-panel");
  (viewer || document.body).append(dialog);
  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.addEventListener("click", () => {
    const saved = readHidden();
    inputs.forEach((input) => { input.checked = !saved.has(input.value); });
    dialog.showModal();
  });
  dialog.querySelector("[data-reset]").addEventListener("click", () => {
    inputs.forEach((input) => { input.checked = true; });
  });
  form.addEventListener("submit", (event) => {
    if (event.submitter?.value !== "save") return;
    const next = new Set(inputs.filter((input) => !input.checked).map((input) => input.value));
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = cookieName + "=" + encodeURIComponent([...next].join(",")) +
      "; Max-Age=31536000; Path=/; SameSite=Lax" + secure;
    apply(next);
  });
})();
