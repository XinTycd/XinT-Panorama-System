const path = require("path");
const { spawn } = require("child_process");

const processes = [
  {
    name: "backend",
    cwd: path.resolve(__dirname, ".."),
    command: process.execPath,
    args: [path.join("backend", "index.js")]
  },
  {
    name: "frontend",
    cwd: path.resolve(__dirname, ".."),
    command: process.execPath,
    args: [path.join("scripts", "frontend-server.js")]
  }
];

const children = processes.map(function startProcess(definition) {
  const child = spawn(definition.command, definition.args, {
    cwd: definition.cwd,
    stdio: "inherit"
  });

  child.on("exit", function onExit(code) {
    if (code !== 0) {
      console.error(definition.name + " exited with code " + code);
    }
  });

  return child;
});

function shutdown() {
  children.forEach(function stop(child) {
    if (!child.killed) {
      child.kill();
    }
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
