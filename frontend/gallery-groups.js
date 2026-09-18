(function galleryGroups() {
  function bind(trigger, request, reloadGallery, connectionId) {
    const dialog = document.createElement("dialog");
    dialog.className = "toolbar-settings-dialog gallery-groups-dialog";
    dialog.setAttribute("aria-labelledby", "galleryGroupsTitle");
    dialog.innerHTML = '<header class="gallery-groups-dialog__header"><div><span class="eyebrow">GROUPS</span><h2 id="galleryGroupsTitle">管理分组</h2></div>' +
      '<button type="button" class="icon-button gallery-groups-dialog__close" data-close aria-label="关闭分组管理" title="关闭"><svg class="xint-icon" aria-hidden="true" focusable="false" viewBox="0 0 256 256"><use href="./icons/sprite.svg#close"></use></svg></button></header>' +
      '<form class="gallery-groups-dialog__form"><label class="field"><span>新分组名称</span><input class="text-input" maxlength="64" required /></label>' +
      '<button type="submit" class="primary-button">创建分组</button></form>' +
      '<p class="form-status gallery-groups-dialog__status" role="status" aria-live="polite"></p>' +
      '<section class="gallery-groups-dialog__section" aria-labelledby="galleryGroupsListTitle"><div class="gallery-groups-dialog__section-heading"><h3 id="galleryGroupsListTitle">已有分组</h3><span data-count>0</span></div>' +
      '<ul class="gallery-group-list" aria-label="已有分组"></ul></section>' +
      '<footer class="toolbar-settings-actions"><button type="button" class="outlined-button" data-close>完成</button></footer>';
    document.body.append(dialog);
    trigger.setAttribute("aria-haspopup", "dialog");
    const form = dialog.querySelector("form");
    const input = form.querySelector("input");
    const list = dialog.querySelector("ul");
    const status = dialog.querySelector(".form-status");
    const count = dialog.querySelector("[data-count]");
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
      count.textContent = String(groups.length);
      if (!groups.length) {
        const item = document.createElement("li");
        item.className = "gallery-group-list__empty";
        item.textContent = "尚未创建分组。创建后可用于整理图库资源。";
        list.append(item);
        return;
      }
      groups.forEach((group) => {
        const item = document.createElement("li");
        item.className = "gallery-group-list__item";
        const name = document.createElement("strong");
        const amount = document.createElement("span");
        name.className = "gallery-group-list__name";
        name.textContent = group.name;
        amount.className = "gallery-group-list__count";
        amount.textContent = group.count + " 项";
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "icon-action-button is-danger";
        remove.title = "删除分组：" + group.name;
        remove.setAttribute("aria-label", "删除分组：" + group.name);
        remove.innerHTML = '<svg class="xint-icon" aria-hidden="true" focusable="false" viewBox="0 0 256 256"><use href="./icons/sprite.svg#delete"></use></svg>';
        remove.addEventListener("click", () => {
          if (!busy && window.confirm("删除分组“" + group.name + "”？组内图片将移到未分组。")) {
            mutate("/api/gallery/groups?name=" + encodeURIComponent(group.name), { method: "DELETE" }, "已删除分组");
          }
        });
        item.append(name, amount, remove);
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
        await reloadGallery();
        if (connection !== connectionId() || current !== session || !dialog.open) return;
        await load(current, connection);
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
      count.textContent = "0";
      input.value = "";
      status.textContent = "正在读取分组…";
      dialog.showModal();
      setBusy(true);
      try {
        await load(current, connection);
        if (current === session && dialog.open) status.textContent = "";
      } catch (error) {
        if (current === session && dialog.open && connection === connectionId()) status.textContent = error.message;
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
    dialog.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => dialog.close()));
    dialog.addEventListener("close", () => {
      session += 1;
      setBusy(false);
      trigger.focus();
    });
  }

  window.XinTGalleryGroups = { bind };
})();
