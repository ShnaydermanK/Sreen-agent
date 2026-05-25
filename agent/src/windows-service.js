/**
 * Windows Service wrapper for Screen Agent.
 * Registers/unregisters the agent as a Windows Service using node-windows.
 *
 * Usage:
 *   node src/windows-service.js install    — install & start service
 *   node src/windows-service.js uninstall  — stop & remove service
 *   node src/windows-service.js status     — show service status
 */

const path = require("path");
const { execSync, spawnSync } = require("child_process");
const fs = require("fs");

const SERVICE_NAME = "ScreenAgent";
const SERVICE_DISPLAY = "Screen Agent — Monitoring Service";
const SERVICE_DESC = "Captures screen activity and uploads to Screen Agent server";
const AGENT_SCRIPT = path.resolve(__dirname, "../run-agent.js");
const CONFIG_PATH = path.resolve(__dirname, "../config.json");

// Find node.exe path
function findNode() {
  try {
    const result = spawnSync("where", ["node"], { encoding: "utf-8", shell: true });
    return result.stdout.trim().split("\n")[0].trim();
  } catch {
    return process.execPath; // use current node
  }
}

function install() {
  const nodePath = findNode();
  console.log(`[service] Node.js: ${nodePath}`);
  console.log(`[service] Script: ${AGENT_SCRIPT}`);

  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`[service] ERROR: config.json not found at ${CONFIG_PATH}`);
    console.error("  Create config.json with server_url and agent_token first.");
    process.exit(1);
  }

  // Use sc.exe to create the service
  // We wrap node.js in a cmd /c to handle path properly
  const binPath = `"${nodePath}" "${AGENT_SCRIPT}"`;

  try {
    // Stop and delete existing service if present
    spawnSync("sc", ["stop", SERVICE_NAME], { shell: true, stdio: "ignore" });
    spawnSync("sc", ["delete", SERVICE_NAME], { shell: true, stdio: "ignore" });
    // Small delay for sc to process
    spawnSync("timeout", ["/t", "2", "/nobreak"], { shell: true, stdio: "ignore" });
  } catch {}

  // Create service
  const createResult = spawnSync("sc", [
    "create", SERVICE_NAME,
    "binPath=", `cmd /c "${nodePath}" "${AGENT_SCRIPT}"`,
    "start=", "auto",
    "DisplayName=", SERVICE_DISPLAY,
  ], { shell: true, encoding: "utf-8" });

  if (createResult.status !== 0) {
    console.error("[service] sc create failed:", createResult.stderr || createResult.stdout);
    console.error("  Run this script as Administrator.");
    process.exit(1);
  }

  // Set description
  spawnSync("sc", ["description", SERVICE_NAME, SERVICE_DESC], { shell: true });

  // Set recovery: restart on failure (3 times, 60s delay)
  spawnSync("sc", ["failure", SERVICE_NAME, "reset=", "86400", "actions=", "restart/60000/restart/60000/restart/60000"], { shell: true });

  // Start service
  const startResult = spawnSync("sc", ["start", SERVICE_NAME], { shell: true, encoding: "utf-8" });
  if (startResult.status === 0) {
    console.log(`\n✅ Service '${SERVICE_NAME}' installed and started successfully.`);
    console.log(`   To check status: sc query ${SERVICE_NAME}`);
    console.log(`   To stop:         sc stop ${SERVICE_NAME}`);
  } else {
    console.log(`\n⚠️  Service created but could not start. Check config.json and logs.`);
    console.log(`   Start manually: sc start ${SERVICE_NAME}`);
  }
}

function uninstall() {
  console.log(`[service] Stopping service '${SERVICE_NAME}'...`);
  spawnSync("sc", ["stop", SERVICE_NAME], { shell: true, stdio: "inherit" });
  spawnSync("timeout", ["/t", "3", "/nobreak"], { shell: true, stdio: "ignore" });
  console.log(`[service] Deleting service '${SERVICE_NAME}'...`);
  const result = spawnSync("sc", ["delete", SERVICE_NAME], { shell: true, encoding: "utf-8" });
  if (result.status === 0) {
    console.log(`✅ Service '${SERVICE_NAME}' removed.`);
  } else {
    console.error("Failed:", result.stderr || result.stdout);
  }
}

function status() {
  const result = spawnSync("sc", ["query", SERVICE_NAME], { shell: true, encoding: "utf-8" });
  console.log(result.stdout || result.stderr);
}

const cmd = process.argv[2];
if (cmd === "install")   install();
else if (cmd === "uninstall") uninstall();
else if (cmd === "status")    status();
else {
  console.log("Usage: node src/windows-service.js [install|uninstall|status]");
  process.exit(1);
}
