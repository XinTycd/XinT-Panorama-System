const path = require("path");
const { spawn } = require("child_process");
const { app, BrowserWindow } = require("electron");

const BACKEND_URL = process.env.PANORAMA_BACKEND_URL || "http://127.0.0.1:7210";
const FRONTEND_URL =
  process.env.PANORAMA_FRONTEND_URL || "http://127.0.0.1:7211/?api=" + encodeURIComponent(BACKEND_URL);

let backendProcess = null;
let frontendProcess = null;

function startService(scriptPath) {
  return spawn("node", [scriptPath], {
    cwd: path.resolve(__dirname, ".."),
    stdio: "inherit"
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1540,
    height: 980,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: "#07111f",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  function loadFrontend() {
    win.loadURL(FRONTEND_URL).catch(function retryLoad() {
      setTimeout(loadFrontend, 800);
    });
  }

  loadFrontend();
}

app.whenReady().then(function onReady() {
  backendProcess = startService(path.join("backend", "index.js"));
  frontendProcess = startService(path.join("scripts", "frontend-server.js"));
  createWindow();
});

app.on("window-all-closed", function onClose() {
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill();
  }
  if (frontendProcess && !frontendProcess.killed) {
    frontendProcess.kill();
  }
  app.quit();
});
