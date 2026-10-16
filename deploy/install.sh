#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Запустите: sudo bash deploy/install.sh"
  exit 1
fi

ENV_FILE=/etc/cybergau/env
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Нет $ENV_FILE — генерирую через write-env.sh"
  bash "$HERE/write-env.sh"
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${CYBERGAU_ACCESS:?CYBERGAU_ACCESS is required}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"

if [[ -z "${STEAM_WEB_API_KEY:-}" ]]; then
  echo "В $ENV_FILE нет STEAM_WEB_API_KEY."
  echo "Получите ключ: https://steamcommunity.com/dev/apikey (домен: localhost или LAN-IP)."
  echo "Допишите STEAM_WEB_API_KEY=... в $ENV_FILE или: sudo FORCE_ENV=1 STEAM_WEB_API_KEY=ВАШ_КЛЮЧ bash deploy/write-env.sh"
  exit 1
fi

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
# Compose 2.40+ по умолчанию собирает через Bake; без buildx сборка зависает
# на «load metadata» (Docker Hub / node base image).
if apt-cache show docker-buildx >/dev/null 2>&1; then
  apt-get install -y docker-buildx
elif apt-cache show docker-buildx-plugin >/dev/null 2>&1; then
  apt-get install -y docker-buildx-plugin
fi
export COMPOSE_BAKE="${COMPOSE_BAKE:-false}"
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

# Прогрев базовых образов: иначе «docker compose up --build» может надолго
# зависнуть на load metadata. Docker Hub иногда залипает — пробуем mirror.gcr.io.
pull_image() {
  local img="$1"
  local mirror="mirror.gcr.io/library/${img}"
  echo "docker pull ${img}"
  local attempt
  for attempt in 1 2 3 4 5; do
    if timeout 240 docker pull "$mirror" && docker tag "$mirror" "$img"; then
      return 0
    fi
    if timeout 240 docker pull "$img"; then
      return 0
    fi
    echo "pull ${img} retry ${attempt}"
    sleep 5
  done
  return 1
}
for img in postgres:16-alpine node:22-alpine; do
  if ! pull_image "$img"; then
    echo "Не удалось скачать ${img} (Docker Hub / mirror.gcr.io)"
    exit 1
  fi
done

# Собираем образы здесь (один раз), а не в systemd-сервисе на каждом старте.
echo "docker compose build"
(
  cd /opt/cybergau
  docker compose --env-file /opt/cybergau/.env build
)

systemctl restart cybergau.service

# Порты для сайта, панели, Wings и CS2 (если ufw уже включён).
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q 'Status: active'; then
  ufw allow 3000/tcp comment 'cyberGAU web' || true
  ufw allow "${PANEL_PORT:-8088}/tcp" comment 'cyberGAU panel' || true
  ufw allow 8080/tcp comment 'cyberGAU wings' || true
  ufw allow 27015:27030/tcp comment 'cyberGAU CS2' || true
  ufw allow 27015:27030/udp comment 'cyberGAU CS2' || true
  if [[ "$CYBERGAU_ACCESS" == "wireguard" ]]; then
    ufw allow 51820/udp comment 'cyberGAU wireguard' || true
  fi
fi

WEB="${PUBLIC_WEB_URL:-http://127.0.0.1:3000}"
WEB="${WEB%/}"

if [[ "${INSTALL_PTERODACTYL:-0}" == "1" ]]; then
  bash /opt/cybergau/deploy/pterodactyl.sh
  install -m 600 /etc/cybergau/env /opt/cybergau/.env
  # shellcheck disable=SC1090
  set -a; source /etc/cybergau/env; set +a
  systemctl restart cybergau.service

  if ! grep -q '^PTERODACTYL_APP_KEY=.\+' /etc/cybergau/env || ! grep -q '^PTERODACTYL_CLIENT_KEY=.\+' /etc/cybergau/env; then
    echo "Ключи PTERODACTYL_APP_KEY / PTERODACTYL_CLIENT_KEY пусты в /etc/cybergau/env"
    exit 1
  fi
  if ! systemctl is-active --quiet nginx; then
    echo "nginx не активен после установки панели"
    exit 1
  fi
  if ! systemctl is-active --quiet wings; then
    echo "wings не активен после установки панели"
    systemctl status wings --no-pager -l || true
    exit 1
  fi

  # Дождаться API, free ServerSlot и plugin.zip для скинченджера.
  ok=0
  slots=0
  plugin_ok=0
  for attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do
    if curl -sf --max-time 5 "${WEB}/backend/health" >/dev/null 2>&1 \
      || docker exec cybergau-api-1 wget -q -O /dev/null http://127.0.0.1:4000/health 2>/dev/null; then
      slots="$(docker exec cybergau-postgres-1 psql -U "${POSTGRES_USER:-cybergau}" -d "${POSTGRES_DB:-cybergau}" -Atc \
        "SELECT count(*) FROM \"ServerSlot\" WHERE status='free' AND purpose='pool';" 2>/dev/null || echo 0)"
      if curl -sfI --max-time 5 "${WEB}/backend/skins/plugin.zip" 2>/dev/null | head -n1 | grep -qE 'HTTP/[0-9.]+ 200'; then
        plugin_ok=1
      elif docker exec cybergau-api-1 wget -q -S -O /dev/null http://127.0.0.1:4000/skins/plugin.zip 2>&1 | grep -q '200 OK'; then
        plugin_ok=1
      fi
      if [[ "${slots:-0}" -ge 1 && "$plugin_ok" == "1" ]]; then
        ok=1
        break
      fi
    fi
    sleep 5
  done
  if [[ "$ok" != "1" ]]; then
    echo "Панель/пул/скины не готовы после install (free ServerSlot=${slots:-0}, plugin.zip ok=${plugin_ok})."
    echo "Проверьте: systemctl status nginx wings; ключи PTERODACTYL_* в /etc/cybergau/env; ${WEB}/backend/skins/plugin.zip"
    exit 1
  fi
  echo "Игровой пул готов: ${slots} свободный слот(ов); скинченджер: ${WEB}/backend/skins/plugin.zip"
fi

if [[ -z "${STEAM_GSLT:-}" ]]; then
  echo "Предупреждение: STEAM_GSLT пуст — dedicated CS2 без Game Server Login Token (для LAN обычно ок)."
fi

echo "cyberGAU запущен. Сайт: ${WEB}"
echo "Привязка Steam: зарегистрируйтесь на сайте, затем «Привязать Steam» (нужен STEAM_WEB_API_KEY в env)."
if [[ "$CYBERGAU_ACCESS" == "wireguard" ]]; then
  echo "Клиент WireGuard: /etc/cybergau/wg-client.conf"
fi
