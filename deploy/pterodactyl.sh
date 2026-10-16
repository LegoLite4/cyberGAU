#!/usr/bin/env bash
# Устанавливает Pterodactyl Panel, Wings и шаблон пула CS2.
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Запустите от root"
  exit 1
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$HERE/install-log.sh"
cybergau_step "pterodactyl.sh start"

ENV_FILE=/etc/cybergau/env
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
# DATABASE_URL от cyberGAU указывает на Postgres и перебивает MariaDB панели.
unset DATABASE_URL

export DEBIAN_FRONTEND=noninteractive
export HOME="${HOME:-/root}"
export COMPOSER_HOME="${COMPOSER_HOME:-/root/.composer}"
export COMPOSER_PROCESS_TIMEOUT=0
: "${PANEL_DB_PASSWORD:?}"
: "${ADMIN_EMAIL:?}"
: "${ADMIN_PASSWORD:?}"
: "${PANEL_FQDN:?}"
: "${ALLOC_IP:?}"

cybergau_step "apt: nginx mariadb redis php"
apt-get update
apt-get install -y \
  nginx mariadb-server redis-server tar unzip git curl jq \
  php8.3 php8.3-cli php8.3-fpm php8.3-mysql php8.3-gd php8.3-mbstring \
  php8.3-bcmath php8.3-xml php8.3-curl php8.3-zip php8.3-intl php8.3-redis

if ! command -v composer >/dev/null 2>&1; then
  cybergau_step "install composer"
  # Pipe to php can hang on flaky TLS; download to a file with timeouts/retries.
  curl -fsSL --connect-timeout 15 --max-time 120 --retry 5 --retry-delay 2 \
    -o /tmp/composer-setup.php https://getcomposer.org/installer
  php /tmp/composer-setup.php --install-dir=/usr/local/bin --filename=composer
  rm -f /tmp/composer-setup.php
fi

cybergau_step "mariadb panel database"
mysql -e "CREATE DATABASE IF NOT EXISTS panel;"
mysql -e "CREATE USER IF NOT EXISTS 'pterodactyl'@'127.0.0.1' IDENTIFIED BY '${PANEL_DB_PASSWORD}';"
mysql -e "GRANT ALL PRIVILEGES ON panel.* TO 'pterodactyl'@'127.0.0.1' WITH GRANT OPTION;"
mysql -e "FLUSH PRIVILEGES;"

PANEL_DIR=/var/www/pterodactyl
if [[ ! -f "$PANEL_DIR/.env" ]] || ! grep -q '^APP_KEY=base64:' "$PANEL_DIR/.env"; then
  cybergau_step "download + composer install panel"
  mkdir -p "$PANEL_DIR"
  cd "$PANEL_DIR"
  curl -fsSL --connect-timeout 15 --max-time 300 --retry 5 --retry-delay 2 \
    -o panel.tar.gz https://github.com/pterodactyl/panel/releases/latest/download/panel.tar.gz
  tar -xzf panel.tar.gz
  chmod -R 755 storage bootstrap/cache || true
  cp -n .env.example .env
  composer install --no-dev --optimize-autoloader --no-interaction
  php artisan key:generate --force
  php artisan p:environment:setup \
    --author="$ADMIN_EMAIL" \
    --url="http://${PANEL_FQDN}:${PANEL_PORT:-8088}" \
    --timezone="${TZ:-Europe/Moscow}" \
    --cache=redis \
    --session=redis \
    --queue=redis \
    --settings-ui=yes \
    --telemetry=false || true
  php artisan p:environment:database \
    --host=127.0.0.1 \
    --port=3306 \
    --database=panel \
    --username=pterodactyl \
    --password="$PANEL_DB_PASSWORD"
  php artisan migrate --seed --force
  php artisan p:user:make \
    --email="$ADMIN_EMAIL" \
    --username="${ADMIN_USER:-admin}" \
    --name-first=cyber \
    --name-last=GAU \
    --password="$ADMIN_PASSWORD" \
    --admin=1
fi

if ! mysql -N panel -e "SHOW TABLES LIKE 'users';" | grep -q users; then
  cd "$PANEL_DIR"
  php artisan p:environment:database \
    --host=127.0.0.1 \
    --port=3306 \
    --database=panel \
    --username=pterodactyl \
    --password="$PANEL_DB_PASSWORD"
  php artisan migrate --seed --force
  php artisan p:user:make \
    --email="$ADMIN_EMAIL" \
    --username="${ADMIN_USER:-admin}" \
    --name-first=cyber \
    --name-last=GAU \
    --password="$ADMIN_PASSWORD" \
    --admin=1
