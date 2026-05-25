#!/usr/bin/env node
/**
 * Screen Agent — standalone runner (no Electron required)
 * Usage: node run-agent.js
 *
 * Requires config.json in the same directory:
 * {
 *   "server_url": "http://localhost:8000",
 *   "agent_token": "your-token-here"
 * }
 *
 * macOS: Terminal must have Screen Recording permission
 * System Preferences → Privacy & Security → Screen Recording → enable Terminal
 */

const fs = require("fs");
const path = require("path");

// ── Load config ─────────────────────────────────────────────────────────────
const { loadConfig } = require("./src/config");
const config = loadConfig();

if (!config.agent_token) {
  console.error("❌ agent_token not set in config.json");
  console.error("   Copy the token from seed.py output or Admin Panel → Employees → New token");
  console.error("   Example config.json:\n" + JSON.stringify({
    server_url: "http://localhost:8000",
    agent_token: "YOUR_TOKEN_HERE",
    recording: { enabled: true, fps: 5, segment_duration_min: 1 }
  }, null, 2));
  process.exit(1);
}

console.log("╔════════════════════════════════════╗");
console.log("║       Screen Agent v1.0.0          ║");
console.log("╚════════════════════════════════════╝");
console.log("Server:", config.server_url);
console.log("Token: ", config.agent_token.slice(0, 8) + "...");
console.log("FPS:   ", config.recording?.fps ?? 5);
console.log("Segment:", (config.recording?.segment_duration_min ?? 1), "min");
console.log("");

// ── Bootstrap ────────────────────────────────────────────────────────────────
const { DB } = require("./src/db");
const { Recorder } = require("./src/recorder");
const { Uploader } = require("./src/uploader");
const { ActivityTracker } = require("./src/tracker");
const { Screenshotter } = require("./src/screenshotter");
const { WebTracker } = require("./src/webtracker");
const { Updater } = require("./src/updater");

const db = new DB();
const uploader = new Uploader(config, db);
const recorder = new Recorder(config, db);
const tracker = new ActivityTracker(config, db);
const screenshotter = new Screenshotter(config, uploader);
const webTracker = new WebTracker(config, db);
const updater = new Updater(config);

// ── Wire events ───────────────────────────────────────────────────────────────
recorder.on("segment-ready", (filePath) => {
  console.log("[agent] New segment queued for upload");
  uploader._processQueue(); // trigger upload immediately
});

recorder.on("error", (msg) => {
  console.error("[agent] Recorder error:", msg);
});

tracker.on("flush", async ({ events, date, activeSec, idleSec }) => {
  await uploader.sendStats(events, date, activeSec, idleSec);
});

// ── Start ─────────────────────────────────────────────────────────────────────
async function main() {
  // Init recorder (finds ffmpeg, detects screen device)
  const recorderOk = await recorder.init();
  if (!recorderOk) {
    console.error("[agent] Failed to initialize recorder");
    process.exit(1);
  }

  // Start uploader (connects to server)
  uploader.start();

  // Send first heartbeat — verify token is valid
  console.log("[agent] Checking server connection...");
  const heartbeatOk = await uploader.sendHeartbeat("online");
  if (!heartbeatOk) {
    console.error("[agent] Cannot connect to server. Check server_url and agent_token in config.json");
    console.error("         Make sure backend is running: docker compose up -d");
    process.exit(1);
  }

  // Start screen recording
  console.log("\n[agent] Starting screen recording...");
  console.log("[agent] NOTE: macOS requires Screen Recording permission for Terminal");
  console.log("[agent] If recording fails, go to: System Preferences → Privacy → Screen Recording");
  recorder.start();

  // Start activity tracking
  tracker.start();

  // Start periodic screenshots
  screenshotter.start();

  // Start web activity tracking (if enabled in policy)
  webTracker.start();

  // Start auto-updater (checks every 4h)
  updater.start();

  // Heartbeat every 30s
  setInterval(() => uploader.sendHeartbeat(recorder.getStatus()), 30_000);

  console.log("\n[agent] Running. Press Ctrl+C to stop.\n");
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────
async function shutdown() {
  if (shutdown._running) return;
  shutdown._running = true;
  console.log("\n[agent] Shutting down gracefully (waiting for ffmpeg to finalize)...");

  screenshotter.stop();
  webTracker.stop();
  updater.stop();
  await recorder.stop();
  tracker.stop();

  // Give uploader time to finish the last segment upload (wait up to 5 min)
  console.log("[agent] Uploading final segment...");
  uploader._uploadTimeout = 300_000;
  await uploader._processQueue();
  uploader.stop();

  console.log("[agent] Done. Bye!");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch((e) => {
  console.error("[agent] Fatal error:", e);
  process.exit(1);
});
