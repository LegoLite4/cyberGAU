#!/usr/bin/env bash
set -euo pipefail
set -a
source /etc/cybergau/env
set +a
unset DATABASE_URL
PANEL_DIR="${PANEL_DIR:-/var/www/pterodactyl}"
BASE="http://${BIND_ADDR}:8088"
if [[ "$BIND_ADDR" == "0.0.0.0" || "$BIND_ADDR" == "::" ]]; then
  BASE="http://127.0.0.1:8088"
fi
AUTH=(-H "Authorization: Bearer ${PTERODACTYL_APP_KEY}" -H "Accept: Application/vnd.pterodactyl.v1+json" -H "Content-Type: application/json")
NEST_ID="$(curl -sf "${AUTH[@]}" "$BASE/api/application/nests" | jq -r '.data[0].attributes.id')"
cd "$PANEL_DIR"
EGG_ID="$(PANEL_DIR="$PANEL_DIR" NEST_ID="$NEST_ID" EGG_PATH="/opt/cybergau/deploy/eggs/counter-strike-2.json" php /opt/cybergau/deploy/import-egg.php)"
echo "egg ${EGG_ID}"
IDENT="$(curl -sf "${AUTH[@]}" "$BASE/api/application/servers?per_page=100" | jq -r '.data[] | select(.attributes.name=="cybergau-1") | .attributes.identifier' | head -1)"
if [[ -z "$IDENT" ]]; then
  echo "cybergau-1 not found"
  exit 1
fi
curl -sf -X POST \
  -H "Authorization: Bearer ${PTERODACTYL_CLIENT_KEY}" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  "$BASE/api/client/servers/${IDENT}/settings/reinstall" >/dev/null
echo "reinstall ${IDENT}"
