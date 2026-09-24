#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Запустите от root"
  exit 1
fi

: "${SOURCE:?Укажите SOURCE=user@old-host}"
install -d /var/lib/pterodactyl/volumes
rsync -a --numeric-ids "${SOURCE}:/var/lib/pterodactyl/volumes/" /var/lib/pterodactyl/volumes/
echo "Тома Wings скопированы. Секреты перенесите отдельно: /etc/cybergau/env"
