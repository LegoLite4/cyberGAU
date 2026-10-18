#!/usr/bin/env bash
set -euo pipefail
cd /opt/cybergau
git pull --ff-only
bash /opt/cybergau/deploy/build-skinchanger.sh
export COMPOSE_BAKE="${COMPOSE_BAKE:-false}"
docker compose --env-file /opt/cybergau/.env up -d --build
systemctl restart cybergau.service || true
