(function embedCode() {
  function escapeAttribute(value) {
    return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&#39;");
  }

  function makeServiceUrl(apiBase, relativePath) {
    const root = String(apiBase || "").trim().replace(/\/+$/, "");
    const base = new URL(root + "/");
    if (base.protocol !== "http:" && base.protocol !== "https:") throw new Error("Service URL must use HTTP or HTTPS");
    const url = new URL(relativePath, base);
    return { root: root, url: url };
  }

  function generate(options) {
    options = options || {};
    if (!options.item) return { available: false, message: "请先选择全景图。" };
    if (options.clientOnly) return { available: false, message: "这张图片仅保存在当前浏览器。请上传到服务端后再嵌入。" };
    let service;
    let root;
    let scriptUrl;
    try {
      service = makeServiceUrl(options.apiBase, "widget");
      root = makeServiceUrl(options.apiBase, "embed.js").root;
      scriptUrl = escapeAttribute(new URL("embed.js", new URL(root + "/")).toString());
    } catch (_) {
      return { available: false, message: "服务地址无效，请检查系统设置。" };
    }
    const item = options.item;
    const panoramaNumber = Number(item.panoramaNo);
    if (!Number.isSafeInteger(panoramaNumber) || panoramaNumber < 1) return { available: false, message: "这张全景图的编号无效，暂时无法生成嵌入代码。" };
    const panoramaNo = String(panoramaNumber);
    const name = String(item.name || "720° 全景图");
    const controls = String(options.controls || "all");
    service.url.searchParams.set("panoramaNo", panoramaNo);
    service.url.searchParams.set("controls", controls);
    service.url.searchParams.set("api", service.root);
    const widgetUrl = escapeAttribute(service.url.toString());
    const escapedRoot = escapeAttribute(root);
    const escapedNo = escapeAttribute(panoramaNo);
    const escapedControls = escapeAttribute(controls);
    return {
      available: true,
      iframe: '<iframe\n' +
        '  src="' + widgetUrl + '"\n' +
        '  title="' + escapeAttribute(name) + '"\n' +
        '  loading="lazy"\n' +
        '  allowfullscreen\n' +
        '  style="display:block;width:100%;aspect-ratio:16/9;border:0;"\n' +
        '></iframe>',
      script: '<div id="xint-panorama-widget"></div>\n' +
        '<script\n' +
        '  src="' + scriptUrl + '"\n' +
        '  data-target="xint-panorama-widget"\n' +
        '  data-api="' + escapedRoot + '"\n' +
        '  data-panorama-no="' + escapedNo + '"\n' +
        '  data-controls="' + escapedControls + '"\n' +
        '><' + '/script>'
    };
  }

  window.XinTEmbedCode = { generate: generate };
})();
