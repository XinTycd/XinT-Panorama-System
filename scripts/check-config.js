const fs = require("fs");
const path = require("path");
const { applyRuntimeConfig, getModesFromEnv } = require("../lib/runtime-config");

const runtime = applyRuntimeConfig(process.argv.slice(2));
const storageDir = path.resolve(process.env.PANORAMA_STORAGE_DIR || path.join(__dirname, "..", "backend", "storage"));
const databaseFile = path.join(storageDir, "panorama.sqlite");
const nodeMajor = Number(process.versions.node.split(".")[0]);

if (nodeMajor < 24) {
  throw new Error("此版本需要 Node.js 24 或更高版本，当前版本为 " + process.versions.node);
}
const storageStat = fs.statSync(storageDir);
if (!storageStat.isDirectory()) throw new Error("存储路径不是目录: " + storageDir);
fs.accessSync(storageDir, fs.constants.R_OK | fs.constants.W_OK);

const databaseDirectory = path.dirname(databaseFile);
if (!fs.existsSync(databaseDirectory) || !fs.statSync(databaseDirectory).isDirectory()) {
  throw new Error("SQLite 文件所在目录不可用: " + databaseDirectory);
}
fs.accessSync(databaseDirectory, fs.constants.R_OK | fs.constants.W_OK);
if (fs.existsSync(databaseFile)) fs.accessSync(databaseFile, fs.constants.R_OK | fs.constants.W_OK);

console.log("配置校验通过");
console.log("Config: " + runtime.configPath);
console.log("Storage: " + storageDir);
console.log("Database: sqlite");
console.log("Database file: " + databaseFile);
console.log("Modes: " + getModesFromEnv().join(","));
