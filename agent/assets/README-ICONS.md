# Icon Files Required

Place the following icon files in this directory before building:

| File | Size | Used for |
|------|------|----------|
| `icon.ico` | Multi-size ICO (16,32,48,256px) | Windows app icon, installer |
| `icon.icns` | macOS ICNS bundle | macOS app icon |
| `icon.png` | 512×512 PNG | Linux, fallback |
| `icon-recording.png` | 22×22 PNG | Tray: green (recording) |
| `icon-paused.png` | 22×22 PNG | Tray: yellow (paused) |
| `icon-error.png` | 22×22 PNG | Tray: red (error) |
| `icon-stopped.png` | 22×22 PNG | Tray: gray (stopped) |

## Generating icons from a source PNG

If you have a 1024×1024 source PNG (`source.png`), generate all sizes with:

```bash
# macOS (requires Xcode command line tools)
mkdir -p icon.iconset
for size in 16 32 48 128 256 512; do
  sips -z $size $size source.png --out icon.iconset/icon_${size}x${size}.png
done
iconutil -c icns icon.iconset

# PNG → ICO (requires ImageMagick)
convert source.png -resize 256x256 icon.png
convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico

# Tray icons (22x22 colored circles)
convert -size 22x22 xc:none -fill '#22c55e' -draw "circle 11,11 11,1" icon-recording.png
convert -size 22x22 xc:none -fill '#f59e0b' -draw "circle 11,11 11,1" icon-paused.png
convert -size 22x22 xc:none -fill '#ef4444' -draw "circle 11,11 11,1" icon-error.png
convert -size 22x22 xc:none -fill '#9ca3af' -draw "circle 11,11 11,1" icon-stopped.png
```
