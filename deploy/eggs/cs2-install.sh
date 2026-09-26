#!/bin/bash
set -euo pipefail
if [[ "${STEAM_USER:-}" == "" ]]; then
  STEAM_USER=anonymous
  STEAM_PASS=""
  STEAM_AUTH=""
fi
cd /tmp
mkdir -p /mnt/server/steamcmd
curl -fsSL -o steamcmd.tar.gz https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz
tar -xzf steamcmd.tar.gz -C /mnt/server/steamcmd
mkdir -p /mnt/server/steamapps
cd /mnt/server/steamcmd
chown -R root:root /mnt
export HOME=/mnt/server
./steamcmd.sh +force_install_dir /mnt/server +login ${STEAM_USER} ${STEAM_PASS} ${STEAM_AUTH} +app_update ${SRCDS_APPID} validate +quit
mkdir -p /mnt/server/.steam/sdk32 /mnt/server/.steam/sdk64
cp -v linux32/steamclient.so /mnt/server/.steam/sdk32/steamclient.so
cp -v linux64/steamclient.so /mnt/server/.steam/sdk64/steamclient.so

CSGO=/mnt/server/game/csgo
mkdir -p "$CSGO"
if ! command -v unzip >/dev/null 2>&1; then
  apt-get update
  apt-get install -y unzip
fi
curl -fsSL -o /tmp/metamod.tar.gz "https://mms.alliedmods.net/mmsdrop/2.0/mmsource-2.0.0-git1472-linux.tar.gz"
tar -xzf /tmp/metamod.tar.gz -C "$CSGO"
curl -fsSL -o /tmp/css.zip "https://github.com/roflmuffin/CounterStrikeSharp/releases/download/v1.0.375/counterstrikesharp-with-runtime-linux-1.0.375.zip"
unzip -o /tmp/css.zip -d "$CSGO"
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
  awk 'BEGIN{done=0} { if (done==0 && $0 ~ /Game[[:space:]]+csgo[[:space:]]*$/) { print "\t\t\tGame\tcsgo/addons/metamod"; done=1 } print }' "$GAMEINFO" > "$GAMEINFO.new"
  mv "$GAMEINFO.new" "$GAMEINFO"
fi
SKIN_PLUGIN_URL="${SKIN_PLUGIN_URL:-http://10.77.0.1:3000/backend/skins/plugin.zip}"
SKIN_API_BASE="${SKIN_API_BASE:-http://10.77.0.1:3000/backend}"
mkdir -p "$CSGO/addons/counterstrikesharp/plugins"
curl -fsSL -o /tmp/cybergau-skins.zip "$SKIN_PLUGIN_URL"
unzip -o /tmp/cybergau-skins.zip -d "$CSGO/addons/counterstrikesharp/plugins"
printf '%s\n' "{\"ApiBase\":\"${SKIN_API_BASE}\"}" > "$CSGO/addons/counterstrikesharp/plugins/CybergauSkins/config.json"
test -f "$CSGO/addons/counterstrikesharp/plugins/CybergauSkins/CybergauSkins.dll"
echo "cyberGAU skinchanger installed"
