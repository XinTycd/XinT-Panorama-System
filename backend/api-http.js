const { sendJson, sendText } = require("../lib/http");

const JSON_LIMIT_BYTES = 30 * 1024 * 1024;

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function parseBody(req) {
  return new Promise(function read(resolve, reject) {
    let total = 0;
    let tooLarge = false;
    const chunks = [];
    req.on("data", function onData(chunk) {
      total += chunk.length;
      if (total > JSON_LIMIT_BYTES) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      if (!tooLarge) chunks.push(chunk);
    });
    req.on("end", function onEnd() {
      if (tooLarge) {
        reject(createHttpError(413, "请求体过大"));
        return;
      }
      if (!chunks.length) {
        resolve({});
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch (_) {
        reject(createHttpError(400, "JSON 解析失败"));
        return;
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        reject(createHttpError(400, "请求体必须是 JSON 对象"));
        return;
      }
      resolve(parsed);
    });
    req.on("error", reject);
  });
}

module.exports = {
  sendJson: function sendJsonWithCors(res, statusCode, payload) {
    sendJson(res, statusCode, payload, { cors: true });
  },
  sendText: function sendTextWithCors(res, statusCode, message) {
    sendText(res, statusCode, message, { cors: true });
  },
  parseBody,
  createHttpError
};
