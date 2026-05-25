/**
 * Auto-updater — checks server for new agent version.
 * If newer version available, downloads and schedules restart.
 */
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const os = require("os");
const { execSync } = require("child_process");

const CURRENT_VERSION = require("../package.json").version;

class Updater {
  constructor(config) {
    this.serverUrl = config.server_url;
    this.token = config.agent_token;
    this._interval = null;
  }

  start() {
    // Check every 4 hours
    this._interval = setInterval(() => this.checkForUpdates(), 4 * 60 * 60 * 1000);
    // First check after 5 min
    setTimeout(() => this.checkForUpdates(), 5 * 60 * 1000);
  }

  async checkForUpdates() {
    try {
      const info = await this._fetchJson(`${this.serverUrl}/api/v1/agent/version`);
      if (!info || !info.version) return;

      if (this._isNewer(info.version, CURRENT_VERSION)) {
        console.log(`[updater] New version available: ${info.version} (current: ${CURRENT_VERSION})`);
        if (info.download_url) {
          await this._downloadAndInstall(info.download_url, info.version);
        }
      } else {
        console.log(`[updater] Up to date (${CURRENT_VERSION})`);
      }
    } catch (e) {
      // Silently ignore update check failures
    }
  }

  _isNewer(remote, current) {
    const parse = (v) => v.replace(/[^0-9.]/g, "").split(".").map(Number);
    const r = parse(remote);
    const c = parse(current);
    for (let i = 0; i < 3; i++) {
      if ((r[i] || 0) > (c[i] || 0)) return true;
      if ((r[i] || 0) < (c[i] || 0)) return false;
    }
    return false;
  }

  async _downloadAndInstall(url, version) {
    const tmpPath = path.join(os.tmpdir(), `screen-agent-${version}.pkg`);
    console.log(`[updater] Downloading update to ${tmpPath}...`);

    await this._downloadFile(url, tmpPath);

    if (os.platform() === "darwin") {
      console.log("[updater] Installing .pkg (silent)...");
      execSync(`sudo installer -pkg "${tmpPath}" -target /`, { timeout: 120_000 });
      console.log("[updater] Update installed, will restart...");
      process.exit(0); // Watchdog/systemd will restart
    } else if (os.platform() === "win32") {
      console.log("[updater] Installing .msi (silent)...");
      execSync(`msiexec /i "${tmpPath}" /quiet /norestart`, { timeout: 120_000 });
      process.exit(0);
    }
  }

  _downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
      const proto = url.startsWith("https") ? https : http;
      const file = fs.createWriteStream(dest);
      proto.get(url, (res) => {
        res.pipe(file);
        file.on("finish", () => { file.close(); resolve(); });
      }).on("error", reject);
    });
  }

  _fetchJson(url) {
    return new Promise((resolve, reject) => {
      const proto = url.startsWith("https") ? https : http;
      const opts = new URL(url);
      opts.headers = { "X-Agent-Token": this.token };
      proto.get(opts, (res) => {
        let data = "";
        res.on("data", (c) => data += c);
        res.on("end", () => {
          try { resolve(JSON.parse(data)); } catch { resolve(null); }
        });
      }).on("error", reject);
    });
  }

  stop() {
    if (this._interval) clearInterval(this._interval);
  }
}

module.exports = { Updater, CURRENT_VERSION };
