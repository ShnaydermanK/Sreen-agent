/**
 * Native idle detection using OS APIs.
 * macOS: uses `ioreg` to read HIDIdleTime
 * Windows: uses GetLastInputInfo via PowerShell
 */
const { execSync } = require("child_process");
const os = require("os");

function getIdleSeconds() {
  try {
    if (os.platform() === "darwin") {
      return getIdleMac();
    } else if (os.platform() === "win32") {
      return getIdleWin32();
    }
  } catch {}
  return 0;
}

function getIdleMac() {
  const out = execSync(
    "ioreg -c IOHIDSystem | awk '/HIDIdleTime/ {print $NF/1000000000; exit}'",
    { encoding: "utf-8", timeout: 2000, stdio: ["ignore", "pipe", "ignore"] }
  ).trim();
  return parseFloat(out) || 0;
}

function getIdleWin32() {
  const out = execSync(
    `powershell -Command "Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class Idle{[DllImport(\\"user32.dll\\")]public static extern bool GetLastInputInfo(ref LASTINPUTINFO p);[StructLayout(LayoutKind.Sequential)]public struct LASTINPUTINFO{public uint cbSize;public uint dwTime;}public static uint GetIdleTime(){LASTINPUTINFO l=new LASTINPUTINFO();l.cbSize=(uint)System.Runtime.InteropServices.Marshal.SizeOf(l);GetLastInputInfo(ref l);return((uint)Environment.TickCount-l.dwTime)/1000;}}';[Idle]::GetIdleTime()"`,
    { encoding: "utf-8", timeout: 3000, stdio: ["ignore", "pipe", "ignore"] }
  ).trim();
  return parseInt(out) || 0;
}

module.exports = { getIdleSeconds };
