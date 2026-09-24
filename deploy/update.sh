#!/usr/bin/env bash
set -euo pipefail
cd /opt/cybergau
git pull --ff-only
docker compose --env-file /opt/cybergau/.env up -d --build
systemctl restart cybergau.service || true
