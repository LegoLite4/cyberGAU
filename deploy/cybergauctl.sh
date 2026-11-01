#!/usr/bin/env bash
# Тонкая обёртка статуса/логов/пула для оператора.
set -euo pipefail

CMD="${1:-status}"
ENV_FILE=/etc/cybergau/env
APP_DIR=/opt/cybergau

redact() {
  sed -E 's/(KEY|PASSWORD|SECRET|TOKEN)=.*/\1=***/'
}

load_env() {
  if [[ -f "$ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
  fi
}

doctor() {
  load_env
  echo "=== cyberGAU doctor $(date -Is) ==="
  echo "host=$(hostname) ip=$(hostname -I 2>/dev/null | awk '{print $1}')"
  df -h / | awk 'NR==1 || NR==2'
  echo
  echo "--- systemd ---"
  for s in docker cybergau nginx wings pteroq; do
    if systemctl list-unit-files "${s}.service" >/dev/null 2>&1; then
      echo "$s $(systemctl is-active "$s" 2>/dev/null || echo n/a)"
    fi
  done
  echo
  echo "--- docker ---"
  docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null || echo "docker n/a"
  echo
  echo "--- keys in api container (presence) ---"
  for k in PTERODACTYL_URL PTERODACTYL_APP_KEY PTERODACTYL_CLIENT_KEY STEAM_WEB_API_KEY AUTH_MODE; do
    v="$(docker exec cybergau-api-1 printenv "$k" 2>/dev/null || true)"
    if [[ -z "$v" ]]; then echo "$k MISSING"; else echo "$k SET len=${#v}"; fi
  done
  echo
  echo "--- health ---"
  curl -sf --max-time 5 "${PUBLIC_WEB_URL:-http://127.0.0.1:3000}/backend/health" || echo "web health FAIL"
  echo
  echo "--- ServerSlot ---"
  docker exec cybergau-postgres-1 psql -U "${POSTGRES_USER:-cybergau}" -d "${POSTGRES_DB:-cybergau}" -c \
    'SELECT label,status,purpose,"allocationHost","allocationPort" FROM "ServerSlot";' 2>/dev/null || echo "db n/a"
  echo
  echo "--- last install log ---"
  if [[ -f /var/log/cybergau-install.log ]]; then
    tail -n 40 /var/log/cybergau-install.log | redact
  else
    echo "no install log"
  fi
}

status() {
  load_env
  docker compose -f "$APP_DIR/docker-compose.yml" --env-file "$APP_DIR/.env" ps 2>/dev/null || docker ps
  systemctl is-active wings nginx docker 2>/dev/null || true
}

logs() {
  docker logs --tail "${2:-80}" cybergau-api-1 2>&1 | redact
}

pool_scale() {
  echo "POOL_SIZE меняется через /etc/cybergau/env и повторный deploy/pterodactyl.sh"
  echo "Пример: sudo POOL_SIZE=${2:-2} bash /opt/cybergau/deploy/pterodactyl.sh"
  echo "Затем: sudo bash /opt/cybergau/deploy/apply-env.sh"
}

case "$CMD" in
  doctor) doctor ;;
  status) status ;;
  logs) logs "$@" ;;
  pool-scale) pool_scale "$@" ;;
  *)
    echo "Usage: cybergauctl.sh {status|doctor|logs|pool-scale N}"
    exit 1
    ;;
esac
