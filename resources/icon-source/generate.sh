#!/bin/bash
# Generate every Markov icon from resources/logo.svg and the Icon Composer .icon projects here.
# Produces: resources/build/icon.icns (macOS), resources/build/icon.png (fallback), resources/icon.png,
# resources/build/icon.ico (Windows), the alternate, dev and menu-bar icons, the mobile app icons and
# the docs favicon.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
BUILD_DIR="$PROJECT_DIR/resources/build"
RESOURCES_DIR="$PROJECT_DIR/resources"
MOBILE_ASSETS_DIR="$PROJECT_DIR/mobile/assets"
DOCS_PUBLIC_DIR="$PROJECT_DIR/docs/site/public/docs"
LOGO="$RESOURCES_DIR/logo.svg"
# The dev badge needs a bold face; this script already requires macOS for actool.
BADGE_FONT="/System/Library/Fonts/Supplemental/Arial Bold.ttf"
TMP_DIR=$(mktemp -d)

trap 'rm -rf "$TMP_DIR"' EXIT

MAGICK_BIN=$(command -v magick || true)
if [ -z "$MAGICK_BIN" ]; then
  echo "Error: ImageMagick is required to render the mark and trim the small macOS icon slots." >&2
  echo "Install with: brew install imagemagick" >&2
  exit 1
fi

# The logo draws consonant squares in ink and vowel circles in red; on dark grounds the ink turns paper.
MARK_INK="#161514"
MARK_PAPER="#EFE6D3"
LOGO_ON_DARK="$TMP_DIR/logo-on-dark.svg"
sed "s/$MARK_INK/$MARK_PAPER/g" "$LOGO" >"$LOGO_ON_DARK"

# Usage: split_mark <path id> <output> [fill]; one layer of the logo, optionally recolored.
split_mark() {
  local root layer
  root=$(grep -o '<svg[^>]*>' "$LOGO")
  layer=$(grep -o "<path[^>]*id=\"$1\"[^>]*/>" "$LOGO")
  if [ -n "${3:-}" ]; then
    layer=$(echo "$layer" | sed -E "s/fill=\"[^\"]*\"/fill=\"$3\"/")
  fi
  printf '%s\n%s\n</svg>\n' "$root" "$layer" >"$2"
}

# Icon Composer colors each layer on its own, so every project gets the squares and circles separately.
for project in icon blue watercolor; do
  mkdir -p "$SCRIPT_DIR/$project.icon/Assets"
  split_mark vowels "$SCRIPT_DIR/$project.icon/Assets/vowels.svg"
done
split_mark consonants "$SCRIPT_DIR/icon.icon/Assets/consonants.svg"
# The alternates sit on color, so their squares are white.
for project in blue watercolor; do
  split_mark consonants "$SCRIPT_DIR/$project.icon/Assets/consonants.svg" '#FFFFFF'
done
# The docs site defaults to its dark theme.
cp "$LOGO_ON_DARK" "$DOCS_PUBLIC_DIR/logo.svg"

# Usage: compile_icon <project name>; writes $TMP_DIR/<name>/<name>.icns (requires Xcode).
compile_icon() {
  echo "Compiling icon from $SCRIPT_DIR/$1.icon..."
  mkdir -p "$TMP_DIR/$1"
  xcrun actool \
    --compile "$TMP_DIR/$1" \
    --platform macosx \
    --minimum-deployment-target 10.12 \
    --app-icon "$1" \
    --output-partial-info-plist "$TMP_DIR/$1/partial.plist" \
    "$SCRIPT_DIR/$1.icon" >/dev/null
  if [ ! -f "$TMP_DIR/$1/$1.icns" ]; then
    echo "Error: actool failed to produce $1.icns" >&2
    exit 1
  fi
}

# Usage: render_mark <geometry> <color> <output>; the mark in one flat color on transparency.
render_mark() {
  "$MAGICK_BIN" -background none -density 1200 "$LOGO" \
    -fill "$2" -colorize 100 \
    -resize "$1" \
    "$3"
}

# Usage: render_logo <svg> <geometry> <output>; the mark in its own colors on transparency.
render_logo() {
  "$MAGICK_BIN" -background none -density 1200 "$1" -resize "$2" "$3"
}

compile_icon icon
cp "$TMP_DIR/icon/icon.icns" "$BUILD_DIR/icon.icns"

# macOS list views use the small .icns slots directly. Icon Composer keeps the
# safe-area inset there, so trim only those slots while preserving larger icons.
ICONSET_DIR="$TMP_DIR/icon.iconset"
iconutil -c iconset "$BUILD_DIR/icon.icns" -o "$ICONSET_DIR"
for icon_file in \
  icon_16x16.png \
  icon_16x16@2x.png \
  icon_32x32.png \
  icon_32x32@2x.png; do
  case "$icon_file" in
    icon_16x16.png) icon_size=16 ;;
    icon_16x16@2x.png | icon_32x32.png) icon_size=32 ;;
    icon_32x32@2x.png) icon_size=64 ;;
  esac
  "$MAGICK_BIN" "$ICONSET_DIR/$icon_file" \
    -trim +repage \
    -resize "${icon_size}x${icon_size}" \
    -background none \
    -gravity center \
    -extent "${icon_size}x${icon_size}" \
    "$ICONSET_DIR/$icon_file"
