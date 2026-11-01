#!/usr/bin/env bash
# Обновление cyberGAU одной командой: код, skinchanger, docker, apply-env, doctor.
# Опции: FORCE_CS2_BASE=1 — перекачать общую базу CS2; SKIP_CS2=1 — не трогать базу.
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Запустите: sudo bash /opt/cybergau/deploy/update.sh"
  exit 1
fi

cd /opt/cybergau
export COMPOSE_BAKE="${COMPOSE_BAKE:-false}"

echo ">>> git pull"
if [[ -d .git ]]; then
  git pull --ff-only || git fetch --depth 1 origin "$(git rev-parse --abbrev-ref HEAD)" && git reset --hard "origin/$(git rev-parse --abbrev-ref HEAD)"
else
  echo "Нет .git в /opt/cybergau — пропускаю pull (код уже на месте)"
fi

if [[ -f /etc/cybergau/env ]]; then
  set -a
  # shellcheck disable=SC1091
  source /etc/cybergau/env
  set +a
  install -m 600 /etc/cybergau/env /opt/cybergau/.env
fi

echo ">>> build-skinchanger"
bash /opt/cybergau/deploy/build-skinchanger.sh

if [[ "${FORCE_CS2_BASE:-0}" == "1" ]]; then
  echo ">>> FORCE_CS2_BASE=1 rebuild cs2-base"
  bash /opt/cybergau/deploy/build-cs2-base.sh
elif [[ "${SKIP_CS2:-0}" != "1" && ! -x /var/lib/cybergau/cs2-base/game/bin/linuxsteamrt64/cs2 ]]; then
  echo ">>> cs2-base отсутствует — собираю"
  bash /opt/cybergau/deploy/build-cs2-base.sh
fi

echo ">>> docker compose up --build (api+web)"
docker compose --env-file /opt/cybergau/.env up -d --build
systemctl restart cybergau.service || true

echo ">>> apply-env (keys into api; rebuild web)"
REBUILD_WEB=1 bash /opt/cybergau/deploy/apply-env.sh || true

echo ">>> doctor"
bash /opt/cybergau/deploy/cybergauctl.sh doctor || true
echo "update.sh done"
