import hashlib
import io
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Optional


def compute_sha256(file_path: str) -> str:
    h = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def generate_thumbnail(video_path: str, output_path: str, timestamp: str = "00:00:02") -> bool:
    # First try at 2s, fall back to very first frame if video is short
    for ts in [timestamp, "00:00:00"]:
        cmd = [
            "ffmpeg", "-y",
            "-ss", ts,
            "-i", video_path,
            "-vframes", "1",
            "-vf", "scale=320:-1",
            "-q:v", "3",
            output_path,
        ]
        result = subprocess.run(cmd, capture_output=True, timeout=60)
        if result.returncode == 0 and os.path.exists(output_path):
            return True
    return False


def remux_to_standard_mp4(input_path: str, output_path: str) -> bool:
    """Re-mux fragmented/broken MP4 to standard MP4 with faststart."""
    cmd = [
        "ffmpeg", "-y",
        "-i", input_path,
        "-c", "copy",
        "-movflags", "+faststart",
        output_path,
    ]
    result = subprocess.run(cmd, capture_output=True, timeout=300)
    return result.returncode == 0 and os.path.exists(output_path)


def convert_to_hls(video_path: str, output_dir: str, segment_duration: int = 10) -> Optional[str]:
    """Convert MP4 to HLS playlist. Returns path to .m3u8 or None on failure."""
    os.makedirs(output_dir, exist_ok=True)
    playlist_path = os.path.join(output_dir, "playlist.m3u8")

    # First try direct HLS conversion
    cmd = [
        "ffmpeg", "-y",
        "-i", video_path,
        "-c:v", "copy",
        "-hls_time", str(segment_duration),
        "-hls_list_size", "0",
        "-hls_segment_filename", os.path.join(output_dir, "seg%03d.ts"),
        "-hls_flags", "independent_segments",
        playlist_path,
    ]
    result = subprocess.run(cmd, capture_output=True, timeout=600)
    if result.returncode == 0 and os.path.exists(playlist_path):
        return playlist_path

    # If direct conversion failed (fragmented MP4), re-encode to H.264 baseline
    import logging
    logging.getLogger(__name__).warning("Direct HLS failed, trying re-encode...")
    cmd_reencode = [
        "ffmpeg", "-y",
        "-i", video_path,
        "-c:v", "libx264",
        "-profile:v", "baseline",
        "-level", "3.0",
        "-hls_time", str(segment_duration),
        "-hls_list_size", "0",
        "-hls_segment_filename", os.path.join(output_dir, "seg%03d.ts"),
        "-hls_flags", "independent_segments",
        playlist_path,
    ]
    result2 = subprocess.run(cmd_reencode, capture_output=True, timeout=600)
    if result2.returncode == 0 and os.path.exists(playlist_path):
        return playlist_path
    return None


def get_video_duration(video_path: str) -> Optional[int]:
    cmd = [
        "ffprobe", "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        video_path,
    ]
    result = subprocess.run(cmd, capture_output=True, timeout=30)
    if result.returncode != 0:
        return None
    import json
    data = json.loads(result.stdout)
    duration = data.get("format", {}).get("duration")
    return int(float(duration)) if duration else None