done
iconutil -c icns "$ICONSET_DIR" -o "$BUILD_DIR/icon.icns"
echo "  -> resources/build/icon.icns"

# Extract PNG fallbacks from the unmodified compiled icon; small-slot trimming is
# only for the macOS .icns list representations.
sips -s format png --resampleWidth 1024 "$TMP_DIR/icon/icon.icns" --out "$BUILD_DIR/icon.png" >/dev/null 2>&1
echo "  -> resources/build/icon.png (1024x1024)"

sips -s format png --resampleWidth 256 "$TMP_DIR/icon/icon.icns" --out "$RESOURCES_DIR/icon.png" >/dev/null 2>&1
echo "  -> resources/icon.png (256x256)"

"$MAGICK_BIN" "$RESOURCES_DIR/icon.png" \
  -fill '#FF6B2B' -draw 'circle 224,224 224,199' \
  -fill white -font "$BADGE_FONT" -pointsize 24 -gravity center -annotate +96+96 'D' \
  "$RESOURCES_DIR/icon-dev.png"
echo "  -> resources/icon-dev.png (256x256, dev badge)"

for variant in blue watercolor; do
  compile_icon "$variant"
  sips -s format png --resampleWidth 1024 "$TMP_DIR/$variant/$variant.icns" \
    --out "$RESOURCES_DIR/app-icons/markov-$variant.png" >/dev/null 2>&1
  echo "  -> resources/app-icons/markov-$variant.png (1024x1024)"
done

# macOS tints template images itself, so only the alpha channel matters.
render_mark 22x14 black "$TMP_DIR/tray.png"
"$MAGICK_BIN" "$TMP_DIR/tray.png" -background none -gravity center -extent 22x14 \
  "PNG32:$RESOURCES_DIR/tray/markov-menu-barTemplate.png"
render_mark 44x28 black "$TMP_DIR/tray@2x.png"
"$MAGICK_BIN" "$TMP_DIR/tray@2x.png" -background none -gravity center -extent 44x28 \
  "PNG32:$RESOURCES_DIR/tray/markov-menu-barTemplate@2x.png"
echo "  -> resources/tray/markov-menu-barTemplate{,@2x}.png"

# #5357: Windows scales the safe-area-inset 1024px render into undersized taskbar/Open-with icons.
# Use the repo’s pngjs trim script to remove the inset, re-square with 2% margin and emit multi-size ICO,
# keeping committed output reproducible without ImageMagick.
node "$PROJECT_DIR/config/scripts/desktop-distribution/windows/trim-windows-icon-source.mjs"
echo "  -> resources/build/icon.ico (trimmed, filled multi-size ICO)"

cp "$BUILD_DIR/icon.ico" "$DOCS_PUBLIC_DIR/favicon.ico"
echo "  -> docs/site/public/docs/favicon.ico"

# iOS masks the corners itself, so the store icon is a full-bleed opaque square.
render_logo "$LOGO" 800x "$TMP_DIR/mobile-mark.png"
"$MAGICK_BIN" -size 1024x1024 xc:"$MARK_PAPER" \
  "$TMP_DIR/mobile-mark.png" -gravity center -composite \
  -alpha off "PNG24:$MOBILE_ASSETS_DIR/icon.png"
echo "  -> mobile/assets/icon.png (1024x1024)"

# Android draws the adaptive foreground over app.json's backgroundColor (paper) and crops to the
# 66dp safe circle; 480px wide keeps the mark's corners inside it.
render_logo "$LOGO" 480x "$TMP_DIR/adaptive.png"
"$MAGICK_BIN" "$TMP_DIR/adaptive.png" -background none -gravity center -extent 1024x1024 \
  "PNG32:$MOBILE_ASSETS_DIR/adaptive-icon.png"
render_logo "$LOGO_ON_DARK" 360x "$TMP_DIR/splash.png"
"$MAGICK_BIN" "$TMP_DIR/splash.png" -background none -gravity center -extent 400x255 \
  "PNG32:$MOBILE_ASSETS_DIR/splash-icon.png"
# Android notification icons are alpha-only silhouettes.
render_mark 48x white "$TMP_DIR/notification.png"
"$MAGICK_BIN" "$TMP_DIR/notification.png" -background none -gravity center -extent 56x56 \
  "PNG32:$MOBILE_ASSETS_DIR/notification-icon.png"
render_logo "$LOGO_ON_DARK" 32x "$TMP_DIR/favicon.png"
"$MAGICK_BIN" -size 48x48 xc:'#111111' "$TMP_DIR/favicon.png" -gravity center -composite \
  -alpha off "PNG24:$MOBILE_ASSETS_DIR/favicon.png"
echo "  -> mobile/assets/{icon,adaptive-icon,splash-icon,notification-icon,favicon}.png"

echo "Done! Icons generated in resources/, mobile/assets/ and docs/site/public/docs/"
