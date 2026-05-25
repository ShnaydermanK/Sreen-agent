const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");
const os = require("os");

const RETRY_DELAYS_SEC = [5, 15, 30, 60, 120];

class Uploader {
  constructor(config, db) {
    this.config = config;
    this.db = db;
    this.client = axios.create({
      baseURL: config.server_url,
      headers: { "X-Agent-Token": config.agent_token },
      timeout: 30_000,
    });
    this._uploadInterval = null;
    this._hostname = os.hostname();
    this._version = require("../package.json").version;
    this._processing = false;
  }

  start() {
    // Run queue immediately and then every 30s
    this._processQueue();
    this._uploadInterval = setInterval(() => this._processQueue(), 30_000);
    console.log("[uploader] Started, server:", this.config.server_url);
  }

  stop() {
    if (this._uploadInterval) {
      clearInterval(this._uploadInterval);
    }
  }

  async sendHeartbeat(status = "recording") {
    try {
      const res = await this.client.post("/api/v1/agent/heartbeat", {
        hostname: this._hostname,
        agent_version: this._version,
        status,
      });
      console.log("[uploader] Heartbeat OK:", status);
      return true;
    } catch (e) {
      console.warn("[uploader] Heartbeat failed:", e.response?.data?.detail || e.message);
      return false;
    }
  }

  async sendStats(events, date, activeTimeSec = 0, idleTimeSec = 0) {
    if (!events.length) return;
    try {
      await this.client.post("/api/v1/stats/push", {
        events,
        date,
        active_time_sec: activeTimeSec,
        idle_time_sec: idleTimeSec,
      });
      console.log(`[uploader] Stats sent: ${events.length} events`);
    } catch (e) {
      console.warn("[uploader] Stats push failed:", e.message);
      // Re-buffer events
      for (const ev of events) this.db.addEvent(ev);
    }
  }

  async _processQueue() {
    if (this._processing) return;
    this._processing = true;

    try {
      const segments = this.db.getPendingSegments();
      if (segments.length > 0) {
        console.log(`[uploader] Queue: ${segments.length} segment(s) to upload`);
      }

      for (const seg of segments) {
        if (!fs.existsSync(seg.filePath)) {
          console.warn("[uploader] File missing, skipping:", seg.filePath);
          this.db.markSegmentUploaded(seg.id);
          continue;
        }

        const success = await this._uploadWithRetry(seg);
        if (success) {
          this.db.markSegmentUploaded(seg.id);
          try {
            fs.unlinkSync(seg.filePath);
            console.log("[uploader] Local file deleted after upload");
          } catch {}
        }
      }
    } finally {
      this._processing = false;
    }
  }

  async _uploadWithRetry(seg, attempt = 0) {
    try {
      const fileSize = fs.statSync(seg.filePath).size;
      const filename = path.basename(seg.filePath);
      console.log(`[uploader] Uploading ${filename} (${(fileSize / 1024 / 1024).toFixed(1)} MB)...`);

      const form = new FormData();
      form.append("file", fs.createReadStream(seg.filePath), {
        filename,
        contentType: "video/mp4",
        knownLength: fileSize,
      });
      form.append("started_at", seg.metadata.started_at);
      if (seg.metadata.ended_at) form.append("ended_at", seg.metadata.ended_at);
      form.append("monitor_index", String(seg.metadata.monitor_index ?? 0));
      if (seg.metadata.resolution) form.append("resolution", seg.metadata.resolution);
      if (seg.metadata.fps) form.append("fps", String(seg.metadata.fps));
      if (seg.metadata.codec) form.append("codec", seg.metadata.codec);

      const response = await this.client.post("/api/v1/upload/video", form, {
        headers: form.getHeaders(),
        timeout: 600_000,    // 10 min for large files
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        onUploadProgress: (e) => {
          if (e.total) {
            const pct = Math.round((e.loaded / e.total) * 100);
            process.stdout.write(`\r[uploader] Upload progress: ${pct}%  `);
          }
        },
      });

      console.log(`\n[uploader] ✓ Uploaded segment_id=${response.data.segment_id}`);
      return true;

    } catch (e) {
      const status = e.response?.status;
      const detail = e.response?.data?.detail || e.message;
      console.error(`\n[uploader] Upload failed (attempt ${attempt + 1}): ${status ? `HTTP ${status}` : ""} ${detail}`);

      if (attempt < RETRY_DELAYS_SEC.length - 1) {
        const delay = RETRY_DELAYS_SEC[attempt];
        console.log(`[uploader] Retrying in ${delay}s...`);
        await new Promise((r) => setTimeout(r, delay * 1000));
        return this._uploadWithRetry(seg, attempt + 1);
      }

      console.error("[uploader] Max retries reached, keeping in queue for next cycle");
      return false;
    }
  }

  getPendingCount() {
    return this.db.countPending();
  }
}

module.exports = { Uploader };
