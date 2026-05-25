const fs = require("fs");
const path = require("path");
const os = require("os");

// Works both with Electron and standalone Node.js
function getDataDir() {
  try {
    const { app } = require("electron");
    return app.getPath("userData");
  } catch {
    return path.join(os.homedir(), ".screen-agent");
  }
}

// In packaged Electron app, config.json lives next to the .exe (process.execPath's dir).
// In dev (node run-agent.js), it lives in the project root (process.cwd()).
function getConfigPath() {
  try {
    const { app } = require("electron");
    // Installed app: resources/ is next to exe, config.json is in app root
    if (app.isPackaged) {
      return path.join(path.dirname(process.execPath), "config.json");
    }
  } catch {}
  return path.join(process.cwd(), "config.json");
}

const CONFIG_PATH = getConfigPath();

const DEFAULTS = {
  server_url: "http://localhost:8000",
  agent_token: "",
  recording: {
    enabled: true,
    fps: 5,
    resolution: "1280x720",
    codec: "libx264",
    crf: 30,
    segment_duration_min: 1,   // 1 min for easy testing (change to 30 for prod)
    max_local_buffer_gb: 10,
  },
  activity: {
    track_apps: true,
    track_idle: true,
    idle_threshold_sec: 60,
  },
};

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
      const loaded = JSON.parse(raw);
      return {
        ...DEFAULTS,
        ...loaded,
        recording: { ...DEFAULTS.recording, ...(loaded.recording || {}) },
        activity: { ...DEFAULTS.activity, ...(loaded.activity || {}) },
      };
    }
  } catch (e) {
    console.warn("[config] Failed to load config.json:", e.message);
  }
  return { ...DEFAULTS };
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

module.exports = { loadConfig, saveConfig, CONFIG_PATH, getDataDir };
