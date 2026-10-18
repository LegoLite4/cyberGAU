#!/usr/bin/env bash
# Expand the root partition + filesystem to fill the virtual disk.
# Needed after Proxmox disk resize / clone: the guest often keeps the old partition size.
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Запустите от root: sudo bash deploy/grow-root-disk.sh"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

before="$(df -h / | awk 'NR==2 {print $2, $4}')"
echo "Корень до: size=${before%% *} avail=${before##* }"

# Root mount source, e.g. /dev/sda1, /dev/mapper/ubuntu--vg-ubuntu--lv, /dev/vda2
ROOT_SRC="$(findmnt -n -o SOURCE /)"
ROOT_FSTYPE="$(findmnt -n -o FSTYPE /)"

# Resolve LVM / mapper back to the underlying partition when possible.
resolve_partition() {
  local src="$1"
  if [[ "$src" == /dev/mapper/* ]] || [[ "$src" == /dev/dm-* ]]; then
    # Prefer PV that backs the root LV.
    local pv
    pv="$(pvs --noheadings -o pv_name 2>/dev/null | awk 'NF{print $1; exit}' || true)"
    if [[ -n "$pv" ]]; then
      echo "$pv"
      return 0
    fi
  fi
  if [[ -b "$src" ]]; then
    echo "$src"
    return 0
  fi
  return 1
}

PART="$(resolve_partition "$ROOT_SRC" || true)"
if [[ -z "${PART:-}" ]]; then
  echo "Не удалось определить раздел корня (SOURCE=${ROOT_SRC})"
  exit 1
fi

# Disk + partition number for growpart / parted.
# /dev/sda1 → DISK=/dev/sda PARTNUM=1
# /dev/nvme0n1p2 → DISK=/dev/nvme0n1 PARTNUM=2
# /dev/vda2 → DISK=/dev/vda PARTNUM=2
DISK=""
PARTNUM=""
if [[ "$PART" =~ ^(/dev/nvme[0-9]+n[0-9]+)p([0-9]+)$ ]]; then
  DISK="${BASH_REMATCH[1]}"
  PARTNUM="${BASH_REMATCH[2]}"
elif [[ "$PART" =~ ^(/dev/[a-zA-Z]+[a-zA-Z0-9]*)([0-9]+)$ ]]; then
  DISK="${BASH_REMATCH[1]}"
  PARTNUM="${BASH_REMATCH[2]}"
else
  echo "Не удалось разобрать диск/раздел из ${PART}"
  exit 1
fi

if [[ ! -b "$DISK" ]]; then
  echo "Блок-устройство диска не найдено: $DISK"
  exit 1
fi

echo "Диск=${DISK} раздел=${PART} (#${PARTNUM}) fstype=${ROOT_FSTYPE} root=${ROOT_SRC}"

# Ask the kernel to notice a larger virtual disk (hot-resize / after clone).
if [[ -e "/sys/block/$(basename "$DISK")/device/rescan" ]]; then
  echo 1 >"/sys/block/$(basename "$DISK")/device/rescan" 2>/dev/null || true
fi
# virtio / scsi generic rescan
for host in /sys/class/scsi_host/host*/scan; do
  echo "- - -" >"$host" 2>/dev/null || true
done
partprobe "$DISK" 2>/dev/null || true

apt-get update -qq >/dev/null 2>&1 || true
apt-get install -y -qq cloud-guest-utils parted util-linux e2fsprogs >/dev/null 2>&1 || \
  apt-get install -y -qq cloud-guest-utils parted >/dev/null 2>&1 || true

grown=0
if command -v growpart >/dev/null 2>&1; then
  # growpart exits 1 when there is nothing to do — that is OK.
  if growpart "$DISK" "$PARTNUM"; then
    grown=1
  else
    ec=$?
    if [[ "$ec" -ne 1 ]]; then
      echo "growpart завершился с кодом ${ec} — пробую parted"
    else
      echo "growpart: раздел уже занимает доступное место (или почти)"
    fi
  fi
fi

if [[ "$grown" -eq 0 ]]; then
  # Fallback: move partition end to 100% if free space exists after it.
  if command -v parted >/dev/null 2>&1; then
    parted -s "$DISK" -- resizepart "$PARTNUM" 100% && grown=1 || true
  fi
fi

partprobe "$DISK" 2>/dev/null || true
sleep 1

# LVM: grow PV then LV that holds /
if command -v pvs >/dev/null 2>&1 && pvs --noheadings -o pv_name 2>/dev/null | grep -q .; then
  pvresize "$PART" 2>/dev/null || pvresize "$(pvs --noheadings -o pv_name | awk 'NF{print $1; exit}')" || true
  # Extend the LV mounted at /
  if [[ "$ROOT_SRC" == /dev/mapper/* ]] || [[ "$ROOT_SRC" == /dev/dm-* ]] || findmnt -n -o SOURCE / | grep -q mapper; then
    ROOT_LV="$(findmnt -n -o SOURCE /)"
    # lvextend -l +100%FREE on the VG of this LV
    if command -v lvextend >/dev/null 2>&1; then
      lvextend -l +100%FREE "$ROOT_LV" 2>/dev/null || \
        lvextend -l +100%FREE "$(lvs --noheadings -o lv_path 2>/dev/null | awk 'NF{print $1; exit}')" || true
    fi
  fi
fi

# Grow filesystem on the mounted root device.
FS_DEV="$(findmnt -n -o SOURCE /)"
case "$ROOT_FSTYPE" in
  ext2|ext3|ext4)
    resize2fs "$FS_DEV"
    ;;
  xfs)
    xfs_growfs /
    ;;
  btrfs)
    btrfs filesystem resize max /
    ;;
  *)
    echo "Файловая система ${ROOT_FSTYPE} — авторасширение не настроено"
    exit 1
    ;;
esac

after="$(df -h / | awk 'NR==2 {print $2, $4}')"
echo "Корень после: size=${after%% *} avail=${after##* }"
df -h /
lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINTS "$DISK" 2>/dev/null || lsblk
