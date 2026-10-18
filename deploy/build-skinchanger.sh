#!/usr/bin/env bash
# Собирает CounterStrikeSharp-плагин скинов в /var/lib/cybergau/skinchanger/CybergauSkins.zip
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Запустите от root"
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export DEBIAN_FRONTEND=noninteractive
if ! /opt/dotnet/dotnet --list-sdks 2>/dev/null | grep -q '^10\.'; then
  curl -fsSL --connect-timeout 15 --max-time 180 --retry 5 --retry-delay 2 \
    -o /tmp/dotnet-install.sh https://dot.net/v1/dotnet-install.sh
  bash /tmp/dotnet-install.sh --channel 10.0 --install-dir /opt/dotnet
fi
export DOTNET_ROOT=/opt/dotnet
export PATH="/opt/dotnet:$PATH"

if ! command -v zip >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -qq zip
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
if [[ "$ok" != "1" ]]; then
  echo "Не удалось собрать skinchanger (dotnet publish)"
  exit 1
fi

rm -f "$OUT/stage/CybergauSkins/CounterStrikeSharp.API.dll" "$OUT/stage/CybergauSkins/CounterStrikeSharp.API.pdb"

if [[ -f /etc/cybergau/env ]]; then
  set -a
  # shellcheck disable=SC1091
  source /etc/cybergau/env
  set +a
fi
API_BASE="${SKIN_API_BASE:-${PUBLIC_WEB_URL:-http://127.0.0.1:3000}/backend}"
API_BASE="${API_BASE%/}"
API_BASE="${API_BASE%/backend}/backend"
printf '%s\n' "{\"ApiBase\":\"${API_BASE}\"}" > "$OUT/stage/CybergauSkins/config.json"
rm -f "$OUT/CybergauSkins.zip"
(cd "$OUT/stage" && zip -r "$OUT/CybergauSkins.zip" CybergauSkins)
chmod 644 "$OUT/CybergauSkins.zip"
echo "skinchanger zip: $OUT/CybergauSkins.zip ($(wc -c <"$OUT/CybergauSkins.zip") bytes)"
