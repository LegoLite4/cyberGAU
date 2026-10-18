#!/bin/bash
# Host-side hardlink of shared CS2 base into a Wings volume.
# Panel mounts are NOT available during Wings install containers — this must run on the node.
set -euo pipefail

BASE="${CS2_BASE_DIR:-/var/lib/cybergau/cs2-base}"
VOLUMES_DIR="${VOLUMES_DIR:-/var/lib/pterodactyl/volumes}"
UUID="${1:-}"
SKIN_API_BASE="${SKIN_API_BASE:-http://172.17.0.1:3000/backend}"
SKIN_PLUGIN_URL="${SKIN_PLUGIN_URL:-}"

if [[ -z "$UUID" ]]; then
  echo "usage: $0 <server-uuid>"
  exit 1
fi

CS2_BIN_SHARED="$BASE/game/bin/linuxsteamrt64/cs2"
if [[ ! -x "$CS2_BIN_SHARED" ]]; then
  echo "Shared CS2 base incomplete: missing $CS2_BIN_SHARED"
  exit 1
fi

DEST="${VOLUMES_DIR}/${UUID}"
mkdir -p "$DEST"

# Clear slot volume contents (do not remove the mountpoint/dir itself).
find "$DEST" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
if ! cp -al "$BASE"/. "$DEST"/; then
  echo "cp -al failed between $BASE and $DEST (same filesystem required)"
  exit 1
fi

unlink_copy() {
  local rel="$1"
  local src="${DEST}/${rel}"
  local shared_src="${BASE}/${rel}"
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

SKIN_CFG="${DEST}/game/csgo/addons/counterstrikesharp/plugins/CybergauSkins/config.json"
mkdir -p "$(dirname "$SKIN_CFG")"
SKIN_API_BASE="${SKIN_API_BASE%/}"
SKIN_API_BASE="${SKIN_API_BASE%/backend}/backend"
if [[ -z "$SKIN_PLUGIN_URL" ]]; then
  SKIN_PLUGIN_URL="${SKIN_API_BASE}/skins/plugin.zip"
fi

if command -v curl >/dev/null 2>&1 && command -v unzip >/dev/null 2>&1; then
  if curl -fsSL --connect-timeout 10 --max-time 60 -o /tmp/cybergau-skins-$$.zip "$SKIN_PLUGIN_URL"; then
    mkdir -p "${DEST}/game/csgo/addons/counterstrikesharp/plugins"
    rm -rf "${DEST}/game/csgo/addons/counterstrikesharp/plugins/CybergauSkins"
    unzip -o /tmp/cybergau-skins-$$.zip -d "${DEST}/game/csgo/addons/counterstrikesharp/plugins" >/dev/null
    rm -f /tmp/cybergau-skins-$$.zip
  fi
fi
printf '%s\n' "{\"ApiBase\":\"${SKIN_API_BASE}\"}" > "$SKIN_CFG"

CS2_BIN="${DEST}/game/bin/linuxsteamrt64/cs2"
if [[ ! -x "$CS2_BIN" ]]; then
  echo "Slot volume missing CS2 binary after hardlink: $CS2_BIN"
  exit 1
fi

# Disable Valve default bots — they fill 1v1/2v2 slots and cause SERVERFULL.
CFG_SRC="${CS2_CFG_DIR:-/opt/cybergau/deploy/cs2-cfg}"
CFG_DEST="${DEST}/game/csgo/cfg"
mkdir -p "$CFG_DEST"
if [[ -d "$CFG_SRC" ]]; then
  cp -a "$CFG_SRC"/. "$CFG_DEST"/
fi
# Stock gamemode_*.cfg (copied as real files) re-enable bots; force them off.
for mode_cfg in "${CFG_DEST}"/gamemode_*.cfg; do
  [[ -f "$mode_cfg" ]] || continue
  [[ "$mode_cfg" == *_server.cfg ]] && continue
  sed -i -E \
    -e 's/^bot_quota[[:space:]].*/bot_quota\t\t\t\t\t\t\t0/' \
    -e 's/^bot_quota_mode[[:space:]].*/bot_quota_mode\t\t\t\t\t\t\tnormal/' \
    "$mode_cfg" || true
done
for mode in competitive competitive2v2 casual; do
  cat > "${CFG_DEST}/gamemode_${mode}_server.cfg" <<'EOF'
bot_quota 0
bot_quota_mode normal
bot_join_after_player 0
bot_kick
EOF
done
cat > "${CFG_DEST}/server.cfg" <<'EOF'
bot_quota 0
bot_quota_mode normal
bot_join_after_player 0
bot_auto_vacate 1
bot_kick
EOF

# Wings/Docker run as pterodactyl uid typically 999 or from config.
OWNER="${PTERODACTYL_USERNAME:-pterodactyl}"
if id "$OWNER" >/dev/null 2>&1; then
  chown -R "${OWNER}:${OWNER}" "$DEST"
fi

echo "linked $UUID -> $BASE"
