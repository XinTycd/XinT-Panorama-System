(function galleryGroups() {
  function bind(trigger, request, reloadGallery, connectionId) {
    const dialog = document.createElement("dialog");
    dialog.className = "toolbar-settings-dialog";
    dialog.setAttribute("aria-labelledby", "galleryGroupsTitle");
    dialog.innerHTML = '<h2 id="galleryGroupsTitle">管理分组</h2>' +
      '<form class="stack-form"><label class="field"><span>新分组名称</span>' +
      '<input class="text-input" maxlength="64" required /></label>' +
      '<button type="submit" class="primary-button">创建分组</button></form>' +
      '<p class="form-status" role="status" aria-live="polite"></p>' +
      '<ul class="gallery-group-list" aria-label="已有分组"></ul>' +
      '<div class="toolbar-settings-actions"><button type="button" class="outlined-button" data-close>完成</button></div>';
    document.body.append(dialog);
    trigger.setAttribute("aria-haspopup", "dialog");
    const form = dialog.querySelector("form");
    const input = form.querySelector("input");
    const list = dialog.querySelector("ul");
    const status = dialog.querySelector(".form-status");
    const close = dialog.querySelector("[data-close]");
    let session = 0;
    let busy = false;

    function setBusy(value) {
      busy = value;
      dialog.querySelectorAll("button:not([data-close]), input").forEach((element) => {
        element.disabled = value;
      });
    }

    async function load(current, connection) {
      const data = await request("/api/gallery/groups");
      if (!dialog.open || current !== session || connection !== connectionId()) return;
      list.replaceChildren();
      const groups = data.items.filter((group) => String(group.name || "").trim());
      if (!groups.length) {
        const item = document.createElement("li");
        item.textContent = "尚未创建分组";
        list.append(item);
        return;
      }
      groups.forEach((group) => {
        const item = document.createElement("li");
        const label = document.createElement("span");
        label.textContent = group.name + " · " + group.count + " 项";
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "icon-action-button is-danger";
        remove.title = "删除分组：" + group.name;
        remove.setAttribute("aria-label", "删除分组：" + group.name);
        remove.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6"/></svg>';
        remove.addEventListener("click", () => {
          if (!busy && window.confirm("删除分组“" + group.name + "”？组内图片将移到未分组。")) {
            mutate("/api/gallery/groups?name=" + encodeURIComponent(group.name), { method: "DELETE" }, "已删除分组");
          }
        });
        item.append(label, remove);
        list.append(item);
      });
    }

    async function mutate(url, options, message) {
      const current = session;
      const connection = connectionId();
      setBusy(true);
      status.textContent = "";
      try {
        await request(url, options);
        if (connection !== connectionId()) return;
        await Promise.all([reloadGallery(), load(current, connection)]);
        if (current === session && dialog.open) {
          if (options.method === "POST") input.value = "";
          status.textContent = message;
        }
      } catch (error) {
        if (current === session && connection === connectionId() && dialog.open) status.textContent = error.message;
      } finally {
        if (current === session) setBusy(false);
      }
    }

    trigger.addEventListener("click", async () => {
      const current = ++session;
      const connection = connectionId();
      list.replaceChildren();
      input.value = "";
      status.textContent = "正在读取分组…";
      dialog.showModal();
      setBusy(true);
      try {
        await load(current, connection);
        if (current === session && dialog.open) status.textContent = "";
      } catch (error) {
        if (current === session && dialog.open) status.textContent = error.message;
      } finally {
        if (current === session) {
          setBusy(false);
          if (dialog.open) input.focus();
        }
      }
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const name = input.value.trim();
      if (!busy && name) mutate("/api/gallery/groups", { method: "POST", body: JSON.stringify({ name }) }, "已创建分组");
    });
    close.addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => trigger.focus());
  }

  window.XinTGalleryGroups = { bind };
})();
