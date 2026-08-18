#!/bin/bash
set -e

SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$HOME/Applications"
APP_PATH="$APP_DIR/Presence.app"
TEMP_DIR="$(mktemp -d)"
QUIET_MODE="${1:-}"

cleanup() {
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

mkdir -p "$APP_DIR"

if [[ -e "$APP_PATH" ]]; then
  rm -rf "$APP_PATH"
fi

SOURCE_FOR_APPLESCRIPT=${SOURCE_DIR//\\/\\\\}
SOURCE_FOR_APPLESCRIPT=${SOURCE_FOR_APPLESCRIPT//\"/\\\"}

osacompile -o "$APP_PATH" \
  -e "property presenceFolder : \"$SOURCE_FOR_APPLESCRIPT\"" \
  -e 'on run' \
  -e 'tell application "Terminal"' \
  -e 'activate' \
  -e 'do script "cd " & quoted form of presenceFolder & " && bash ./START_PRESENCE.command"' \
  -e 'end tell' \
  -e 'end run'

ICON_SOURCE="$SOURCE_DIR/assets/presence-icon.png"
if [[ -f "$ICON_SOURCE" ]] && command -v sips >/dev/null 2>&1 && command -v iconutil >/dev/null 2>&1; then
  ICONSET="$TEMP_DIR/Presence.iconset"
  mkdir -p "$ICONSET"
  sips -z 16 16 "$ICON_SOURCE" --out "$ICONSET/icon_16x16.png" >/dev/null
  sips -z 32 32 "$ICON_SOURCE" --out "$ICONSET/icon_16x16@2x.png" >/dev/null
  sips -z 32 32 "$ICON_SOURCE" --out "$ICONSET/icon_32x32.png" >/dev/null
  sips -z 64 64 "$ICON_SOURCE" --out "$ICONSET/icon_32x32@2x.png" >/dev/null
  sips -z 128 128 "$ICON_SOURCE" --out "$ICONSET/icon_128x128.png" >/dev/null
  sips -z 256 256 "$ICON_SOURCE" --out "$ICONSET/icon_128x128@2x.png" >/dev/null
  sips -z 256 256 "$ICON_SOURCE" --out "$ICONSET/icon_256x256.png" >/dev/null
  sips -z 512 512 "$ICON_SOURCE" --out "$ICONSET/icon_256x256@2x.png" >/dev/null
  sips -z 512 512 "$ICON_SOURCE" --out "$ICONSET/icon_512x512.png" >/dev/null
  cp "$ICON_SOURCE" "$ICONSET/icon_512x512@2x.png"
  iconutil -c icns "$ICONSET" -o "$TEMP_DIR/Presence.icns"
  cp "$TEMP_DIR/Presence.icns" "$APP_PATH/Contents/Resources/applet.icns"
  touch "$APP_PATH"
fi

if [[ "$QUIET_MODE" != "--quiet" ]]; then
  echo
  echo "Presence was added to your Applications folder."
  echo "You can open it from Spotlight or drag it to your Dock."
  open -R "$APP_PATH"
  echo
  read -r -p "Press Return to close."
fi
