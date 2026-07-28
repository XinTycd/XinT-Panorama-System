const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const storageDir = path.join(__dirname, ".tmp", "viewer-engine-env-" + process.pid);
const source = [
  'const http=require("node:http");',
  'const {createServer}=require("./backend/index");',
  'const server=createServer();',
  'server.listen(0,"127.0.0.1",()=>{',
  ' const req=http.request({hostname:"127.0.0.1",port:server.address().port,path:"/api/settings/viewer",method:"PUT",headers:{"content-type":"application/json"}},res=>{',
  '  res.resume();res.on("end",()=>{process.stdout.write(String(res.statusCode));server.close();});',
  ' });req.end(JSON.stringify({engine:"psv"}));',
  '});'
].join("");
const result = spawnSync(process.execPath, ["-e", source], {
  cwd: root,
  encoding: "utf8",
  timeout: 15000,
  env: Object.assign({}, process.env, {
    PANORAMA_VIEWER_ENGINE: "legacy",
    PANORAMA_STORAGE_DIR: storageDir
  })
});
assert.equal(result.status, 0, result.stderr);
assert.equal(result.stdout, "409", "Environment-forced viewer settings must reject a false save success");
console.log("Viewer engine config tests passed");
