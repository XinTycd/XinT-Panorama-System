(function clientMedia() {
  var connection;
  var urls = new Map();

  function openDatabase() {
    if (!connection) {
      connection = new Promise(function open(resolve, reject) {
        var request = indexedDB.open("xint-panorama-media", 1);
        request.onupgradeneeded = function createStore() {
          request.result.createObjectStore("images");
        };
        request.onsuccess = function ready() {
          var db = request.result;
          db.onversionchange = function closeForUpgrade() {
            db.close();
            connection = null;
          };
          resolve(db);
        };
        request.onerror = function failed() { reject(request.error); };
      }).catch(function retryOnNextUse(error) {
        connection = null;
        throw error;
      });
    }
    return connection;
  }

  async function access(mode, action) {
    var db = await openDatabase();
    return new Promise(function execute(resolve, reject) {
      var transaction = db.transaction("images", mode);
      var request = action(transaction.objectStore("images"));
      transaction.oncomplete = function complete() { resolve(request.result); };
      transaction.onabort = function abort() { reject(transaction.error || new Error("浏览器存储操作未完成")); };
    });
  }

  async function convert(file, options) {
    var bitmap = await createImageBitmap(file);
    try {
      if (bitmap.width * bitmap.height > 100000000) throw new Error("图片像素过多，无法在浏览器转码");
      var canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      var context = canvas.getContext("2d");
      if (!context) throw new Error("浏览器无法创建转码画布");
      context.drawImage(bitmap, 0, 0);
      var mime = "image/" + options.codec;
      return await new Promise(function encode(resolve, reject) {
        canvas.toBlob(function done(blob) {
          if (blob && blob.type === mime) resolve(blob);
          else reject(new Error("当前浏览器无法转码为 " + options.codec.toUpperCase()));
        }, mime, options.quality / 100);
      });
    } finally {
      bitmap.close();
    }
  }

  function asDataUrl(blob) {
    return new Promise(function read(resolve, reject) {
      var reader = new FileReader();
      reader.onload = function loaded() { resolve(reader.result); };
      reader.onerror = function failed() { reject(reader.error); };
      reader.readAsDataURL(blob);
    });
  }

  function revoke(id) {
    if (urls.has(id)) {
      URL.revokeObjectURL(urls.get(id));
      urls.delete(id);
    }
  }

  async function put(id, file, options) {
    if (!file.size || !file.type.startsWith("image/")) throw new Error("请选择有效的图片文件");
    var blob = options.format === "transcode" ? await convert(file, options) : file;
    var data = options.format === "base64" ? await asDataUrl(blob) : blob;
    await access("readwrite", function save(store) { return store.put(data, id); });
    revoke(id);
    return { size: blob.size };
  }

  async function getUrl(id) {
    if (urls.has(id)) return urls.get(id);
    var data = await access("readonly", function read(store) { return store.get(id); });
    if (typeof data === "string") return data;
    if (!data) return null;
    if (!urls.has(id)) urls.set(id, URL.createObjectURL(data));
    return urls.get(id);
  }

  async function remove(id) {
    await access("readwrite", function erase(store) { return store.delete(id); });
    revoke(id);
  }

  window.XinTClientMedia = { put: put, getUrl: getUrl, remove: remove };
})();
