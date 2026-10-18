#!/bin/bash
# Slot install: hardlink shared CS2 base from /cs2-base (Wings mount).
# Game is downloaded once on the host by deploy/build-cs2-base.sh — not per slot.
set -euo pipefail

SHARED="${CS2_SHARED_ROOT:-/cs2-base}"
CS2_BIN_SHARED="$SHARED/game/bin/linuxsteamrt64/cs2"

if [[ ! -x "$CS2_BIN_SHARED" ]]; then
  echo "Shared CS2 base not mounted or incomplete: missing $CS2_BIN_SHARED"
  echo "On the host run: sudo bash /opt/cybergau/deploy/build-cs2-base.sh"
  echo "Then ensure Wings allowed_mounts + Panel mount → /cs2-base"
  exit 1
fi

# Clear slot volume contents ( /mnt/server is a bind-mount — do not remove the mountpoint ).
find /mnt/server -mindepth 1 -maxdepth 1 -exec rm -rf {} +
# Hardlink tree (same host FS via Wings binds of base + volume).
if ! cp -al "$SHARED"/. /mnt/server/; then
  echo "cp -al failed (filesystem must support hardlinks between /cs2-base and the slot volume)"
  exit 1
fi

# Per-slot writable trees (break hardlinks so instances do not share cfg/logs writes).
unlink_copy() {
  local rel="$1"
  local src="/mnt/server/${rel}"
  local shared_src="${SHARED}/${rel}"
  if [[ -e "$src" || -L "$src" ]]; then
    rm -rf "$src"
  fi
  if [[ -e "$shared_src" ]]; then
    mkdir -p "$(dirname "$src")"
    cp -a "$shared_src" "$src"
  else
    mkdir -p "$src"
  fi
}

unlink_copy "game/csgo/cfg"
unlink_copy "game/csgo/logs"
unlink_copy "game/csgo/addons/counterstrikesharp/configs"
# Skin plugin config is per-slot (ApiBase may differ); keep DLL hardlinked, replace config only.
SKIN_CFG="/mnt/server/game/csgo/addons/counterstrikesharp/plugins/CybergauSkins/config.json"
mkdir -p "$(dirname "$SKIN_CFG")"

SKIN_API_BASE="${SKIN_API_BASE:-http://172.17.0.1:3000/backend}"
SKIN_API_BASE="${SKIN_API_BASE%/}"
SKIN_API_BASE="${SKIN_API_BASE%/backend}/backend"
SKIN_PLUGIN_URL="${SKIN_PLUGIN_URL:-${SKIN_API_BASE}/skins/plugin.zip}"
if [[ -z "$SKIN_PLUGIN_URL" || "$SKIN_PLUGIN_URL" == *10.77.0.1* ]]; then
  echo "SKIN_PLUGIN_URL must point to cyberGAU API (.../backend/skins/plugin.zip), got: ${SKIN_PLUGIN_URL:-empty}"
  exit 1
fi

# Refresh skins from API if present; otherwise keep hardlinked copy from base.
if command -v unzip >/dev/null 2>&1 || apt-get update >/dev/null 2>&1; then
  if ! command -v unzip >/dev/null 2>&1; then
    apt-get install -y unzip >/dev/null
  fi
fi
if curl -fsSL --connect-timeout 10 --max-time 60 -o /tmp/cybergau-skins.zip "$SKIN_PLUGIN_URL"; then
  mkdir -p /mnt/server/game/csgo/addons/counterstrikesharp/plugins
  # Replace plugin dir with a real copy so zip extract does not touch shared inodes incorrectly.
  rm -rf /mnt/server/game/csgo/addons/counterstrikesharp/plugins/CybergauSkins
  unzip -o /tmp/cybergau-skins.zip -d /mnt/server/game/csgo/addons/counterstrikesharp/plugins
  rm -f /tmp/cybergau-skins.zip
fi
printf '%s\n' "{\"ApiBase\":\"${SKIN_API_BASE}\"}" > "$SKIN_CFG"
test -f /mnt/server/game/csgo/addons/counterstrikesharp/plugins/CybergauSkins/CybergauSkins.dll

CS2_BIN="/mnt/server/game/bin/linuxsteamrt64/cs2"
if [[ ! -x "$CS2_BIN" ]]; then
  echo "Slot volume missing CS2 binary after hardlink: $CS2_BIN"
  exit 1
fi

echo "cyberGAU slot linked to shared CS2 base (hardlinks); skins ApiBase=${SKIN_API_BASE}"