fi

chown -R www-data:www-data "$PANEL_DIR"

cat > /etc/nginx/sites-available/pterodactyl.conf <<EOF
server {
    listen ${BIND_ADDR:-0.0.0.0}:${PANEL_PORT:-8088};
    server_name ${PANEL_FQDN};
    root ${PANEL_DIR}/public;
    index index.php;
    client_max_body_size 100m;
    location / {
        try_files \$uri \$uri/ /index.php?\$query_string;
    }
    location ~ \.php$ {
        fastcgi_split_path_info ^(.+\.php)(/.+)$;
        fastcgi_pass unix:/run/php/php8.3-fpm.sock;
        fastcgi_index index.php;
        include fastcgi_params;
        fastcgi_param PHP_VALUE "upload_max_filesize = 100M \n post_max_size=100M";
        fastcgi_param SCRIPT_FILENAME \$document_root\$fastcgi_script_name;
        fastcgi_param HTTP_PROXY "";
    }
    location ~ /\.ht { deny all; }
}
EOF

ln -sfn /etc/nginx/sites-available/pterodactyl.conf /etc/nginx/sites-enabled/pterodactyl.conf
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable --now php8.3-fpm redis-server mariadb nginx
if [[ "${CYBERGAU_ACCESS:-lan}" == "wireguard" ]]; then
  mkdir -p /etc/systemd/system/nginx.service.d
  cat > /etc/systemd/system/nginx.service.d/after-wireguard.conf <<'EOF'
[Unit]
After=wg-quick@wg0.service
Wants=wg-quick@wg0.service
EOF
  systemctl daemon-reload
fi
systemctl reload nginx

cat > /etc/systemd/system/pteroq.service <<'EOF'
[Unit]
Description=Pterodactyl Queue Worker
After=redis-server.service

[Service]
User=www-data
Group=www-data
Restart=always
ExecStart=/usr/bin/php /var/www/pterodactyl/artisan queue:work --queue=high,standard,low --sleep=3 --tries=3
StartLimitInterval=180
StartLimitBurst=30
RestartSec=5s

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now pteroq.service

CRON_LINE='* * * * * php /var/www/pterodactyl/artisan schedule:run >> /dev/null 2>&1'
cron_tmp="$(mktemp)"
crontab -u www-data -l 2>/dev/null | grep -v schedule:run >"$cron_tmp" || true
echo "$CRON_LINE" >>"$cron_tmp"
crontab -u www-data "$cron_tmp"
rm -f "$cron_tmp"

if ! command -v wings >/dev/null 2>&1; then
  curl -fsSL --connect-timeout 15 --max-time 180 --retry 5 --retry-delay 2 \
    -o /usr/local/bin/wings "https://github.com/pterodactyl/wings/releases/latest/download/wings_linux_amd64"
  chmod +x /usr/local/bin/wings
fi
mkdir -p /etc/pterodactyl

KEY_FILE=/etc/cybergau/panel-keys.env
if [[ ! -s "$KEY_FILE" ]]; then
  cp /opt/cybergau/deploy/panel-keys.php "$PANEL_DIR/panel-keys.php"
  (cd "$PANEL_DIR" && php panel-keys.php) >"$KEY_FILE"
  rm -f "$PANEL_DIR/panel-keys.php"
  chmod 600 "$KEY_FILE"
fi
# shellcheck disable=SC1090
source "$KEY_FILE"

APP_KEY="${APP:-}"
CLIENT_KEY="${CLIENT:-}"
if [[ -z "$APP_KEY" || -z "$CLIENT_KEY" ]]; then
  echo "Не удалось выпустить ключи панели Pterodactyl (APP/CLIENT)."
  exit 1
fi

upsert_env() {
  local name="$1"
  local value="$2"
  local file=/etc/cybergau/env
  if grep -q "^${name}=" "$file"; then
    sed -i "s|^${name}=.*|${name}=${value}|" "$file"
  else
    printf '%s=%s\n' "$name" "$value" >> "$file"
  fi
}
upsert_env PTERODACTYL_APP_KEY "$APP_KEY"
upsert_env PTERODACTYL_CLIENT_KEY "$CLIENT_KEY"
install -m 600 /etc/cybergau/env /opt/cybergau/.env

