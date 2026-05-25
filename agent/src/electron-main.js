/**
 * Electron entry point — Windows/macOS desktop app with system tray.
 * Wraps run-agent.js logic in an Electron shell with:
 *   - System tray icon with status indicator
 *   - Context menu: pause, resume, show stats, open admin panel
 *   - Autostart on Windows login
 *   - Watchdog: auto-restart recorder on crash
 */

const { app, Tray, Menu, nativeImage, shell, dialog, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const { loadConfig, CONFIG_PATH } = require("./config");

// Prevent multiple instances
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let tray = null;
let recorder = null;
let tracker = null;
let uploader = null;
let screenshotter = null;
let webTracker = null;
let updater = null;
let db = null;
let config = null;

// ── Icons (embedded SVG as data URI for cross-platform) ─────────────────────
function createTrayIcon(status) {
  // On Windows, 16x16 ICO; on macOS, template image works best
  // For simplicity, use a colored circle as NativeImage
  const size = process.platform === "win32" ? 16 : 22;
  const colors = { recording: "#22c55e", paused: "#f59e0b", error: "#ef4444", stopped: "#9ca3af" };
  const color = colors[status] || colors.stopped;

  // Create a simple colored square (real app would use .ico files)
  const { nativeImage: ni } = require("electron");
  try {
    const iconPath = path.join(__dirname, `../assets/icon-${status}.png`);
    if (fs.existsSync(iconPath)) return ni.createFromPath(iconPath);
  } catch {}
  return ni.createEmpty();
}

app.setAppUserModelId("com.screenagent.client");

app.whenReady().then(async () => {
  // Load or create config
  config = loadConfig();

  if (!config.agent_token) {
    const choice = await dialog.showMessageBox({
      type: "warning",
      title: "Screen Agent — Настройка",
      message: "Токен агента не настроен.",
      detail: `Создайте файл конфигурации:\n${CONFIG_PATH}\n\nПолучите agent_token в Admin Panel → Сотрудники → Карточка → Агенты → Новый токен`,
      buttons: ["Открыть папку", "Выйти"],
    });
    if (choice.response === 0) shell.openPath(path.dirname(CONFIG_PATH));
    app.quit();
    return;
  }

  // Initialize modules
  const { DB } = require("./db");
  const { Recorder } = require("./recorder");
  const { Uploader } = require("./uploader");
  const { ActivityTracker } = require("./tracker");
  const { Screenshotter } = require("./screenshotter");
  const { WebTracker } = require("./webtracker");
  const { Updater } = require("./updater");

  db = new DB();
  uploader = new Uploader(config, db);
  recorder = new Recorder(config, db);
  tracker = new ActivityTracker(config, db);
  screenshotter = new Screenshotter(config, uploader);
  webTracker = new WebTracker(config, db);
  updater = new Updater(config);

  recorder.on("segment-ready", () => uploader._processQueue().catch(() => {}));
  recorder.on("error", (msg) => {
    console.error("[electron] Recorder error:", msg);
    updateTray();
  });
  tracker.on("flush", ({ events, date, activeSec, idleSec }) => {
    uploader.sendStats(events, date, activeSec, idleSec).catch(() => {});
  });

  // Autostart on Windows login
  app.setLoginItemSettings({
    openAtLogin: true,
    name: "Screen Agent",
    args: [],
  });

  // Start all modules
  uploader.start();
  const ok = await recorder.init();
  if (ok) recorder.start();
  tracker.start();
  screenshotter.start();
  webTracker.start();
  updater.start();

  // Heartbeat loop
  setInterval(() => uploader.sendHeartbeat(recorder.getStatus()).catch(() => {}), 30_000);
  uploader.sendHeartbeat("online").catch(() => {});

  setupTray();
  setInterval(updateTray, 10_000);
});

function setupTray() {
  tray = new Tray(createTrayIcon(recorder?.getStatus() || "stopped"));
  tray.setToolTip("Screen Agent");
  updateTray();

  // Double-click opens admin panel
  tray.on("double-click", () => {
    shell.openExternal(config?.server_url?.replace(":8000", ":3001") || "http://localhost:3001");
  });
}

function updateTray() {
  if (!tray) return;
  const status = recorder?.getStatus() || "stopped";
  const pending = uploader?.getPendingCount() || 0;

  const statusLabels = {
    recording: "🟢 Идёт запись",
    paused:    "🟡 Пауза",
    error:     "🔴 Ошибка",
    stopped:   "⚫ Остановлен",
  };

  tray.setImage(createTrayIcon(status));
  tray.setToolTip(`Screen Agent — ${statusLabels[status] || status}`);

  const menu = Menu.buildFromTemplate([
    { label: `Screen Agent v${require("../package.json").version}`, enabled: false },
    { label: statusLabels[status] || status, enabled: false },
    { type: "separator" },
    {
      label: "Поставить на паузу",
      enabled: status === "recording",
      click: () => { recorder?.pause(); updateTray(); },
    },
    {
      label: "Возобновить запись",
      enabled: status === "paused" || status === "stopped",
      click: () => { recorder?.start(); updateTray(); },
    },
    { type: "separator" },
    {
      label: `Очередь загрузки: ${pending} файл${pending === 1 ? "" : "ов"}`,
      enabled: false,
    },
    {
      label: "Открыть Admin Panel",
      click: () => shell.openExternal(config?.server_url?.replace(":8000", ":3001") || "http://localhost:3001"),
    },
    {
      label: "Показать лог",
      click: () => shell.openPath(require("path").join(require("os").homedir(), ".screen-agent")),
    },
    { type: "separator" },
    { label: `Сервер: ${config?.server_url || "не настроен"}`, enabled: false },
    { type: "separator" },
    {
      label: "Завершить",
      click: async () => {
        recorder?.stop();
        tracker?.stop();
        screenshotter?.stop();
        webTracker?.stop();
        updater?.stop();
        await new Promise((r) => setTimeout(r, 3000));
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(menu);
}

app.on("window-all-closed", (e) => e.preventDefault()); // keep in tray
app.on("before-quit", () => {
  recorder?.stop();
  tracker?.stop();
});
