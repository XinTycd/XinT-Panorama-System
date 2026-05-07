const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_CONFIG_FILE = path.join(ROOT_DIR, "config.json");
const ALL_MODES = ["database", "external", "upload"];

function applyRuntimeConfig(args) {
  const cli = parseArgs(args || []);
  const configPath = path.resolve(ROOT_DIR, cli.config || process.env.PANORAMA_CONFIG || DEFAULT_CONFIG_FILE);
  const config = readConfig(configPath);

  applyConfig(config);
  applyCli(cli);
  normalizeRuntimeEnv();

  return {
    configPath: configPath,
    config: config,
    modes: getModesFromEnv(),
    database: process.env.PANORAMA_DB || "json"
  };
}

function readConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (error) {
    throw new Error("配置文件解析失败: " + configPath + "，" + error.message);
  }
}

function applyConfig(config) {
  const server = config.server || {};
  const backend = server.backend || {};
  const frontend = server.frontend || {};
  const database = config.database || {};
  const json = database.json || {};
  const mysql = database.mysql || {};

  setIfUnset("PANORAMA_APP_MODES", normalizeModes(config.modes || config.mode).join(","));
  setIfUnset("PANORAMA_DB", database.driver);
  setIfUnset("PANORAMA_STORAGE_DIR", resolveProjectPath(json.storageDir));

  setIfUnset("PANORAMA_HOST", backend.host);
  setIfUnset("PANORAMA_PORT", backend.port);
  setIfUnset("FRONTEND_HOST", frontend.host);
  setIfUnset("FRONTEND_PORT", frontend.port);

  setIfUnset("PANORAMA_MYSQL_HOST", mysql.host);
  setIfUnset("PANORAMA_MYSQL_PORT", mysql.port);
  setIfUnset("PANORAMA_MYSQL_USER", mysql.user);
  setIfUnset("PANORAMA_MYSQL_PASSWORD", mysql.password);
  setIfUnset("PANORAMA_MYSQL_DATABASE", mysql.database);
  setIfUnset("PANORAMA_MYSQL_TABLE", mysql.table);
  setIfUnset("PANORAMA_MYSQL_URL", mysql.url);
  setIfUnset("PANORAMA_MYSQL_CONNECTION_LIMIT", mysql.connectionLimit);
}

function applyCli(cli) {
  if (cli.db) {
    process.env.PANORAMA_DB = cli.db;
  }
  if (cli.modes.length) {
    process.env.PANORAMA_APP_MODES = normalizeModes(cli.modes).join(",");
  }
}

function parseArgs(args) {
  const parsed = {
    config: null,
    db: null,
    modes: []
  };

  args.forEach(function eachArg(arg, index) {
    if (arg === "--config" && args[index + 1]) {
      parsed.config = args[index + 1];
    } else if (arg.indexOf("--config=") === 0) {
      parsed.config = arg.slice("--config=".length);
    } else if (arg === "--db" && args[index + 1]) {
      parsed.db = args[index + 1];
    } else if (arg.indexOf("--db=") === 0) {
      parsed.db = arg.slice("--db=".length);
    } else if ((arg === "--mode" || arg === "--modes") && args[index + 1]) {
      parsed.modes = parsed.modes.concat(splitModes(args[index + 1]));
    } else if (arg.indexOf("--mode=") === 0) {
      parsed.modes = parsed.modes.concat(splitModes(arg.slice("--mode=".length)));
    } else if (arg.indexOf("--modes=") === 0) {
      parsed.modes = parsed.modes.concat(splitModes(arg.slice("--modes=".length)));
    }
  });

  return parsed;
}

function normalizeRuntimeEnv() {
  const modes = normalizeModes(process.env.PANORAMA_APP_MODES || process.env.PANORAMA_APP_MODE || "all");
  process.env.PANORAMA_APP_MODES = modes.join(",");
  process.env.PANORAMA_APP_MODE = modes.length === ALL_MODES.length ? "all" : modes.join(",");
  process.env.PANORAMA_DB = String(process.env.PANORAMA_DB || "json").trim().toLowerCase() === "mysql" ? "mysql" : "json";
}

function getModesFromEnv() {
  return normalizeModes(process.env.PANORAMA_APP_MODES || process.env.PANORAMA_APP_MODE || "all");
}

function normalizeModes(value) {
  const rawModes = splitModes(value);
  const selected = rawModes.length ? rawModes : ["all"];
  const modes = [];

  selected.forEach(function eachMode(mode) {
    if (mode === "all") {
      ALL_MODES.forEach(function addAll(item) {
        if (modes.indexOf(item) === -1) {
          modes.push(item);
        }
      });
      return;
    }

    if (ALL_MODES.indexOf(mode) !== -1 && modes.indexOf(mode) === -1) {
      modes.push(mode);
    }
  });

  return modes.length ? modes : ALL_MODES.slice();
}

function splitModes(value) {
  if (Array.isArray(value)) {
    return value.reduce(function flatten(result, item) {
      return result.concat(splitModes(item));
    }, []);
  }

  return String(value || "")
    .split(/[,\s]+/)
    .map(function normalize(mode) {
      return mode.trim().toLowerCase();
    })
    .filter(Boolean);
}

function resolveProjectPath(value) {
  if (!value) {
    return value;
  }

  return path.isAbsolute(String(value)) ? String(value) : path.resolve(ROOT_DIR, String(value));
}

function setIfUnset(name, value) {
  if (value === undefined || value === null || value === "") {
    return;
  }
  if (process.env[name] !== undefined && process.env[name] !== "") {
    return;
  }
  process.env[name] = String(value);
}

module.exports = {
  ALL_MODES,
  applyRuntimeConfig,
  getModesFromEnv,
  normalizeModes
};
