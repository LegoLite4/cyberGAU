#!/usr/bin/env bash
# Пишет /etc/cybergau/env из env.example с паролями и адресами.
# Не перезаписывает существующий файл, пока не задан FORCE_ENV=1.
set -euo pipefail

ENV_FILE=/etc/cybergau/env
EXAMPLE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/env.example"

if [[ -f "$ENV_FILE" && "${FORCE_ENV:-0}" != "1" ]]; then
  echo "env уже есть: $ENV_FILE"
  exit 0
fi

if [[ ! -f "$EXAMPLE" ]]; then
  echo "Нет $EXAMPLE"
  exit 1
fi

rand() { openssl rand -base64 24 | tr -d '/+=' | head -c 28; }

ACCESS="${CYBERGAU_ACCESS:-wireguard}"
POOL_SIZE="${POOL_SIZE:-1}"
INSTALL_PTERODACTYL="${INSTALL_PTERODACTYL:-1}"
PG_PASS="${POSTGRES_PASSWORD:-$(rand)}"
ADMIN_PASS="${ADMIN_PASSWORD:-$(rand)}"
PANEL_DB_PASS="${PANEL_DB_PASSWORD:-$(rand)}"
TZ_VAL="${TZ:-Europe/Moscow}"

LAN_IP="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}' || true)"
LAN_IP="${LAN_IP:-127.0.0.1}"

PUBLIC_IP="$(
  curl -4 -fsS --max-time 5 https://ifconfig.me 2>/dev/null \
    || curl -4 -fsS --max-time 5 https://api.ipify.org 2>/dev/null \
    || true
)"
PUBLIC_IP="${PUBLIC_IP:-$LAN_IP}"

if [[ "$ACCESS" == "wireguard" ]]; then
  HOST_IP="10.77.0.1"
  WG_ENDPOINT="${WG_ENDPOINT:-${PUBLIC_IP}:51820}"
else
  HOST_IP="${ADVERTISE_HOST:-$LAN_IP}"
  WG_ENDPOINT="${WG_ENDPOINT:-${PUBLIC_IP}:51820}"
fi

PUBLIC_WEB_URL="${PUBLIC_WEB_URL:-http://${HOST_IP}:3000}"
ADVERTISE_HOST="${ADVERTISE_HOST:-$HOST_IP}"
BIND_ADDR="${BIND_ADDR:-$HOST_IP}"
PANEL_FQDN="${PANEL_FQDN:-$HOST_IP}"
ALLOC_IP="${ALLOC_IP:-$HOST_IP}"
PTERODACTYL_URL="${PTERODACTYL_URL:-http://${HOST_IP}:8088}"
PANEL_PORT="${PANEL_PORT:-8088}"
STEAM_WEB_API_KEY="${STEAM_WEB_API_KEY:-}"
STEAM_GSLT="${STEAM_GSLT:-}"
CYBERGAU_REPO="${CYBERGAU_REPO:-https://github.com/LegoLite4/cyberGAU.git}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@cybergau.local}"
ADMIN_USER="${ADMIN_USER:-admin}"

install -d -m 755 /etc/cybergau
umask 077
cat >"$ENV_FILE" <<EOF
# Сгенерировано deploy/write-env.sh $(date -Is)
CYBERGAU_ACCESS=${ACCESS}
CYBERGAU_REPO=${CYBERGAU_REPO}
INSTALL_PTERODACTYL=${INSTALL_PTERODACTYL}
POOL_SIZE=${POOL_SIZE}

POSTGRES_USER=cybergau
POSTGRES_PASSWORD=${PG_PASS}
POSTGRES_DB=cybergau
DATABASE_URL=postgresql://cybergau:${PG_PASS}@postgres:5432/cybergau

PUBLIC_WEB_URL=${PUBLIC_WEB_URL}
ADVERTISE_HOST=${ADVERTISE_HOST}
BIND_ADDR=${BIND_ADDR}
WEB_PORT=3000
COOKIE_SECURE=0

STEAM_WEB_API_KEY=${STEAM_WEB_API_KEY}
STEAM_GSLT=${STEAM_GSLT}
PTERODACTYL_MOCK=0
PTERODACTYL_URL=${PTERODACTYL_URL}
PTERODACTYL_APP_KEY=
PTERODACTYL_CLIENT_KEY=
PTERODACTYL_DOCKER_IMAGE=ghcr.io/ptero-eggs/steamcmd:sniper

WG_ENDPOINT=${WG_ENDPOINT}
PANEL_PORT=${PANEL_PORT}
PANEL_FQDN=${PANEL_FQDN}
ALLOC_IP=${ALLOC_IP}
CS2_MEMORY_MB=${CS2_MEMORY_MB:-2048}
CS2_DISK_MB=${CS2_DISK_MB:-90000}
CS2_CPU=${CS2_CPU:-200}

ADMIN_EMAIL=${ADMIN_EMAIL}
ADMIN_USER=${ADMIN_USER}
ADMIN_PASSWORD=${ADMIN_PASS}
PANEL_DB_PASSWORD=${PANEL_DB_PASS}
TZ=${TZ_VAL}
EOF
chmod 600 "$ENV_FILE"

echo "Записан $ENV_FILE"
echo "  ACCESS=${ACCESS}  HOST=${HOST_IP}  POOL_SIZE=${POOL_SIZE}"
echo "  ADMIN_USER=${ADMIN_USER}  ADMIN_PASSWORD=${ADMIN_PASS}"
if [[ -z "$STEAM_WEB_API_KEY" ]]; then
  echo "  STEAM_WEB_API_KEY пуст — позже допишите в $ENV_FILE и перезапустите cybergau.service"
fi
