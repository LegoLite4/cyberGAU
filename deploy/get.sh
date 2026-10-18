#!/usr/bin/env bash
# Публичный установщик cyberGAU (клон/обновление + bootstrap).
#
#   curl -fsSL https://raw.githubusercontent.com/LegoLite4/cyberGAU/main/deploy/get.sh \
#     | sudo STEAM_WEB_API_KEY=ВАШ_КЛЮЧ bash
#
# Обязательно: STEAM_WEB_API_KEY (https://steamcommunity.com/dev/apikey — домен: localhost или LAN-IP)
# Опции: CYBERGAU_ACCESS=lan STEAM_GSLT=... WG_ENDPOINT=ip:51820 POOL_SIZE=1 CYBERGAU_BRANCH=main
# Лог: /var/log/cybergau-install.log  →  при ошибке: tail -n 250 /var/log/cybergau-install.log
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Нужен root:"
  echo "  curl -fsSL https://raw.githubusercontent.com/LegoLite4/cyberGAU/main/deploy/get.sh | sudo STEAM_WEB_API_KEY=ВАШ_КЛЮЧ bash"
  exit 1
fi

if [[ -z "${STEAM_WEB_API_KEY:-}" ]]; then
  echo "Задайте STEAM_WEB_API_KEY (ключ с https://steamcommunity.com/dev/apikey)."
  echo "Для локальной платформы в поле «Домен» укажите localhost или ваш LAN-IP."
  echo "Пример:"
  echo "  curl -fsSL https://raw.githubusercontent.com/LegoLite4/cyberGAU/main/deploy/get.sh | sudo STEAM_WEB_API_KEY=ВАШ_КЛЮЧ bash"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
export HOME="${HOME:-/root}"

REPO_SLUG="${CYBERGAU_REPO_SLUG:-LegoLite4/cyberGAU}"
BRANCH="${CYBERGAU_BRANCH:-main}"
TARGET=/opt/cybergau
export CYBERGAU_INSTALL_LOG="${CYBERGAU_INSTALL_LOG:-/var/log/cybergau-install.log}"

mkdir -p "$(dirname "$CYBERGAU_INSTALL_LOG")"
touch "$CYBERGAU_INSTALL_LOG"
chmod 644 "$CYBERGAU_INSTALL_LOG" 2>/dev/null || true

log() { echo "$*" | tee -a "$CYBERGAU_INSTALL_LOG"; }

trap 'ec=$?; if [[ $ec -ne 0 ]]; then
  echo | tee -a "$CYBERGAU_INSTALL_LOG"
  echo "======== УСТАНОВКА ПРЕРВАНА (exit ${ec}) ========" | tee -a "$CYBERGAU_INSTALL_LOG"
  echo "Лог: ${CYBERGAU_INSTALL_LOG}" | tee -a "$CYBERGAU_INSTALL_LOG"
  echo "Пришлите: tail -n 250 ${CYBERGAU_INSTALL_LOG}" | tee -a "$CYBERGAU_INSTALL_LOG"
  echo "==============================================" | tee -a "$CYBERGAU_INSTALL_LOG"
fi' EXIT

log "======== cyberGAU get.sh $(date -Is) branch=${BRANCH} ========"

# Ждём чужой apt/dpkg (параллельный get.sh / unattended-upgrades).
for _lock_wait in $(seq 1 60); do
  if ! fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1 \
    && ! fuser /var/lib/dpkg/lock >/dev/null 2>&1; then
    break
  fi
  log "Жду освобождения apt/dpkg lock (${_lock_wait}/60)..."
  sleep 5
done

apt-get update -qq
apt-get install -y -qq ca-certificates curl git openssl cloud-guest-utils parted e2fsprogs >/dev/null

# After Proxmox resize/clone the virtual disk is bigger, but the root partition
# often stays at the old size — grow it before we download CS2 / Docker images.
if [[ -x "$TARGET/deploy/grow-root-disk.sh" ]]; then
  log "Расширяю корневой раздел под размер диска (grow-root-disk.sh)"
  bash "$TARGET/deploy/grow-root-disk.sh" || log "grow-root-disk: пропускаю (см. вывод выше)"
elif command -v growpart >/dev/null 2>&1; then
  log "Расширяю корневой раздел (inline growpart)"
  ROOT_SRC="$(findmnt -n -o SOURCE / || true)"
  PART="$ROOT_SRC"
  if [[ "$PART" == /dev/mapper/* ]] || [[ "$PART" == /dev/dm-* ]]; then
    PART="$(pvs --noheadings -o pv_name 2>/dev/null | awk 'NF{print $1; exit}' || true)"
  fi
  if [[ "$PART" =~ ^(/dev/nvme[0-9]+n[0-9]+)p([0-9]+)$ ]]; then
    growpart "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}" || true
  elif [[ "$PART" =~ ^(/dev/[a-zA-Z]+[a-zA-Z0-9]*)([0-9]+)$ ]]; then
    growpart "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}" || true
  fi
  if command -v pvresize >/dev/null 2>&1; then
    pvresize "$PART" 2>/dev/null || true
    lvextend -l +100%FREE "$(findmnt -n -o SOURCE /)" 2>/dev/null || true
  fi
  case "$(findmnt -n -o FSTYPE /)" in
    ext*) resize2fs "$(findmnt -n -o SOURCE /)" || true ;;
    xfs) xfs_growfs / || true ;;
  esac
  df -h / | tee -a "$CYBERGAU_INSTALL_LOG" || true
fi

if [[ -d "$TARGET/.git" ]]; then
  log "Обновляю ${TARGET} → origin/${BRANCH}"
  git -C "$TARGET" remote set-url origin "https://github.com/${REPO_SLUG}.git" 2>/dev/null || true
  git -C "$TARGET" fetch --depth 1 origin "$BRANCH"
  git -C "$TARGET" checkout -B "$BRANCH" "origin/${BRANCH}"
  git -C "$TARGET" reset --hard "origin/${BRANCH}"
  git -C "$TARGET" clean -fd
  log "HEAD: $(git -C "$TARGET" rev-parse --short HEAD) $(git -C "$TARGET" log -1 --pretty=%s)"
elif [[ ! -f "$TARGET/deploy/bootstrap.sh" ]]; then
  log "Клонирую https://github.com/${REPO_SLUG} → $TARGET"
  rm -rf "$TARGET"
  git clone --depth 1 -b "$BRANCH" "https://github.com/${REPO_SLUG}.git" "$TARGET"
  log "HEAD: $(git -C "$TARGET" rev-parse --short HEAD)"
else
  log "Код уже в $TARGET (без .git — не обновляю)"
fi

# Repo is present now — run the full grow script (LVM/ext4/xfs) before install.
if [[ -x "$TARGET/deploy/grow-root-disk.sh" ]]; then
  log "grow-root-disk.sh (после клона репо)"
  bash "$TARGET/deploy/grow-root-disk.sh" || log "grow-root-disk: не удалось расширить — проверьте df -h /"
fi

trap - EXIT
exec bash "$TARGET/deploy/bootstrap.sh"
