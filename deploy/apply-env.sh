#!/usr/bin/env bash
# Копирует /etc/cybergau/env → /opt/cybergau/.env и пересоздаёт API,
# чтобы контейнер реально подхватил PTERODACTYL_* / STEAM_* (compose up -d этого не делает).
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Запустите от root"
  exit 1
fi

ENV_FILE=/etc/cybergau/env
APP_DIR=/opt/cybergau
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Нет $ENV_FILE"
  exit 1
fi

install -m 600 "$ENV_FILE" "$APP_DIR/.env"
cd "$APP_DIR"
export COMPOSE_BAKE="${COMPOSE_BAKE:-false}"

# Только api: здесь читаются ключи панели. web не трогаем без нужды.
docker compose --env-file "$APP_DIR/.env" up -d --force-recreate --no-deps api

# Дождаться здоровья API
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do
  if docker exec cybergau-api-1 wget -q -O /dev/null http://127.0.0.1:4000/health 2>/dev/null \
    || curl -sf --max-time 3 http://127.0.0.1:4000/health >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

APP_IN="$(docker exec cybergau-api-1 printenv PTERODACTYL_APP_KEY 2>/dev/null || true)"
CLIENT_IN="$(docker exec cybergau-api-1 printenv PTERODACTYL_CLIENT_KEY 2>/dev/null || true)"
if [[ -z "$APP_IN" || -z "$CLIENT_IN" ]]; then
  echo "API-контейнер всё ещё без PTERODACTYL_APP_KEY / PTERODACTYL_CLIENT_KEY"
  echo "Проверьте $APP_DIR/.env и: docker compose --env-file $APP_DIR/.env config | grep -A2 PTERODACTYL"
  exit 1
fi

echo "API пересоздан с ключами панели (APP_KEY len=${#APP_IN}, CLIENT_KEY len=${#CLIENT_IN})"
