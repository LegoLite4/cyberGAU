#!/usr/bin/env bash
# Устанавливает Pterodactyl Panel, Wings и шаблон пула CS2.
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Запустите от root"
  exit 1
fi

ENV_FILE=/etc/cybergau/env
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

export DEBIAN_FRONTEND=noninteractive
: "${PANEL_DB_PASSWORD:?}"
: "${ADMIN_EMAIL:?}"
: "${ADMIN_PASSWORD:?}"
: "${PANEL_FQDN:?}"
: "${ALLOC_IP:?}"

apt-get update
apt-get install -y \
  nginx mariadb-server redis-server tar unzip git curl jq \
  php8.3 php8.3-cli php8.3-fpm php8.3-mysql php8.3-gd php8.3-mbstring \
  php8.3-bcmath php8.3-xml php8.3-curl php8.3-zip php8.3-intl php8.3-redis

if ! command -v composer >/dev/null 2>&1; then
  curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer
fi

mysql -e "CREATE DATABASE IF NOT EXISTS panel;"
mysql -e "CREATE USER IF NOT EXISTS 'pterodactyl'@'127.0.0.1' IDENTIFIED BY '${PANEL_DB_PASSWORD}';"
mysql -e "GRANT ALL PRIVILEGES ON panel.* TO 'pterodactyl'@'127.0.0.1' WITH GRANT OPTION;"
mysql -e "FLUSH PRIVILEGES;"

PANEL_DIR=/var/www/pterodactyl
if [[ ! -f "$PANEL_DIR/artisan" ]]; then
  mkdir -p "$PANEL_DIR"
  cd "$PANEL_DIR"
  curl -L -o panel.tar.gz https://github.com/pterodactyl/panel/releases/latest/download/panel.tar.gz
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
(crontab -u www-data -l 2>/dev/null | grep -v schedule:run; echo "$CRON_LINE") | crontab -u www-data -

if ! command -v wings >/dev/null 2>&1; then
  curl -L -o /usr/local/bin/wings "https://github.com/pterodactyl/wings/releases/latest/download/wings_linux_amd64"
  chmod +x /usr/local/bin/wings
fi
mkdir -p /etc/pterodactyl

KEY_FILE=/etc/cybergau/panel-keys.env
if [[ ! -s "$KEY_FILE" ]]; then
  cp /opt/cybergau/deploy/panel-keys.php "$PANEL_DIR/panel-keys.php"
  (cd "$PANEL_DIR" && php panel-keys.php) | tee "$KEY_FILE"
  rm -f "$PANEL_DIR/panel-keys.php"
  chmod 600 "$KEY_FILE"
fi
# shellcheck disable=SC1090
source "$KEY_FILE"

APP_KEY="${APP:-}"
CLIENT_KEY="${CLIENT:-}"
if [[ -z "$APP_KEY" || -z "$CLIENT_KEY" ]]; then
  echo "Не удалось выпустить ключи панели. Веб cyberGAU продолжит работу без пула."
  exit 0
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
BASE="http://127.0.0.1:${PANEL_PORT:-8088}"

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

if [[ ! -f /etc/pterodactyl/config.yml ]]; then
  curl -sf "${AUTH[@]}" "$BASE/api/application/nodes/${NODE_ID}/configuration" -o /etc/pterodactyl/config.yml
  chmod 600 /etc/pterodactyl/config.yml
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
systemctl enable --now wings

POOL="${POOL_SIZE:-1}"
EXISTING="$(curl -sf "${AUTH[@]}" "$BASE/api/application/servers?per_page=100" | jq -r '[.data[].attributes.name | select(startswith("cybergau-"))] | length')"
NEED=$((POOL - EXISTING))
if [[ "$NEED" -gt 0 ]]; then
  EGG_JSON=/var/lib/cybergau/cs2-egg.json
  mkdir -p /var/lib/cybergau
  if [[ ! -s "$EGG_JSON" ]]; then
    for url in \
      "https://raw.githubusercontent.com/pterodactyl/eggs/master/game_eggs/steamcmd/counter-strike-2/egg-counter-strike-2.json" \
      "https://raw.githubusercontent.com/parkervcp/eggs/master/game_eggs/steamcmd_servers/counter_strike_2/egg-counter--strike-2.json"
    do
      curl -fsSL "$url" -o "$EGG_JSON" && break || true
    done
  fi
  if [[ -s "$EGG_JSON" ]]; then
    NEST_ID="$(curl -sf "${AUTH[@]}" "$BASE/api/application/nests" | jq -r '.data[0].attributes.id')"
    php "$PANEL_DIR/artisan" list | grep -q 'p:egg' && php "$PANEL_DIR/artisan" p:import-egg "$EGG_JSON" || true
    EGG_ID="$(curl -sf "${AUTH[@]}" "$BASE/api/application/nests/${NEST_ID}/eggs" | jq -r '.data[] | select(.attributes.name|test("Counter-Strike 2|CS2";"i")) | .attributes.id' | head -1)"
    if [[ -n "$EGG_ID" ]]; then
      for i in $(seq 1 "$NEED"); do
        PORT=$((27015 + EXISTING + i - 1))
        ALLOC="$(curl -sf "${AUTH[@]}" -d "{\"ip\":\"${ALLOC_IP}\",\"ports\":[\"${PORT}\"]}" "$BASE/api/application/nodes/${NODE_ID}/allocations" | jq -r '.data[0].attributes.id // .attributes.id // empty')"
        USER_ID="$(curl -sf "${AUTH[@]}" "$BASE/api/application/users" | jq -r '.data[0].attributes.id')"
        STARTUP="$(curl -sf "${AUTH[@]}" "$BASE/api/application/nests/${NEST_ID}/eggs/${EGG_ID}?include=variables" | jq -r '.attributes.startup')"
        IMAGE="$(curl -sf "${AUTH[@]}" "$BASE/api/application/nests/${NEST_ID}/eggs/${EGG_ID}" | jq -r '.attributes.docker_image')"
        curl -sf "${AUTH[@]}" -d "{\"name\":\"cybergau-$((EXISTING + i))\",\"user\":${USER_ID},\"egg\":${EGG_ID},\"docker_image\":\"${IMAGE}\",\"startup\":\"${STARTUP}\",\"environment\":{\"SRCDS_MAP\":\"de_dust2\",\"STEAM_ACC\":\"\",\"SERVER_NAME\":\"cyberGAU\",\"MAX_PLAYERS\":\"16\",\"GAME_MODE\":\"1\",\"GAME_TYPE\":\"0\"},\"limits\":{\"memory\":${CS2_MEMORY_MB:-2048},\"swap\":0,\"disk\":${CS2_DISK_MB:-40960},\"io\":500,\"cpu\":${CS2_CPU:-200}},\"feature_limits\":{\"databases\":0,\"allocations\":0,\"backups\":0},\"allocation\":{\"default\":${ALLOC}},\"start_on_completion\":false}" \
          "$BASE/api/application/servers" >/dev/null || echo "Слот cybergau-$((EXISTING + i)) не создан"
      done
    else
      echo "Egg CS2 не импортирован. Положите JSON в $EGG_JSON и повторите deploy/pterodactyl.sh"
    fi
  fi
fi

systemctl restart cybergau.service || true
echo "Pterodactyl: http://${PANEL_FQDN}:${PANEL_PORT:-8088}"
