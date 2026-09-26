#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Запустите: sudo bash deploy/install.sh"
  exit 1
fi

ENV_FILE=/etc/cybergau/env
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Создайте $ENV_FILE из deploy/env.example"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${CYBERGAU_ACCESS:?CYBERGAU_ACCESS is required}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"

if [[ "$CYBERGAU_ACCESS" != "wireguard" && "$CYBERGAU_ACCESS" != "lan" ]]; then
  echo "CYBERGAU_ACCESS должен быть wireguard или lan"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
export HOME="${HOME:-/root}"
export COMPOSER_HOME="${COMPOSER_HOME:-/root/.composer}"
apt-get update
apt-get install -y ca-certificates curl git rsync docker.io qemu-guest-agent
if apt-cache show docker-compose-v2 >/dev/null 2>&1; then
  apt-get install -y docker-compose-v2
else
  apt-get install -y docker-compose-plugin || true
fi
systemctl enable --now docker
systemctl enable --now qemu-guest-agent || true

# Путь до интернета на этой сети не пропускает кадры 1500 байт.
# Контейнеры тогда зависают на больших загрузках (npm, Steam).
if ! ping -M do -s 1472 -c 1 -W 3 1.1.1.1 >/dev/null 2>&1; then
  mkdir -p /etc/docker
  if [[ ! -f /etc/docker/daemon.json ]]; then
    printf '%s\n' '{ "mtu": 1450 }' >/etc/docker/daemon.json
    systemctl restart docker
  fi
  iptables -t mangle -C FORWARD -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu 2>/dev/null \
    || iptables -t mangle -A FORWARD -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu
fi

# Некоторые роутеры анонсируют IPv6, но не выпускают его в интернет.
# Docker Hub тогда зависает на AAAA-записях. Если реестр по IPv6 недоступен, выключаем IPv6.
hub_v6="$(timeout 8 curl -6 -sS -o /dev/null --max-time 5 -w '%{http_code}' https://registry-1.docker.io/v2/ || true)"
if [[ "$hub_v6" != "200" && "$hub_v6" != "401" ]]; then
  sysctl -w net.ipv6.conf.all.disable_ipv6=1 >/dev/null
  sysctl -w net.ipv6.conf.default.disable_ipv6=1 >/dev/null
  printf '%s\n' 'net.ipv6.conf.all.disable_ipv6=1' 'net.ipv6.conf.default.disable_ipv6=1' >/etc/sysctl.d/99-cybergau-ipv6.conf
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p /opt/cybergau
if [[ "$ROOT" != "/opt/cybergau" ]]; then
  rsync -a --delete --exclude .git --exclude node_modules --exclude .next --exclude dist "$ROOT"/ /opt/cybergau/
fi

if [[ ! -d /opt/cybergau/.git && -n "${CYBERGAU_REPO:-}" ]]; then
  rm -rf /opt/cybergau
  git clone "$CYBERGAU_REPO" /opt/cybergau
fi

install -m 600 "$ENV_FILE" /opt/cybergau/.env

if [[ "$CYBERGAU_ACCESS" == "wireguard" ]]; then
  apt-get install -y wireguard
  bash /opt/cybergau/deploy/setup-wireguard.sh
else
  systemctl disable --now wg-quick@wg0 >/dev/null 2>&1 || true
fi

install -m 644 /opt/cybergau/deploy/cybergau.service /etc/systemd/system/cybergau.service
systemctl daemon-reload
systemctl enable cybergau.service
systemctl restart cybergau.service

if [[ "${INSTALL_PTERODACTYL:-0}" == "1" ]]; then
  bash /opt/cybergau/deploy/pterodactyl.sh
fi

echo "cyberGAU запущен. Сайт: ${PUBLIC_WEB_URL:-http://127.0.0.1:3000}"
if [[ "$CYBERGAU_ACCESS" == "wireguard" ]]; then
  echo "Клиент WireGuard: /etc/cybergau/wg-client.conf"
fi
