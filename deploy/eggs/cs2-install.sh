#!/bin/bash
# Wings install containers do NOT receive Panel mounts (/cs2-base).
# The node host runs deploy/link-cs2-slot.sh to hardlink the shared base into this volume.
# This script only waits for that host linker (or accepts an already-linked volume).
set -euo pipefail

CS2_BIN="/mnt/server/game/bin/linuxsteamrt64/cs2"
echo "Waiting for host linker to populate $CS2_BIN (mounts unavailable during install)..."
for _ in $(seq 1 180); do
  if [[ -x "$CS2_BIN" ]]; then
    echo "cyberGAU slot volume ready (host hardlink)"
    exit 0
  fi
  sleep 2
done
echo "Timed out waiting for host linker. On the node run:"
echo "  sudo bash /opt/cybergau/deploy/link-cs2-slot.sh <server-uuid>"
exit 1
