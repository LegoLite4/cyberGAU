#!/usr/bin/env bash
set -euo pipefail

ENV_FILE=/etc/cybergau/env
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

install -d -m 700 /etc/wireguard /etc/cybergau
umask 077

if [[ ! -f /etc/wireguard/server.key ]]; then
  wg genkey | tee /etc/wireguard/server.key | wg pubkey > /etc/wireguard/server.pub
  wg genkey | tee /etc/cybergau/client.key | wg pubkey > /etc/cybergau/client.pub
fi

SERVER_KEY="$(cat /etc/wireguard/server.key)"
SERVER_PUB="$(cat /etc/wireguard/server.pub)"
CLIENT_KEY="$(cat /etc/cybergau/client.key)"
CLIENT_PUB="$(cat /etc/cybergau/client.pub)"
ENDPOINT="${WG_ENDPOINT:?WG_ENDPOINT is required}"

cat > /etc/wireguard/wg0.conf <<EOF
[Interface]
Address = 10.77.0.1/24
ListenPort = 51820
PrivateKey = ${SERVER_KEY}

[Peer]
PublicKey = ${CLIENT_PUB}
AllowedIPs = 10.77.0.2/32
EOF
chmod 600 /etc/wireguard/wg0.conf

cat > /etc/cybergau/wg-client.conf <<EOF
[Interface]
Address = 10.77.0.2/32
PrivateKey = ${CLIENT_KEY}
DNS = 1.1.1.1

[Peer]
PublicKey = ${SERVER_PUB}
Endpoint = ${ENDPOINT}
AllowedIPs = 10.77.0.0/24
PersistentKeepalive = 25
EOF
chmod 600 /etc/cybergau/wg-client.conf

sysctl -w net.ipv4.ip_forward=1
grep -q '^net.ipv4.ip_forward=1' /etc/sysctl.conf || echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.conf

systemctl enable --now wg-quick@wg0
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q active; then
  ufw allow 51820/udp
fi
