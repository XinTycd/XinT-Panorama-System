const { applyRuntimeConfig } = require("../lib/runtime-config");

applyRuntimeConfig(process.argv.slice(2));

const backend = require("../backend/index");
const frontend = require("./frontend-server");

const servers = [
  {
    name: "Backend",
    host: backend.HOST,
    port: backend.PORT,
    server: backend.createServer()
  },
  {
    name: "Frontend",
    host: frontend.HOST,
    port: frontend.PORT,
    server: frontend.createServer()
  }
];

function listen(definition) {
  return new Promise(function start(resolve, reject) {
    definition.server.once("error", reject);
    definition.server.listen(definition.port, definition.host, function onListen() {
      definition.server.off("error", reject);
      resolve();
    });
  });
}

function close(definition) {
  return new Promise(function stop(resolve) {
    if (!definition.server.listening) {
      resolve();
      return;
    }
    definition.server.close(resolve);
  });
}

async function startAll() {
  await backend.initialize();
  for (const definition of servers) {
    await listen(definition);
  }
  console.log("前端地址： http://" + frontend.HOST + ":" + frontend.PORT);
  console.log("后端地址： http://" + backend.HOST + ":" + backend.PORT);
  console.log("Runtime modes: " + backend.APP_MODES.join(",") + ", database: " + backend.DB_DRIVER);
}

async function shutdown() {
  await Promise.all(servers.map(close));
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

startAll().catch(async function onError(error) {
  console.error(error.message);
  await Promise.all(servers.map(close));
  process.exit(1);
});
