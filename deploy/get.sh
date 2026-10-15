#!/usr/bin/env bash
# Публичный установщик cyberGAU (клон + автонастройка + install).
#
#   curl -fsSL https://raw.githubusercontent.com/LegoLite4/cyberGAU/main/deploy/get.sh | sudo bash
#
# Опции: CYBERGAU_ACCESS=lan STEAM_WEB_API_KEY=... WG_ENDPOINT=ip:51820 POOL_SIZE=1 CYBERGAU_BRANCH=main
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Нужен root: curl -fsSL https://raw.githubusercontent.com/LegoLite4/cyberGAU/main/deploy/get.sh | sudo bash"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
export HOME="${HOME:-/root}"

REPO_SLUG="${CYBERGAU_REPO_SLUG:-LegoLite4/cyberGAU}"
BRANCH="${CYBERGAU_BRANCH:-main}"
TARGET=/opt/cybergau

apt-get update -qq
apt-get install -y -qq ca-certificates curl git openssl >/dev/null

if [[ ! -f "$TARGET/deploy/bootstrap.sh" ]]; then
  echo "Клонирую https://github.com/${REPO_SLUG} → $TARGET"
  rm -rf "$TARGET"
  git clone --depth 1 -b "$BRANCH" "https://github.com/${REPO_SLUG}.git" "$TARGET"
else
  echo "Код уже в $TARGET"
fi

exec bash "$TARGET/deploy/bootstrap.sh"
