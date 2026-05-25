#!/bin/bash
# Generates all required icon files from a single 1024x1024 PNG.
# Usage: ./installer/generate-icons.sh path/to/source.png
# Requires: ImageMagick (brew install imagemagick), iconutil (macOS built-in)

set -e

SRC="${1:-assets/source.png}"
ASSETS_DIR="$(dirname "$0")/../assets"

if [ ! -f "$SRC" ]; then
  echo "Usage: $0 <source-1024x1024.png>"
  echo "ERROR: Source file not found: $SRC"
  exit 1
fi

echo "[icons] Generating from: $SRC"

# ── PNG (512×512) for Linux ───────────────────────────────────────────────────
convert "$SRC" -resize 512x512 "$ASSETS_DIR/icon.png"
echo "  ✓ icon.png"

# ── ICO for Windows (multi-size) ──────────────────────────────────────────────
convert "$SRC" -define icon:auto-resize=256,128,64,48,32,16 "$ASSETS_DIR/icon.ico"
echo "  ✓ icon.ico"

# ── ICNS for macOS ────────────────────────────────────────────────────────────
ICONSET="$ASSETS_DIR/icon.iconset"
mkdir -p "$ICONSET"
for size in 16 32 48 128 256 512; do
  convert "$SRC" -resize ${size}x${size} "$ICONSET/icon_${size}x${size}.png"
  # Retina versions
  double=$((size * 2))
  convert "$SRC" -resize ${double}x${double} "$ICONSET/icon_${size}x${size}@2x.png"
done
iconutil -c icns "$ICONSET" -o "$ASSETS_DIR/icon.icns"
rm -rf "$ICONSET"
echo "  ✓ icon.icns"

# ── Tray status icons (22×22 colored circles) ─────────────────────────────────
make_tray_icon() {
  local color="$1" name="$2"
  convert -size 22x22 xc:none \
    -fill "$color" -draw "circle 11,11 11,2" \
    -fill white -draw "circle 11,11 11,5" \
    -fill "$color" -draw "circle 11,11 11,6" \
    "$ASSETS_DIR/$name"
}

make_tray_icon "#22c55e" "icon-recording.png"
echo "  ✓ icon-recording.png (green)"

make_tray_icon "#f59e0b" "icon-paused.png"
echo "  ✓ icon-paused.png (yellow)"

make_tray_icon "#ef4444" "icon-error.png"
echo "  ✓ icon-error.png (red)"

make_tray_icon "#9ca3af" "icon-stopped.png"
echo "  ✓ icon-stopped.png (gray)"

echo ""
echo "All icons generated in: $ASSETS_DIR"
