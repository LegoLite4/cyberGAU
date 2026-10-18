#!/usr/bin/env bash
# Собирает CounterStrikeSharp-плагин скинов в /var/lib/cybergau/skinchanger/CybergauSkins.zip
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Запустите от root"
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

OUT=/var/lib/cybergau/skinchanger
ZIP="$OUT/CybergauSkins.zip"

# Resume: after a flaky network abort, skip if SDK + zip already present.
if [[ "${FORCE_SKINCHANGER:-0}" != "1" ]] \
  && /opt/dotnet/dotnet --list-sdks 2>/dev/null | grep -q '^10\.' \
  && [[ -s "$ZIP" ]]; then
  echo "skinchanger уже собран: $ZIP ($(wc -c <"$ZIP") bytes) — FORCE_SKINCHANGER=1 чтобы пересобрать"
  exit 0
fi

export DEBIAN_FRONTEND=noninteractive

# curl's --retry alone does not retry SSL timeouts (28) / reset (35).
curl_fetch() {
  local dest="$1"
  shift
  local url attempt=0 max=10 delay=3
  local urls=("$@")
  rm -f "$dest"
  while [[ "$attempt" -lt "$max" ]]; do
    attempt=$((attempt + 1))
    for url in "${urls[@]}"; do
      echo "curl_fetch [${attempt}/${max}] $url"
      if curl -fsSL -4 \
        --connect-timeout 30 \
        --max-time 300 \
        --retry 3 \
        --retry-delay 2 \
        --retry-all-errors \
        -o "$dest" "$url"; then
        if [[ -s "$dest" ]]; then
          return 0
        fi
      fi
      echo "curl_fetch failed for $url (attempt ${attempt})"
    done
    sleep "$delay"
    delay=$((delay + 2))
  done
  echo "Не удалось скачать: ${urls[*]}"
  return 1
}

if ! /opt/dotnet/dotnet --list-sdks 2>/dev/null | grep -q '^10\.'; then
  curl_fetch /tmp/dotnet-install.sh \
    "https://dot.net/v1/dotnet-install.sh" \
    "https://builds.dotnet.microsoft.com/dotnet/scripts/v1/dotnet-install.sh"
  chmod +x /tmp/dotnet-install.sh
  sdk_ok=0
  for i in 1 2 3 4 5 6; do
    echo "dotnet-install.sh attempt ${i}/6"
    if bash /tmp/dotnet-install.sh --channel 10.0 --install-dir /opt/dotnet; then
      if /opt/dotnet/dotnet --list-sdks 2>/dev/null | grep -q '^10\.'; then
        sdk_ok=1
        break
      fi
    fi
    echo "dotnet-install retry ${i}"
    sleep $((5 + i * 2))
  done
  if [[ "$sdk_ok" != "1" ]]; then
    echo "Не удалось установить .NET SDK 10.x в /opt/dotnet"
    exit 1
  fi
fi
export DOTNET_ROOT=/opt/dotnet
export PATH="/opt/dotnet:$PATH"

if ! command -v zip >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -qq zip
fi

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
rm -f "$ZIP"
(cd "$OUT/stage" && zip -r "$ZIP" CybergauSkins)
chmod 644 "$ZIP"
echo "skinchanger zip: $ZIP ($(wc -c <"$ZIP") bytes)"
