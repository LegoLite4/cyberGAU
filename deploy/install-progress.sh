#!/usr/bin/env bash
# Resume helpers for interrupted cyberGAU installs.
# State file: /var/lib/cybergau/install-state (one STEP id per line).
# FORCE_INSTALL=1 ignores state and re-runs every step.
# shellcheck shell=bash

CYBERGAU_INSTALL_STATE="${CYBERGAU_INSTALL_STATE:-/var/lib/cybergau/install-state}"

cybergau_progress_init() {
  mkdir -p "$(dirname "$CYBERGAU_INSTALL_STATE")"
  touch "$CYBERGAU_INSTALL_STATE"
  chmod 644 "$CYBERGAU_INSTALL_STATE" 2>/dev/null || true
}

cybergau_done() {
  local step="$1"
  cybergau_progress_init
  if ! grep -qxF "$step" "$CYBERGAU_INSTALL_STATE" 2>/dev/null; then
    printf '%s\n' "$step" >>"$CYBERGAU_INSTALL_STATE"
  fi
  echo "install-progress: done ${step}"
}

cybergau_step_recorded() {
  local step="$1"
  [[ "${FORCE_INSTALL:-0}" == "1" ]] && return 1
  grep -qxF "$step" "$CYBERGAU_INSTALL_STATE" 2>/dev/null
}

# Return 0 if the step should RUN; 1 if it should be skipped.
cybergau_should_run() {
  local step="$1"
  if [[ "${FORCE_INSTALL:-0}" == "1" ]]; then
    return 0
  fi
  cybergau_progress_init

  # Heuristics: treat already-complete work as done even without a marker.
  case "$step" in
    docker_stack)
      if systemctl is-active --quiet cybergau.service 2>/dev/null \
        && docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^cybergau-api-1$' \
        && docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^cybergau-web-1$' \
        && docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^cybergau-postgres-1$'; then
        cybergau_done docker_stack
        echo "install-progress: skip docker_stack (stack already up)"
        return 1
      fi
      ;;
    skinchanger)
      if [[ -s /var/lib/cybergau/skinchanger/CybergauSkins.zip ]]; then
        cybergau_done skinchanger
        echo "install-progress: skip skinchanger (zip present)"
        return 1
      fi
      ;;
    cs2_base)
      if [[ -x /var/lib/cybergau/cs2-base/game/bin/linuxsteamrt64/cs2 ]]; then
        cybergau_done cs2_base
        echo "install-progress: skip cs2_base (binary present)"
        return 1
      fi
      ;;
    pterodactyl)
      if [[ -d /var/www/pterodactyl ]] \
        && [[ -f /etc/pterodactyl/config.yml ]] \
        && systemctl is-active --quiet wings 2>/dev/null \
        && systemctl is-active --quiet nginx 2>/dev/null \
        && grep -q '^PTERODACTYL_APP_KEY=.\+' /etc/cybergau/env 2>/dev/null; then
        # Only skip full pterodactyl if wings YAML looks sane.
        if ! grep -qE '^allowed_mounts:[[:space:]]*\[\][[:space:]]*$' /etc/pterodactyl/config.yml 2>/dev/null; then
          cybergau_done pterodactyl
          echo "install-progress: skip pterodactyl (panel+wings already active)"
          return 1
        fi
        echo "install-progress: pterodactyl present but wings YAML broken — will repair"
      fi
      ;;
    acceptance)
      if cybergau_step_recorded acceptance; then
        echo "install-progress: skip acceptance (recorded)"
        return 1
      fi
      ;;
  esac

  if cybergau_step_recorded "$step"; then
    echo "install-progress: skip ${step} (recorded)"
    return 1
  fi
  return 0
}
