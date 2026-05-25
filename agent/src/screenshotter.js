const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const FormData = require("form-data");
const { getDataDir } = require("./config");

class Screenshotter {
  constructor(config, uploader) {
    this.config = config;
    this.uploader = uploader;
    this._interval = null;
    this._dir = path.join(getDataDir(), "buffer", "screenshots");
    fs.mkdirSync(this._dir, { recursive: true });
  }

  start() {
    const intervalMin = this.config.activity?.screenshot_interval_min ?? 5;
    if (intervalMin <= 0) return;
    console.log(`[screenshotter] Taking screenshot every ${intervalMin} min`);
    // First screenshot after 15s, then on interval
    setTimeout(() => this._capture(), 15_000);
    this._interval = setInterval(() => this._capture(), intervalMin * 60 * 1000);
  }

  async _capture() {
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const outPath = path.join(this._dir, `${ts}.jpg`);
    const currentPath = path.join(this._dir, "current.jpg");

    try {
      if (os.platform() === "darwin") {
        // -x: no sound, -t jpg: format, -m: main screen only
        execSync(`screencapture -x -t jpg -m "${outPath}"`, { timeout: 5000 });
      } else if (os.platform() === "win32") {
        const { findFfmpeg } = require("./ffmpeg");
        const bin = findFfmpeg();
        execSync(`"${bin}" -y -f gdigrab -i desktop -vframes 1 -vf scale=1280:-1 -q:v 5 "${outPath}"`, { timeout: 10000 });
      } else {
        execSync(`import -window root -resize 1280x "${outPath}"`, { timeout: 5000 });
      }

      if (!fs.existsSync(outPath)) return;
      const stat = fs.statSync(outPath);
      if (stat.size < 1000) { fs.unlinkSync(outPath); return; }

      // Copy as current.jpg (live screenshot)
      fs.copyFileSync(outPath, currentPath);

      // Upload current.jpg to server → stored in MinIO as live_screenshots/{employee_id}/current.jpg
      await this._uploadLive(currentPath);

      // Keep only last 5 historical screenshots
      this._cleanOld();

      console.log(`[screenshotter] ${path.basename(outPath)} (${(stat.size / 1024).toFixed(0)} KB)`);
    } catch (e) {
      // Best-effort — don't crash agent
    }
  }

  async _uploadLive(filePath) {
    try {
      const form = new FormData();
      form.append("file", fs.createReadStream(filePath), {
        filename: "current.jpg",
        contentType: "image/jpeg",
      });
      await this.uploader.client.post("/api/v1/screenshot/upload", form, {
        headers: form.getHeaders(),
        timeout: 30_000,
      });
    } catch {
      // Non-critical
    }
  }

  _cleanOld() {
    try {
      const files = fs.readdirSync(this._dir)
        .filter((f) => f.endsWith(".jpg") && f !== "current.jpg")
        .map((f) => ({ name: f, time: fs.statSync(path.join(this._dir, f)).mtimeMs }))
        .sort((a, b) => b.time - a.time);
      files.slice(5).forEach(({ name }) => {
        try { fs.unlinkSync(path.join(this._dir, name)); } catch {}
      });
    } catch {}
  }

  stop() {
    if (this._interval) clearInterval(this._interval);
  }
}

module.exports = { Screenshotter };
