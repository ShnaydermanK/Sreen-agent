const { app, Tray, Menu, nativeImage, BrowserWindow } = require("electron");
const path = require("path");
const { Recorder } = require("./recorder");
const { ActivityTracker } = require("./tracker");
const { Uploader } = require("./uploader");
const { DB } = require("./db");
const { loadConfig, saveConfig } = require("./config");

let tray = null;
let recorder = null;
let tracker = null;
let uploader = null;

app.setLoginItemSettings({ openAtLogin: true });

app.whenReady().then(async () => {
  const config = loadConfig();

  if (!config.agent_token || !config.server_url) {
    console.error("Missing agent_token or server_url in config.json");
    app.quit();
    return;
  }

  const db = new DB();
  uploader = new Uploader(config, db);
  tracker = new ActivityTracker(config, db, uploader);
  recorder = new Recorder(config, db, uploader);

  await uploader.start();
  tracker.start();
  recorder.start();

  setupTray();

  // Heartbeat every 30s
  setInterval(() => uploader.sendHeartbeat(recorder.getStatus()), 30_000);
  uploader.sendHeartbeat(recorder.getStatus());
});

function setupTray() {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);

  const updateTray = () => {
    const status = recorder?.getStatus() ?? "stopped";
    const statusLabel = { recording: "🟢 Запись", paused: "🟡 Пауза", stopped: "🔴 Остановлен" }[status] ?? status;

    const menu = Menu.buildFromTemplate([
      { label: `Screen Agent — ${statusLabel}`, enabled: false },
      { type: "separator" },
      {
        label: "Поставить на паузу",
        visible: status === "recording",
        click: () => { recorder?.pause(); updateTray(); },
      },
      {
        label: "Возобновить запись",
        visible: status === "paused",
        click: () => { recorder?.resume(); updateTray(); },
      },
      { type: "separator" },
      { label: `Синхронизация: ${uploader?.getPendingCount() ?? 0} файлов`, enabled: false },
      { type: "separator" },
      { label: "Завершить (только с правами адм.)", role: "quit" },
    ]);

    tray.setContextMenu(menu);
    tray.setToolTip(`Screen Agent — ${statusLabel}`);
  };

  updateTray();
  setInterval(updateTray, 5_000);
}

app.on("window-all-closed", (e) => e.preventDefault());
