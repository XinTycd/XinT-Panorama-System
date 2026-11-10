(function galleryGroups() {
  function bind(trigger, request, reloadGallery, connectionId) {
    const dialog = document.createElement("dialog");
    dialog.className = "toolbar-settings-dialog gallery-groups-dialog";
    dialog.setAttribute("aria-labelledby", "galleryGroupsTitle");
    dialog.innerHTML = '<header class="gallery-groups-dialog__header"><div><span class="eyebrow">GROUPS</span><h2 id="galleryGroupsTitle" data-i18n="groups.title">管理分组</h2></div>' +
      '<button type="button" class="icon-button gallery-groups-dialog__close" data-close aria-label="关闭分组管理" title="关闭" data-i18n-aria-label="groups.close" data-i18n-title="common.close"><svg class="xint-icon" aria-hidden="true" focusable="false" viewBox="0 0 256 256"><use href="./icons/sprite.svg#close"></use></svg></button></header>' +
      '<form class="gallery-groups-dialog__form"><label class="field"><span data-i18n="groups.newName">新分组名称</span><input class="text-input" maxlength="64" required /></label>' +
      '<button type="submit" class="primary-button" data-i18n="groups.create">创建分组</button></form>' +
      '<p class="form-status gallery-groups-dialog__status" role="status" aria-live="polite" data-i18n-message></p>' +
      '<section class="gallery-groups-dialog__section" aria-labelledby="galleryGroupsListTitle"><div class="gallery-groups-dialog__section-heading"><h3 id="galleryGroupsListTitle" data-i18n="groups.existing">已有分组</h3><span data-count>0</span></div>' +
      '<ul class="gallery-group-list" aria-label="已有分组" data-i18n-aria-label="groups.existing"></ul></section>' +
      '<footer class="toolbar-settings-actions"><button type="button" class="outlined-button" data-close data-i18n="common.close">完成</button></footer>';
    document.body.append(dialog);
    if (window.XinTI18n) window.XinTI18n.apply(dialog);
    trigger.setAttribute("aria-haspopup", "dialog");
    const form = dialog.querySelector("form");
    const input = form.querySelector("input");
    const list = dialog.querySelector("ul");
    const status = dialog.querySelector(".form-status");
    const count = dialog.querySelector("[data-count]");
    let session = 0;
    let busy = false;
    let lastGroups = [];

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
      lastGroups = groups;
      count.textContent = String(groups.length);
      if (!groups.length) {
        const item = document.createElement("li");
        item.className = "gallery-group-list__empty";
        item.textContent = window.XinTI18n ? window.XinTI18n.t("groups.empty") : "尚未创建分组。创建后可用于整理图库资源。";
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
        amount.textContent = window.XinTI18n ? window.XinTI18n.t("status.groupCount", { count: group.count }) : group.count + " 项";
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "icon-action-button is-danger";
        remove.title = window.XinTI18n ? window.XinTI18n.t("a11y.deleteGroup", { name: group.name }) : "删除分组：" + group.name;
        remove.setAttribute("aria-label", remove.title);
        remove.innerHTML = '<svg class="xint-icon" aria-hidden="true" focusable="false" viewBox="0 0 256 256"><use href="./icons/sprite.svg#delete"></use></svg>';
        remove.addEventListener("click", () => {
          const confirmText = window.XinTI18n ? window.XinTI18n.t("status.groupDeleteConfirm", { name: group.name }) : "删除分组“" + group.name + "”？组内图片将移到未分组。";
          if (!busy && window.confirm(confirmText)) {
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
          status.textContent = window.XinTI18n ? window.XinTI18n.translateMessage(message) : message;
        }
      } catch (error) {
        if (current === session && connection === connectionId() && dialog.open) status.textContent = window.XinTI18n ? window.XinTI18n.translateMessage(error.message) : error.message;
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
      status.textContent = window.XinTI18n ? window.XinTI18n.t("groups.loading") : "正在读取分组…";
      dialog.showModal();
      setBusy(true);
      try {
        await load(current, connection);
        if (current === session && dialog.open) status.textContent = "";
      } catch (error) {
        if (current === session && dialog.open && connection === connectionId()) status.textContent = window.XinTI18n ? window.XinTI18n.translateMessage(error.message) : error.message;
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
    window.addEventListener("xint-language-change", () => {
      if (!window.XinTI18n) return;
      window.XinTI18n.apply(dialog);
      window.XinTI18n.applyMessages(dialog);
      if (!lastGroups.length && list.firstElementChild) list.firstElementChild.textContent = window.XinTI18n.t("groups.empty");
      else Array.prototype.forEach.call(list.children, function updateGroupCounts(item, index) {
        const amount = item.querySelector(".gallery-group-list__count");
        const remove = item.querySelector("button");
        const group = lastGroups[index];
        if (amount && group) amount.textContent = window.XinTI18n.t("status.groupCount", { count: group.count });
        if (remove && group) {
          remove.title = window.XinTI18n.t("a11y.deleteGroup", { name: group.name });
          remove.setAttribute("aria-label", remove.title);
        }
      });
    });
  }

  window.XinTGalleryGroups = { bind };
})();
