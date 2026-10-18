#!/usr/bin/env bash
# Одна команда: клон (если нужно) → env → полная установка cyberGAU (+ панель при INSTALL_PTERODACTYL=1).
#
# Примеры:
#   sudo STEAM_WEB_API_KEY=xxx bash deploy/bootstrap.sh
#   sudo STEAM_WEB_API_KEY=xxx CYBERGAU_ACCESS=lan bash /opt/cybergau/deploy/bootstrap.sh
#   sudo STEAM_WEB_API_KEY=xxx WG_ENDPOINT=1.2.3.4:51820 bash deploy/bootstrap.sh
#
# Ключ: https://steamcommunity.com/dev/apikey (домен: localhost или LAN-IP)
#
# Свежая Ubuntu с deploy-ключом:
#   sudo bash -c 'export GIT_SSH_COMMAND="ssh -i /root/.ssh/cybergau_deploy -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"; git clone --depth 1 git@github.com:LegoLite4/cyberGAU.git /opt/cybergau && exec bash /opt/cybergau/deploy/bootstrap.sh'
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Запустите: sudo STEAM_WEB_API_KEY=ВАШ_КЛЮЧ bash deploy/bootstrap.sh"
  exit 1
fi

if [[ -z "${STEAM_WEB_API_KEY:-}" ]]; then
  echo "Нужен STEAM_WEB_API_KEY. См. https://steamcommunity.com/dev/apikey (домен: localhost или LAN-IP)."
  echo "  sudo STEAM_WEB_API_KEY=ВАШ_КЛЮЧ bash deploy/bootstrap.sh"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
export HOME="${HOME:-/root}"

REPO_SLUG="${CYBERGAU_REPO_SLUG:-LegoLite4/cyberGAU}"
BRANCH="${CYBERGAU_BRANCH:-main}"
REPO="${CYBERGAU_REPO:-}"
DEPLOY_KEY="${CYBERGAU_DEPLOY_KEY:-/root/.ssh/cybergau_deploy}"
TOKEN="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
TARGET=/opt/cybergau

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$(cd "$HERE/.." && pwd)"

# shellcheck disable=SC1091
source "$HERE/install-log.sh"
cybergau_step "bootstrap start (branch=${BRANCH})"

if [[ -z "${GIT_SSH_COMMAND:-}" && -f "$DEPLOY_KEY" ]]; then
  export GIT_SSH_COMMAND="ssh -i ${DEPLOY_KEY} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
fi

apt-get update -qq
apt-get install -y -qq ca-certificates curl git openssl >/dev/null

ensure_repo() {
  if [[ -d "$TARGET/.git" ]]; then
    echo "Обновляю ${TARGET} → origin/${BRANCH}"
    git -C "$TARGET" remote set-url origin "https://github.com/${REPO_SLUG}.git" 2>/dev/null || true
    git -C "$TARGET" fetch --depth 1 origin "$BRANCH"
    git -C "$TARGET" checkout -B "$BRANCH" "origin/${BRANCH}"
    git -C "$TARGET" reset --hard "origin/${BRANCH}"
    git -C "$TARGET" clean -fd
    echo "HEAD: $(git -C "$TARGET" rev-parse --short HEAD) $(git -C "$TARGET" log -1 --pretty=%s)"
    return 0
  fi
  if [[ -f "$TARGET/deploy/install.sh" ]]; then
    echo "Код уже в $TARGET (без .git)"
    return 0
  fi
  if [[ -f "$SRC/deploy/install.sh" && "$SRC" != "$TARGET" ]]; then
    echo "Копирую дерево из $SRC → $TARGET"
    mkdir -p "$TARGET"
    apt-get install -y -qq rsync >/dev/null
    rsync -a --delete --exclude node_modules --exclude .next --exclude dist "$SRC"/ "$TARGET"/
    return 0
  fi

  rm -rf "$TARGET"
  if [[ -n "$REPO" ]]; then
    echo "Клонирую $REPO → $TARGET"
    git clone --depth 1 "$REPO" "$TARGET"
    return 0
  fi
  if [[ -n "$TOKEN" ]]; then
    echo "Клонирую https://github.com/${REPO_SLUG} (token) → $TARGET"
    git clone --depth 1 -b "$BRANCH" \
      "https://x-access-token:${TOKEN}@github.com/${REPO_SLUG}.git" "$TARGET"
    git -C "$TARGET" remote set-url origin "https://github.com/${REPO_SLUG}.git"
    return 0
  fi
  echo "Клонирую https://github.com/${REPO_SLUG}.git → $TARGET"
  git clone --depth 1 -b "$BRANCH" "https://github.com/${REPO_SLUG}.git" "$TARGET"
}

ensure_repo

# Proxmox clone/resize: make full disk visible before Steam/Docker need space.
if [[ -f "$TARGET/deploy/grow-root-disk.sh" ]]; then
  cybergau_step "grow-root-disk.sh"
  bash "$TARGET/deploy/grow-root-disk.sh" || echo "grow-root-disk: продолжаю без расширения"
fi

cybergau_step "write-env"
bash "$TARGET/deploy/write-env.sh"
cybergau_step "install.sh"
bash "$TARGET/deploy/install.sh"

echo
echo "Готово. Одна команда отработала до конца."
echo "Сайт: $(grep -E '^PUBLIC_WEB_URL=' /etc/cybergau/env | cut -d= -f2-)"
echo "Скинченджер: $(grep -E '^PUBLIC_WEB_URL=' /etc/cybergau/env | cut -d= -f2-)/backend/skins/plugin.zip"
if grep -q '^CYBERGAU_ACCESS=wireguard' /etc/cybergau/env; then
  echo "WireGuard-клиент: /etc/cybergau/wg-client.conf"
fi
echo "Пароль админа панели: $(grep -E '^ADMIN_PASSWORD=' /etc/cybergau/env | cut -d= -f2-)"
echo "STEAM_WEB_API_KEY задан в /etc/cybergau/env (привязка Steam / профиль)."
echo "Лог установки: ${CYBERGAU_INSTALL_LOG:-/var/log/cybergau-install.log}"
