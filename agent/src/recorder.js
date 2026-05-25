const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { EventEmitter } = require("events");
const { getDataDir } = require("./config");
const { findFfmpeg, buildCaptureArgs } = require("./ffmpeg");

class Recorder extends EventEmitter {
  constructor(config, db) {
    super();
    this.config = config;
    this.db = db;
    this.status = "stopped";
    this.ffmpegProc = null;
    this.currentSegmentStart = null;
    this.bufferDir = path.join(getDataDir(), "buffer", "video");
    this.ffmpegBin = null;
    this._watchInterval = null;
    this._seenFiles = new Set();
    this._segmentPattern = null;
  }

  async init() {
    try {
      this.ffmpegBin = findFfmpeg();
      console.log("[recorder] Using ffmpeg:", this.ffmpegBin);
    } catch (e) {
      console.error("[recorder] " + e.message);
      this.emit("error", e.message);
      return false;
    }
    fs.mkdirSync(this.bufferDir, { recursive: true });
    return true;
  }

  start() {
    if (!this.config.recording?.enabled) {
      console.log("[recorder] Recording disabled by config");
      return;
    }
    if (!this.ffmpegBin) {
      console.error("[recorder] ffmpeg not initialized — call init() first");
      return;
    }
    this._startFfmpegSegmented();
  }

  _startFfmpegSegmented() {
    this.currentSegmentStart = new Date();
    const ts = this.currentSegmentStart.toISOString().replace(/[:.]/g, "-").slice(0, 19);
    // ffmpeg segment pattern: segment_TIMESTAMP_%03d.mp4
    this._segmentPattern = path.join(this.bufferDir, `seg_${ts}_%04d.mp4`);

    const { inputArgs, encodeArgs } = buildCaptureArgs(this.ffmpegBin, this.config);
    const segSec = (this.config.recording?.segment_duration_min ?? 30) * 60;

    const args = [
      ...inputArgs,
      ...encodeArgs,
      // Use ffmpeg native segmentation — each file is properly finalized
      "-f", "segment",
      "-segment_time", String(segSec),
      "-reset_timestamps", "1",
      "-strftime", "0",
      this._segmentPattern,
    ];

    console.log("[recorder] Starting segmented recording:", path.basename(this._segmentPattern));
    console.log("[recorder]", this.ffmpegBin, args.slice(0, 6).join(" "), "...");

    this.ffmpegProc = spawn(this.ffmpegBin, args, { stdio: ["pipe", "ignore", "pipe"] });
    this.status = "recording";
    this.emit("status", "recording");

    this.ffmpegProc.stderr.on("data", (data) => {
      const line = data.toString();
      if (line.includes("frame=") && Math.random() < 0.1) {
        const m = line.match(/frame=\s*(\d+)/);
        if (m) process.stdout.write(`\r[recorder] Frames: ${m[1]}  `);
      }
    });

    this.ffmpegProc.on("close", (code) => {
      if (code !== 0 && code !== null && this.status === "recording") {
        console.error(`\n[recorder] ffmpeg exited with code ${code}`);
        console.error("[recorder] NOTE: macOS requires Screen Recording permission for Terminal");
        console.error("[recorder] System Settings → Privacy & Security → Screen Recording → enable Terminal");
        this.status = "error";
        this.emit("error", `ffmpeg exited with code ${code}`);
      } else if (code === 0 || this.status !== "recording") {
        console.log(`\n[recorder] ffmpeg stopped (code ${code})`);
      }
    });

    this.ffmpegProc.on("error", (err) => {
      console.error("[recorder] spawn error:", err.message);
      this.status = "error";
      this.emit("error", err.message);
    });

    // Watch for completed segment files (ffmpeg moves to next file after segment_time)
    this._watchInterval = setInterval(() => this._checkForCompletedSegments(), 5000);
  }

