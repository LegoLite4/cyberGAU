# Общий лог установки: `source deploy/install-log.sh`
# Пишет в /var/log/cybergau-install.log; при ненулевом exit печатает команду для поддержки.
# shellcheck shell=bash

CYBERGAU_INSTALL_LOG="${CYBERGAU_INSTALL_LOG:-/var/log/cybergau-install.log}"

cybergau_step() {
  echo
  echo ">>> [$(date +%H:%M:%S)] $*"
}

cybergau_fail_hint() {
  local ec="${1:-1}"
  echo
  echo "======== УСТАНОВКА ПРЕРВАНА (exit ${ec}) ========"
  echo "Время: $(date -Is)"
  echo "Полный лог: ${CYBERGAU_INSTALL_LOG}"
  echo "Пришлите в чат поддержки вывод:"
  echo "  tail -n 250 ${CYBERGAU_INSTALL_LOG}"
  echo "=============================================="
}

if [[ "${CYBERGAU_INSTALL_LOGGING:-0}" == "1" ]]; then
  return 0 2>/dev/null || true
fi
export CYBERGAU_INSTALL_LOGGING=1

mkdir -p "$(dirname "$CYBERGAU_INSTALL_LOG")"
touch "$CYBERGAU_INSTALL_LOG"
chmod 644 "$CYBERGAU_INSTALL_LOG" 2>/dev/null || true

{
  echo
  echo "======== cyberGAU install $(date -Is) pid=$$ host=$(hostname -f 2>/dev/null || hostname) ========"
  echo "argv: ${0-} $*"
  echo "cwd: $(pwd 2>/dev/null || true)"
  echo "log: $CYBERGAU_INSTALL_LOG"
} | tee -a "$CYBERGAU_INSTALL_LOG"

exec > >(tee -a "$CYBERGAU_INSTALL_LOG") 2>&1

cybergau_on_exit() {
  local ec=$?
  if [[ "$ec" -ne 0 ]]; then
    cybergau_fail_hint "$ec"
  fi
}
trap cybergau_on_exit EXIT
