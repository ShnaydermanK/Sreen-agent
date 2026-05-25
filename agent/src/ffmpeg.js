const { execSync, spawnSync } = require("child_process");
const os = require("os");

// Find ffmpeg binary
function findFfmpeg() {
  const candidates = [
    "/opt/homebrew/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
    "ffmpeg",
    "C:\\ffmpeg\\bin\\ffmpeg.exe",
  ];
  for (const c of candidates) {
    try { spawnSync(c, ["-version"], { stdio: "ignore" }); return c; } catch {}
  }
  throw new Error("ffmpeg not found. Install via: brew install ffmpeg");
}

// Detect available hardware encoders
function detectHardwareEncoder(ffmpegBin) {
  try {
    const result = spawnSync(ffmpegBin, ["-encoders"], {
      encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"],
    });
    const out = result.stdout || "";
    if (/hevc_videotoolbox/.test(out)) return { codec: "hevc_videotoolbox", label: "Apple VideoToolbox H.265" };
    if (/h264_videotoolbox/.test(out)) return { codec: "h264_videotoolbox", label: "Apple VideoToolbox H.264" };
    if (/hevc_nvenc/.test(out))        return { codec: "hevc_nvenc",        label: "NVIDIA NVENC H.265" };
    if (/h264_nvenc/.test(out))        return { codec: "h264_nvenc",        label: "NVIDIA NVENC H.264" };
    if (/hevc_amf/.test(out))          return { codec: "hevc_amf",          label: "AMD AMF H.265" };
    if (/hevc_qsv/.test(out))          return { codec: "hevc_qsv",          label: "Intel QuickSync H.265" };
    if (/h264_qsv/.test(out))          return { codec: "h264_qsv",          label: "Intel QuickSync H.264" };
  } catch {}
  return null;
}

function detectScreenDevice(ffmpegBin) {
  try {
    const result = spawnSync(ffmpegBin, ["-f", "avfoundation", "-list_devices", "true", "-i", ""], {
      encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"],
    });
    const output = result.stderr || result.stdout || "";
    for (const line of output.split("\n")) {
      const match = line.match(/\[(\d+)\]\s+Capture screen/i);
      if (match) return match[1];
    }
    const videoLines = output.split("\n").filter((l) => /\[\d+\]/.test(l) && !l.includes("audio"));
    const last = videoLines[videoLines.length - 1];
    if (last) { const m = last.match(/\[(\d+)\]/); if (m) return m[1]; }
  } catch (e) { console.warn("[ffmpeg] Device detection failed:", e.message); }
  return "1";
}

function buildCaptureArgs(ffmpegBin, config) {
  const {
    fps = 5,
    resolution = "1280x720",
    codec = "auto",   // "auto" = detect hardware, "libx264" = software
    crf = 30,
  } = config.recording || {};
  const [width, height] = resolution.split("x");
  const platform = os.platform();

  // ── Input ──
  let inputArgs = [];
  if (platform === "darwin") {
    const screenIdx = detectScreenDevice(ffmpegBin);
    inputArgs = ["-f", "avfoundation", "-framerate", String(fps), "-capture_cursor", "1", "-i", `${screenIdx}:none`];
  } else if (platform === "win32") {
    inputArgs = ["-f", "gdigrab", "-framerate", String(fps), "-draw_mouse", "1", "-i", "desktop"];
  } else {
    inputArgs = ["-f", "x11grab", "-framerate", String(fps), "-video_size", `${width}x${height}`, "-i", process.env.DISPLAY || ":0.0"];
  }

  // ── Codec selection ──
  let selectedCodec = codec;
  let presetArgs = [];
  let pixFmt = "yuv420p";

  if (codec === "auto") {
    const hw = detectHardwareEncoder(ffmpegBin);
    if (hw) {
      console.log(`[ffmpeg] Using hardware encoder: ${hw.label}`);
      selectedCodec = hw.codec;
      // Hardware encoders use different quality params
      if (hw.codec.includes("videotoolbox")) {
        presetArgs = ["-q:v", "50"];  // VideoToolbox quality 0-100
        pixFmt = "nv12";              // VideoToolbox prefers nv12
      } else if (hw.codec.includes("nvenc")) {
        presetArgs = ["-preset", "p4", "-rc", "vbr", "-cq", String(crf)];
      } else if (hw.codec.includes("qsv") || hw.codec.includes("amf")) {
        presetArgs = ["-preset", "fast", "-global_quality", String(crf)];
      }
    } else {
      console.log("[ffmpeg] No hardware encoder found, using libx264 (software)");
      selectedCodec = "libx264";
    }
  }

  if (selectedCodec === "libx264" || selectedCodec === "libx265") {
    presetArgs = ["-preset", "ultrafast", "-crf", String(crf)];
  }

  const encodeArgs = [
    "-vf", `fps=${fps},scale=${width}:${height}`,
    "-r", String(fps),
    "-c:v", selectedCodec,
    ...presetArgs,
    "-pix_fmt", pixFmt,
    "-g", String(fps * 10),
    "-movflags", "empty_moov+frag_keyframe+default_base_moof",
  ];

  return { inputArgs, encodeArgs, selectedCodec };
}

module.exports = { findFfmpeg, detectScreenDevice, detectHardwareEncoder, buildCaptureArgs };
