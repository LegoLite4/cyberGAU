#!/usr/bin/env bash
# Одна общая установка CS2 для всех слотов пула: /var/lib/cybergau/cs2-base
# Слоты делают hardlink (см. eggs/cs2-install.sh), Steam не качается на каждый инстанс.
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Запустите от root"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
BASE="${CS2_BASE_DIR:-/var/lib/cybergau/cs2-base}"
CS2_BIN="$BASE/game/bin/linuxsteamrt64/cs2"
MIN_FREE_GB="${CS2_BASE_MIN_FREE_GB:-70}"

if [[ -f /etc/cybergau/env ]]; then
  set -a
  # shellcheck disable=SC1091
  source /etc/cybergau/env
  set +a
fi

if [[ "${FORCE_CS2_BASE:-0}" != "1" && -x "$CS2_BIN" ]]; then
  echo "CS2 base уже есть: $CS2_BIN (FORCE_CS2_BASE=1 чтобы пересобрать)"
  exit 0
fi

FREE_KB="$(df -Bk --output=avail / | tail -1 | tr -dc '0-9')"
FREE_GB=$((FREE_KB / 1024 / 1024))
if [[ "$FREE_GB" -lt "$MIN_FREE_GB" ]]; then
  echo "Мало места для общей базы CS2: свободно ~${FREE_GB} GB, нужно ≥${MIN_FREE_GB} GB на /"
  echo "База ставится один раз в ${BASE}; слоты её шарят и не качают игру снова."
  exit 1
fi

apt-get update -qq
apt-get install -y -qq ca-certificates curl tar unzip lib32gcc-s1 lib32stdc++6 || \
  apt-get install -y -qq ca-certificates curl tar unzip

if [[ "${FORCE_CS2_BASE:-0}" == "1" ]]; then
  rm -rf "$BASE"
fi
mkdir -p "$BASE/steamcmd" "$BASE/steamapps"

cd /tmp
curl -fsSL --connect-timeout 15 --max-time 300 --retry 5 --retry-delay 2 \
  -o /tmp/steamcmd.tar.gz https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz
tar -xzf /tmp/steamcmd.tar.gz -C "$BASE/steamcmd"
rm -f /tmp/steamcmd.tar.gz

STEAM_USER="${STEAM_USER:-anonymous}"
STEAM_PASS="${STEAM_PASS:-}"
STEAM_AUTH="${STEAM_AUTH:-}"
SRCDS_APPID="${SRCDS_APPID:-730}"

export HOME="$BASE"
cd "$BASE/steamcmd"
./steamcmd.sh +force_install_dir "$BASE" +login "$STEAM_USER" "$STEAM_PASS" "$STEAM_AUTH" \
  +app_update "$SRCDS_APPID" validate +quit

mkdir -p "$BASE/.steam/sdk32" "$BASE/.steam/sdk64"
cp -v "$BASE/steamcmd/linux32/steamclient.so" "$BASE/.steam/sdk32/steamclient.so"
cp -v "$BASE/steamcmd/linux64/steamclient.so" "$BASE/.steam/sdk64/steamclient.so"

if [[ ! -x "$CS2_BIN" ]]; then
  echo "После SteamCMD нет бинарника CS2: $CS2_BIN"
  echo "Частая причина — нехватка места (Steam state 0x202) или сбой validate."
  exit 1
fi

CSGO="$BASE/game/csgo"
mkdir -p "$CSGO"
curl -fsSL --connect-timeout 15 --max-time 300 --retry 5 --retry-delay 2 \
  -o /tmp/metamod.tar.gz "https://mms.alliedmods.net/mmsdrop/2.0/mmsource-2.0.0-git1472-linux.tar.gz"
tar -xzf /tmp/metamod.tar.gz -C "$CSGO"
rm -f /tmp/metamod.tar.gz

curl -fsSL --connect-timeout 15 --max-time 300 --retry 5 --retry-delay 2 \
  -o /tmp/css.zip "https://github.com/roflmuffin/CounterStrikeSharp/releases/download/v1.0.375/counterstrikesharp-with-runtime-linux-1.0.375.zip"
unzip -o /tmp/css.zip -d "$CSGO"
rm -f /tmp/css.zip

mkdir -p "$CSGO/addons/counterstrikesharp/configs"
cat > "$CSGO/addons/counterstrikesharp/configs/core.json" <<'EOF'
{
  "PublicChatTrigger": ["!"],
  "SilentChatTrigger": ["/"],
  "FollowCS2ServerGuidelines": false,
  "PluginHotReloadEnabled": false,
  "PluginAutoLoadEnabled": true,
  "PluginResolveNugetPackages": false,
  "ServerLanguage": "en",
  "UnlockConCommands": true,
  "UnlockConVars": true,
  "AutoUpdateEnabled": false,
  "AutoUpdateURL": "http://gamedata.cssharp.dev",
  "MaximumFrameTasksExecutedPerTick": 1024
}
EOF

GAMEINFO="$CSGO/gameinfo.gi"
if [[ -f "$GAMEINFO" ]] && ! grep -q "addons/metamod" "$GAMEINFO"; then
  awk 'BEGIN{done=0} { if (done==0 && $0 ~ /Game[[:space:]]+csgo[[:space:]]*$/) { print "\t\t\tGame\tcsgo/addons/metamod"; done=1 } print }' \
    "$GAMEINFO" > "$GAMEINFO.new"
  mv "$GAMEINFO.new" "$GAMEINFO"
fi

API_BASE="${SKIN_API_BASE:-${PUBLIC_WEB_URL:-http://127.0.0.1:3000}/backend}"
API_BASE="${API_BASE%/}"
API_BASE="${API_BASE%/backend}/backend"
SKIN_ZIP="${SKINCHANGER_ZIP:-/var/lib/cybergau/skinchanger/CybergauSkins.zip}"
mkdir -p "$CSGO/addons/counterstrikesharp/plugins"
if [[ -f "$SKIN_ZIP" ]]; then
  unzip -o "$SKIN_ZIP" -d "$CSGO/addons/counterstrikesharp/plugins"
else
  SKIN_PLUGIN_URL="${SKIN_PLUGIN_URL:-${API_BASE}/skins/plugin.zip}"
  curl -fsSL --connect-timeout 15 --max-time 120 --retry 5 --retry-delay 2 \
    -o /tmp/cybergau-skins.zip "$SKIN_PLUGIN_URL"
  unzip -o /tmp/cybergau-skins.zip -d "$CSGO/addons/counterstrikesharp/plugins"
  rm -f /tmp/cybergau-skins.zip
fi
printf '%s\n' "{\"ApiBase\":\"${API_BASE}\"}" \
  > "$CSGO/addons/counterstrikesharp/plugins/CybergauSkins/config.json"
test -f "$CSGO/addons/counterstrikesharp/plugins/CybergauSkins/CybergauSkins.dll"

# Wings/containers обычно работают от pterodactyl (uid 999) или root — открываем чтение.
chmod -R a+rX "$BASE" || true

echo "CS2 base готов: $BASE ($(du -sh "$BASE" | awk '{print $1}'))"
echo "Бинарник: $CS2_BIN"