AUTH=(-H "Authorization: Bearer ${APP_KEY}" -H "Accept: Application/vnd.pterodactyl.v1+json" -H "Content-Type: application/json")
PANEL_HTTP_HOST="${BIND_ADDR:-127.0.0.1}"
if [[ "$PANEL_HTTP_HOST" == "0.0.0.0" || "$PANEL_HTTP_HOST" == "::" ]]; then
  PANEL_HTTP_HOST=127.0.0.1
fi
BASE="http://${PANEL_HTTP_HOST}:${PANEL_PORT:-8088}"

LOC_ID="$(curl -sf "${AUTH[@]}" "$BASE/api/application/locations" | jq -r '.data[0].attributes.id // empty')"
if [[ -z "$LOC_ID" ]]; then
  LOC_ID="$(curl -sf "${AUTH[@]}" -d '{"short":"lan","long":"cyberGAU"}' "$BASE/api/application/locations" | jq -r '.attributes.id')"
fi

NODE_ID="$(curl -sf "${AUTH[@]}" "$BASE/api/application/nodes" | jq -r '.data[0].attributes.id // empty')"
if [[ -z "$NODE_ID" ]]; then
  MEM="$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)"
  DISK="$(df -BM --output=size / | tail -1 | tr -dc '0-9')"
  NODE_ID="$(curl -sf "${AUTH[@]}" -d "{\"name\":\"cybergau\",\"location_id\":${LOC_ID},\"fqdn\":\"${PANEL_FQDN}\",\"scheme\":\"http\",\"behind_proxy\":false,\"maintenance_mode\":false,\"memory\":${MEM},\"memory_overallocate\":0,\"disk\":${DISK},\"disk_overallocate\":0,\"upload_size\":100,\"daemon_sftp\":2022,\"daemon_listen\":8080}" "$BASE/api/application/nodes" | jq -r '.attributes.id')"
fi

if [[ ! -f /etc/pterodactyl/config.yml ]] || grep -q '^{' /etc/pterodactyl/config.yml; then
  curl -sf -H "Authorization: Bearer ${APP_KEY}" -H "Accept: Application/vnd.pterodactyl.v1+json" \
    "$BASE/api/application/nodes/${NODE_ID}/configuration" -o /etc/pterodactyl/config.yml
  python3 /opt/cybergau/deploy/wings-config.py /etc/pterodactyl/config.yml /etc/pterodactyl/config.yml
  chmod 600 /etc/pterodactyl/config.yml
fi

if ! grep -q '^docker:' /etc/pterodactyl/config.yml; then
  cat >>/etc/pterodactyl/config.yml <<'EOF'
docker:
  network:
    interface: 172.21.0.1
    name: pterodactyl0
    network_mode: pterodactyl0
    is_internal: false
    enable_icc: true
    network_mtu: 1450
    interfaces:
      v4:
        subnet: 172.21.0.0/16
        gateway: 172.21.0.1
EOF
fi

cat > /etc/systemd/system/wings.service <<'EOF'
[Unit]
Description=Pterodactyl Wings
After=docker.service
Requires=docker.service

[Service]
User=root
WorkingDirectory=/etc/pterodactyl
LimitNOFILE=4096
PIDFile=/var/run/wings/daemon.pid
ExecStart=/usr/local/bin/wings
Restart=on-failure
StartLimitInterval=180
StartLimitBurst=30
RestartSec=5s

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl reset-failed wings || true
systemctl enable --now wings

if [[ -z "${LOC_ID:-}" || -z "${NODE_ID:-}" ]]; then
  echo "Панель не создала location/node (LOC_ID=${LOC_ID:-} NODE_ID=${NODE_ID:-})"
  exit 1
fi

systemctl enable --now nginx
systemctl enable --now wings
if ! systemctl is-active --quiet nginx; then
  echo "nginx не активен после установки панели"
  exit 1
fi
if ! systemctl is-active --quiet wings; then
  echo "wings не активен после установки панели"
  systemctl status wings --no-pager -l || true
  exit 1
fi

