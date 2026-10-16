#!/usr/bin/env bash
set -euo pipefail
cd /opt/cybergau
git pull --ff-only
if ! /opt/dotnet/dotnet --list-sdks 2>/dev/null | grep -q '^10\.'; then
  curl -fsSL https://dot.net/v1/dotnet-install.sh -o /tmp/dotnet-install.sh
  bash /tmp/dotnet-install.sh --channel 10.0 --install-dir /opt/dotnet
fi
export DOTNET_ROOT=/opt/dotnet
export PATH="/opt/dotnet:$PATH"
if ! command -v zip >/dev/null 2>&1; then
  apt-get update
  apt-get install -y zip
fi
OUT=/var/lib/cybergau/skinchanger
rm -rf "$OUT/stage"
mkdir -p "$OUT/stage/CybergauSkins"
ok=0
for i in 1 2 3 4 5 6; do
  if dotnet publish services/skinchanger/CybergauSkins.csproj -c Release -o "$OUT/stage/CybergauSkins"; then
    ok=1
    break
  fi
  echo "dotnet publish retry ${i}"
  sleep 8
done
test "$ok" = 1
rm -f "$OUT/stage/CybergauSkins/CounterStrikeSharp.API.dll" "$OUT/stage/CybergauSkins/CounterStrikeSharp.API.pdb"
API_BASE="${SKIN_API_BASE:-${PUBLIC_WEB_URL:-http://127.0.0.1:3000}/backend}"
API_BASE="${API_BASE%/}"
API_BASE="${API_BASE%/backend}/backend"
printf '%s\n' "{\"ApiBase\":\"${API_BASE}\"}" > "$OUT/stage/CybergauSkins/config.json"
rm -f "$OUT/CybergauSkins.zip"
(cd "$OUT/stage" && zip -r "$OUT/CybergauSkins.zip" CybergauSkins)
export COMPOSE_BAKE="${COMPOSE_BAKE:-false}"
docker compose --env-file /opt/cybergau/.env up -d --build
systemctl restart cybergau.service || true
