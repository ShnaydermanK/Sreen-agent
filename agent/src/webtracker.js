/**
 * Web activity tracker — extracts current domain from active browser tab.
 * macOS: uses AppleScript to query Chrome/Safari/Firefox.
 * Windows: reads window title (URL sometimes visible).
 */
const { execSync } = require("child_process");
const os = require("os");

const WEB_CATEGORIES = {
  work: ["gmail", "google.com/mail", "calendar.google", "notion.so", "jira", "confluence", "slack.com", "teams.microsoft", "zoom.us"],
  social: ["facebook.com", "instagram.com", "vk.com", "twitter.com", "x.com", "tiktok.com", "youtube.com"],
  news: ["news.", "rbc.ru", "lenta.ru", "tass.ru", "ria.ru", "cnews.ru"],
  shopping: ["ozon.ru", "wildberries.ru", "amazon", "aliexpress"],
  dev: ["github.com", "stackoverflow.com", "docs.", "developer.", "npmjs.com", "pypi.org"],
};

function categorizeUrl(domain) {
  const d = domain.toLowerCase();
  for (const [cat, patterns] of Object.entries(WEB_CATEGORIES)) {
    if (patterns.some((p) => d.includes(p))) return cat;
  }
  return "other";
}

function extractDomain(url) {
  try {
    const u = url.startsWith("http") ? new URL(url) : new URL("https://" + url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url.split("/")[0];
  }
}

function getActiveBrowserTabMac() {
  const browsers = [
    // Chrome
    `tell application "Google Chrome"
      if it is running then
        set t to URL of active tab of front window
        return t
      end if
    end tell`,
    // Safari
    `tell application "Safari"
      if it is running then
        set t to URL of current tab of front window
        return t
      end if
    end tell`,
    // Firefox (via window title — less reliable)
    `tell application "Firefox"
      if it is running then
        set t to name of front window
        return t
      end if
    end tell`,
  ];

  for (const script of browsers) {
    try {
      const result = execSync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, {
        encoding: "utf-8",
        timeout: 2000,
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (result && result.length > 3 && result !== "missing value") {
        return result;
      }
    } catch {}
  }
  return null;
}

function getActiveBrowserTabWin32() {
  // Windows: try to get URL from browser window title or accessibility API
  // Simplified: just return null (full implementation needs native addon)
  return null;
}

function getActiveBrowserUrl() {
  try {
    if (os.platform() === "darwin") return getActiveBrowserTabMac();
    if (os.platform() === "win32") return getActiveBrowserTabWin32();
  } catch {}
  return null;
}

class WebTracker {
  constructor(config, db) {
    this.config = config;
    this.db = db;
    this._interval = null;
    this._lastDomain = null;
    this._domainStart = null;
  }

  start() {
    if (!this.config.activity?.track_web_domains) return;
    console.log("[webtracker] Starting web domain tracking");
    this._interval = setInterval(() => this._poll(), 5000);
  }

  _poll() {
    const url = getActiveBrowserUrl();
    if (!url) return;

    const domain = extractDomain(url);
    const category = categorizeUrl(domain);

    if (domain !== this._lastDomain) {
      // Flush previous domain
      if (this._lastDomain && this._domainStart) {
        const duration = Math.round((Date.now() - this._domainStart) / 1000);
        if (duration > 3) {
          this.db.addEvent({
            ts: new Date().toISOString(),
            event_type: "app_blur",
            app_name: this._lastDomain,
            window_title: this._lastDomain,
            app_category: "browser_" + categorizeUrl(this._lastDomain),
            duration_sec: duration,
          });
        }
      }

      this.db.addEvent({
        ts: new Date().toISOString(),
        event_type: "app_focus",
        app_name: domain,
        window_title: url.slice(0, 200),
        app_category: "browser_" + category,
        duration_sec: null,
      });

      this._lastDomain = domain;
      this._domainStart = Date.now();
    }
  }

  stop() {
    if (this._interval) clearInterval(this._interval);
    // Flush last domain
    if (this._lastDomain && this._domainStart) {
      const duration = Math.round((Date.now() - this._domainStart) / 1000);
      if (duration > 3) {
        this.db.addEvent({
          ts: new Date().toISOString(),
          event_type: "app_blur",
          app_name: this._lastDomain,
          window_title: this._lastDomain,
          app_category: "browser_" + categorizeUrl(this._lastDomain),
          duration_sec: duration,
        });
      }
    }
  }
}

module.exports = { WebTracker, getActiveBrowserUrl, extractDomain, categorizeUrl };