POOL="${POOL_SIZE:-1}"
EXISTING="$(curl -sf "${AUTH[@]}" "$BASE/api/application/servers?per_page=100" | jq -r '[.data[].attributes.name | select(startswith("cybergau-"))] | length')"
NEED=$((POOL - EXISTING))
cybergau_step "CS2 pool: existing=${EXISTING} need=${NEED} (POOL_SIZE=${POOL})"
if [[ "$NEED" -gt 0 ]]; then
  EGG_JSON=/opt/cybergau/deploy/eggs/counter-strike-2.json
  mkdir -p /var/lib/cybergau
  if [[ ! -s "$EGG_JSON" ]]; then
    echo "Нет шаблона CS2: $EGG_JSON"
    exit 1
  fi
  cybergau_step "nest cyberGAU + import egg"
  NEST_ID="$(curl -sf "${AUTH[@]}" "$BASE/api/application/nests?per_page=100" \
    | jq -r '.data[] | select(.attributes.name == "cyberGAU") | .attributes.id' | head -n1)"
  if [[ -z "$NEST_ID" ]]; then
    NEST_ID="$(curl -sf "${AUTH[@]}" -d '{"name":"cyberGAU","description":"CS2 pool"}' "$BASE/api/application/nests" | jq -r '.attributes.id // empty')"
  fi
  if [[ -z "$NEST_ID" ]]; then
    echo "Не удалось создать nest cyberGAU для CS2"
    exit 1
  fi
  EGG_ID="$(cd "$PANEL_DIR" && PANEL_DIR="$PANEL_DIR" NEST_ID="$NEST_ID" EGG_PATH="$EGG_JSON" php /opt/cybergau/deploy/import-egg.php)"
  if [[ -z "$EGG_ID" ]]; then
    echo "Egg CS2 не импортирован"
    exit 1
  fi

  NODE_DISK_MB="$(curl -sf "${AUTH[@]}" "$BASE/api/application/nodes/${NODE_ID}" | jq -r '.attributes.disk // 0')"
  WANT_DISK="${CS2_DISK_MB:-90000}"
  if [[ "${NODE_DISK_MB:-0}" -gt 0 ]]; then
    # Leave ~10% headroom on the node for panel/OS/other use.
    MAX_DISK=$((NODE_DISK_MB * 90 / 100))
    if [[ "$MAX_DISK" -lt 20000 ]]; then
      MAX_DISK="$NODE_DISK_MB"
    fi
    if [[ "$WANT_DISK" -gt "$MAX_DISK" ]]; then
      echo "CS2_DISK_MB=${WANT_DISK} больше диска ноды (${NODE_DISK_MB} MB) — урезаю до ${MAX_DISK}"
      WANT_DISK="$MAX_DISK"
    fi
  fi
  if [[ "$WANT_DISK" -lt 20000 ]]; then
    echo "Предупреждение: диск слота ${WANT_DISK} MB — CS2 может не установиться (нужно десятки GB)"
  fi

  RCON_PASSWORD="$(openssl rand -hex 8)"
  find_alloc() {
    local port="$1"
    curl -sf "${AUTH[@]}" "$BASE/api/application/nodes/${NODE_ID}/allocations?per_page=100" \
      | jq -r --arg ip "$ALLOC_IP" --argjson port "$port" \
        '.data[] | select(.attributes.ip == $ip and .attributes.port == $port and (.attributes.assigned | not)) | .attributes.id' \
      | head -n1
  }
  for i in $(seq 1 "$NEED"); do
    PORT=$((27015 + EXISTING + i - 1))
    ALLOC="$(find_alloc "$PORT")"
    if [[ -z "$ALLOC" ]]; then
      # Panel may return 204 with empty body when the port already exists.
      curl -sf "${AUTH[@]}" -d "{\"ip\":\"${ALLOC_IP}\",\"ports\":[\"${PORT}\"]}" \
        "$BASE/api/application/nodes/${NODE_ID}/allocations" >/dev/null || true
      ALLOC="$(find_alloc "$PORT")"
    fi
    if [[ -z "$ALLOC" ]]; then
      echo "Не удалось создать allocation на порту ${PORT}"
      exit 1
    fi
    USER_ID="$(curl -sf "${AUTH[@]}" "$BASE/api/application/users" | jq -r '.data[0].attributes.id')"
    if [[ -z "$USER_ID" || "$USER_ID" == "null" ]]; then
      echo "В панели нет пользователя для слота CS2"
      exit 1
    fi
    EGG_BODY="$(curl -sf "${AUTH[@]}" "$BASE/api/application/nests/${NEST_ID}/eggs/${EGG_ID}?include=variables")"
    STARTUP="$(echo "$EGG_BODY" | jq -r '.attributes.startup')"
    IMAGE="$(echo "$EGG_BODY" | jq -r '.attributes.docker_image // (.attributes.docker_images | to_entries[0].value) // "ghcr.io/ptero-eggs/steamcmd:sniper"')"
    SKIN_API="${PUBLIC_WEB_URL:-http://${ADVERTISE_HOST:-${ALLOC_IP:-127.0.0.1}}:3000}"
    SKIN_API="${SKIN_API%/}/backend"
    # Omit empty STEAM_GSLT — Laravel nullable+size rejects "".
    ENV_JSON="$(jq -nc --arg rcon "$RCON_PASSWORD" --arg gslt "${STEAM_GSLT:-}" --arg skin "$SKIN_API" '
      {
        SRCDS_MAP: "de_dust2",
        SRCDS_APPID: "730",
        MAX_PLAYERS: "16",
        AUTO_UPDATE: "1",
        TV_PORT: "27020",
        VAC_ENABLED: "0",
        RCON_ENABLED: "0",
        SERVER_NAME: "cyberGAU",
        SERVER_PASSWORD: "",
        RCON_PASSWORD: $rcon,
        GAME_MODE: "1",
        GAME_TYPE: "0",
        SKIN_API_BASE: $skin,
        SKIN_PLUGIN_URL: ($skin + "/skins/plugin.zip")
      }
      + (if ($gslt | length) > 0 then {STEAM_GSLT: $gslt} else {} end)
    ')"
    SLOT_NAME="cybergau-$((EXISTING + i))"
    cybergau_step "create server ${SLOT_NAME} (alloc=${ALLOC} disk=${WANT_DISK}MB egg=${EGG_ID})"
    CREATE_BODY="$(jq -nc \
      --arg name "$SLOT_NAME" \
      --argjson user "$USER_ID" \
      --argjson egg "$EGG_ID" \
      --arg image "$IMAGE" \
      --arg startup "$STARTUP" \
      --argjson environment "$ENV_JSON" \
      --argjson memory "${CS2_MEMORY_MB:-2048}" \
      --argjson disk "$WANT_DISK" \
      --argjson cpu "${CS2_CPU:-200}" \
      --argjson alloc "$ALLOC" \
      '{
        name: $name,
        user: $user,
        egg: $egg,
        docker_image: $image,
        startup: $startup,
        environment: $environment,
        limits: {memory: $memory, swap: 0, disk: $disk, io: 500, cpu: $cpu},
        feature_limits: {databases: 0, allocations: 0, backups: 0},
        allocation: {default: $alloc},
        start_on_completion: false
      }')"
    CREATE_RESP="$(mktemp)"
    CREATE_CODE="$(curl -sS -o "$CREATE_RESP" -w '%{http_code}' "${AUTH[@]}" -d "$CREATE_BODY" \
      "$BASE/api/application/servers" || echo 000)"
    if [[ "$CREATE_CODE" != "200" && "$CREATE_CODE" != "201" ]]; then
      echo "Слот ${SLOT_NAME} не создан (HTTP ${CREATE_CODE}): $(cat "$CREATE_RESP")"
      rm -f "$CREATE_RESP"
      exit 1
    fi
    rm -f "$CREATE_RESP"
  done