  _checkForCompletedSegments() {
    if (!this._segmentPattern) return;

    // Get all files matching our pattern
    const dir = path.dirname(this._segmentPattern);
    const prefix = path.basename(this._segmentPattern).split("%")[0];

    let files;
    try {
      files = fs.readdirSync(dir)
        .filter((f) => f.startsWith(prefix) && f.endsWith(".mp4"))
        .map((f) => path.join(dir, f))
        .sort();
    } catch {
      return;
    }

    if (files.length === 0) return;

    // The LAST file is the one currently being written
    // All previous files are complete segments
    const completedFiles = files.slice(0, -1);

    for (const filePath of completedFiles) {
      if (this._seenFiles.has(filePath)) continue;
      this._seenFiles.add(filePath);

      const stat = fs.statSync(filePath);
      if (stat.size < 10_000) {
        console.warn(`\n[recorder] Skipping tiny segment ${path.basename(filePath)} (${stat.size} bytes)`);
        continue;
      }

      const segNum = parseInt(path.basename(filePath).match(/_(\d+)\.mp4$/)?.[1] ?? "0");
      const segDurationMs = (this.config.recording?.segment_duration_min ?? 30) * 60 * 1000;
      const startedAt = new Date(this.currentSegmentStart.getTime() + segNum * segDurationMs);
      const endedAt = new Date(startedAt.getTime() + segDurationMs);

      console.log(`\n[recorder] Completed segment: ${path.basename(filePath)} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
      this.db.addSegment(filePath, {
        started_at: startedAt.toISOString(),
        ended_at: endedAt.toISOString(),
        monitor_index: 0,
        resolution: this.config.recording?.resolution,
        fps: this.config.recording?.fps,
        codec: "h264",
      });
      this.emit("segment-ready", filePath);
    }
  }

  async stop() {
    if (this.status === "stopped") return;
    this.status = "stopped";

    if (this._watchInterval) {
      clearInterval(this._watchInterval);
      this._watchInterval = null;
    }

    if (this.ffmpegProc) {
      const proc = this.ffmpegProc;
      this.ffmpegProc = null;

      console.log("\n[recorder] Stopping ffmpeg (fragmented MP4 — SIGKILL safe)...");
      await new Promise((resolve) => {
        proc.once("close", resolve);
        // Fragmented MP4: each fragment is self-contained, SIGKILL is safe
        try { proc.kill("SIGKILL"); } catch {}
        setTimeout(resolve, 3000); // fallback
      });
      console.log("[recorder] ffmpeg stopped");
    }

    // Enqueue the final (potentially partial) segment
    this._finalizeLastSegment();
    this.emit("status", "stopped");
  }

  _finalizeLastSegment() {
    if (!this._segmentPattern) return;

    const dir = path.dirname(this._segmentPattern);
    const prefix = path.basename(this._segmentPattern).split("%")[0];

    let files;
    try {
      files = fs.readdirSync(dir)
        .filter((f) => f.startsWith(prefix) && f.endsWith(".mp4"))
        .map((f) => path.join(dir, f))
        .sort();
    } catch { return; }

    // Queue all unseen files (including the last partial one)
    for (const filePath of files) {
      if (this._seenFiles.has(filePath)) continue;
      this._seenFiles.add(filePath);

      const stat = fs.statSync(filePath);
      if (stat.size < 10_000) continue;

      const segNum = parseInt(path.basename(filePath).match(/_(\d+)\.mp4$/)?.[1] ?? "0");
      const segDurationMs = (this.config.recording?.segment_duration_min ?? 30) * 60 * 1000;
      const startedAt = new Date(this.currentSegmentStart.getTime() + segNum * segDurationMs);
      const endedAt = new Date();

      console.log(`[recorder] Final segment: ${path.basename(filePath)} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
      this.db.addSegment(filePath, {
        started_at: startedAt.toISOString(),
        ended_at: endedAt.toISOString(),
        monitor_index: 0,
        resolution: this.config.recording?.resolution,
        fps: this.config.recording?.fps,
        codec: "h264",
      });
      this.emit("segment-ready", filePath);
    }
  }

  pause() { return this.stop(); }
  resume() { this.start(); }
  getStatus() { return this.status; }
}

module.exports = { Recorder };
