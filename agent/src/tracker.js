const { execSync } = require("child_process");
const { EventEmitter } = require("events");
const os = require("os");
const { getIdleSeconds } = require("./idle");

const CATEGORIES = {
  crm:       ["zendesk", "salesforce", "bitrix", "amocrm", "freshdesk", "hubspot"],
  telephony: ["zoiper", "xlite", "3cx", "jabber", "avaya", "webex"],
  browser:   ["chrome", "firefox", "safari", "edge", "opera", "arc"],
  office:    ["word", "excel", "outlook", "powerpoint", "keynote", "numbers", "pages"],
  messenger: ["telegram", "whatsapp", "viber", "skype", "slack", "teams", "discord"],
};

function categorize(appName = "") {
  const lower = appName.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORIES)) {
    if (keywords.some((k) => lower.includes(k))) return cat;
  }
  return "other";
}

function getActiveWindowMac() {
  try {
    const script = `
      tell application "System Events"
        set frontApp to first application process whose frontmost is true
        set appName to name of frontApp
        set winTitle to ""
        try
          set winTitle to name of front window of frontApp
        end try
        return appName & "|" & winTitle
      end tell
    `;
    const result = execSync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, {
      timeout: 2000,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const [appName, windowTitle] = result.split("|");
    return { name: appName?.trim() || "unknown", title: windowTitle?.trim() || "" };
  } catch {
    return null;
  }
}

function getActiveWindowWin32() {
  try {
    const result = execSync(
      `powershell -Command "Get-Process | Where-Object {$_.MainWindowTitle -ne ''} | Sort-Object CPU -Descending | Select-Object -First 1 | Select-Object ProcessName, MainWindowTitle | ConvertTo-Json"`,
      { timeout: 3000, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }
    );
    const data = JSON.parse(result);
    return { name: data.ProcessName || "unknown", title: data.MainWindowTitle || "" };
  } catch {
    return null;
  }
}

class ActivityTracker extends EventEmitter {
  constructor(config, db) {
    super();
    this.config = config;
    this.db = db;
    this.isIdle = false;
    this.lastActiveApp = null;
    this.appFocusStart = null;
    this.dailyActiveSec = 0;
    this.dailyIdleSec = 0;
    this._lastActivity = Date.now();
    this._pollInterval = null;
    this._statsFlushInterval = null;
    this._idleCheckInterval = null;
    this._activeStart = Date.now();
  }

  start() {
    console.log("[tracker] Starting activity tracking");
    this._emitEvent("session_start");

    this._pollInterval = setInterval(() => this._pollWindow(), 3000);
    this._idleCheckInterval = setInterval(() => this._checkIdle(), 5000);
    this._statsFlushInterval = setInterval(() => this._flushStats(), 60_000);
  }

  _pollWindow() {
    let win = null;
    if (os.platform() === "darwin") win = getActiveWindowMac();
    else if (os.platform() === "win32") win = getActiveWindowWin32();

    if (!win) return;

    const { name, title } = win;
    const category = categorize(name);

    if (this.lastActiveApp !== name) {
      if (this.lastActiveApp && this.appFocusStart) {
        const duration = Math.round((Date.now() - this.appFocusStart) / 1000);
        this._emitEvent("app_blur", {
          app_name: this.lastActiveApp,
          duration_sec: duration,
        });
      }
      this._emitEvent("app_focus", {
        app_name: name,
        window_title: title,
        app_category: category,
      });
      this.lastActiveApp = name;
      this.appFocusStart = Date.now();
    }

    // Any window switch counts as activity
    this._lastActivity = Date.now();
    if (this.isIdle) {
      this.isIdle = false;
      this._emitEvent("idle_end");
      this._activeStart = Date.now();
      console.log("[tracker] Active again");
    }
  }

  _checkIdle() {
    const threshold = this.config.activity?.idle_threshold_sec ?? 60;

    // Use native OS idle time (ioreg on macOS, GetLastInputInfo on Windows)
    let idleSec = 0;
    try { idleSec = getIdleSeconds(); } catch {}

    // Fallback to our own timer if native API fails
    if (idleSec === 0) {
      idleSec = Math.round((Date.now() - this._lastActivity) / 1000);
    } else {
      // Update last activity if native idle is < threshold
      if (idleSec < threshold) this._lastActivity = Date.now();
    }

    if (!this.isIdle && idleSec >= threshold) {
      this.isIdle = true;
      const activeSec = Math.round((Date.now() - this._activeStart) / 1000);
      this.dailyActiveSec += activeSec;
      this._emitEvent("idle_start");
      console.log(`[tracker] Idle detected (${idleSec}s, native OS measurement)`);
    } else if (this.isIdle && idleSec < threshold) {
      this.isIdle = false;
      this._emitEvent("idle_end");
      this._activeStart = Date.now();
      console.log("[tracker] Active again");
      this.dailyIdleSec += 5;
    } else if (this.isIdle) {
      this.dailyIdleSec += 5;
    } else {
      this.dailyActiveSec += 5;
    }
  }

  _emitEvent(eventType, extra = {}) {
    const event = {
      ts: new Date().toISOString(),
      event_type: eventType,
      ...extra,
    };
    this.db.addEvent(event);
    if (eventType !== "app_focus" && eventType !== "app_blur") {
      console.log(`[tracker] Event: ${eventType}`, extra.app_name || "");
    }
  }

  _flushStats() {
    const events = this.db.flushEvents();
    const today = new Date().toISOString().slice(0, 10);
    this.emit("flush", { events, date: today, activeSec: this.dailyActiveSec, idleSec: this.dailyIdleSec });
  }

  stop() {
    this._emitEvent("session_end");
    if (this._pollInterval) clearInterval(this._pollInterval);
    if (this._idleCheckInterval) clearInterval(this._idleCheckInterval);
    if (this._statsFlushInterval) clearInterval(this._statsFlushInterval);
    this._flushStats();
  }
}

module.exports = { ActivityTracker, categorize };