fi

FINAL_COUNT="$(curl -sf "${AUTH[@]}" "$BASE/api/application/servers?per_page=100" | jq -r '[.data[].attributes.name | select(startswith("cybergau-"))] | length')"
if [[ "${FINAL_COUNT:-0}" -lt "$POOL" ]]; then
  echo "В панели только ${FINAL_COUNT:-0} слот(ов) cybergau-*, нужно ${POOL}"
  exit 1
fi

if ! grep -q '^PTERODACTYL_APP_KEY=.\+' /etc/cybergau/env || ! grep -q '^PTERODACTYL_CLIENT_KEY=.\+' /etc/cybergau/env; then
  echo "Ключи панели не записаны в /etc/cybergau/env"
  exit 1
fi
install -m 600 /etc/cybergau/env /opt/cybergau/.env

systemctl restart cybergau.service
PLUGIN_URL="${PUBLIC_WEB_URL:-http://${ADVERTISE_HOST:-${ALLOC_IP:-127.0.0.1}}:3000}"
PLUGIN_URL="${PLUGIN_URL%/}/backend/skins/plugin.zip"
echo "Pterodactyl: http://${PANEL_FQDN}:${PANEL_PORT:-8088}"
echo "Пул CS2: ${FINAL_COUNT} слот(ов) cybergau-*"
echo "Скинченджер: ${PLUGIN_URL}"
if [[ -z "${STEAM_WEB_API_KEY:-}" ]]; then
  echo "Предупреждение: STEAM_WEB_API_KEY пуст — аватар/часы Steam недоступны"
fi
if [[ -z "${STEAM_GSLT:-}" ]]; then
  echo "Предупреждение: STEAM_GSLT пуст — LAN-сервер без токена (ok для -insecure)"
fi
