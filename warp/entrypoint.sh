#!/bin/bash
# Registra WARP al primo avvio (profilo salvato in /data/warp.conf) e avvia wireproxy.
set -euo pipefail

CONF=/data/warp.conf
PROXY_CONF=/data/wireproxy.conf

if [ ! -s "$CONF" ]; then
    echo "WARP: first start, registering a new device..."
    args=()
    if [ -n "${WARP_LICENSE_KEY:-}" ]; then args+=(--license "$WARP_LICENSE_KEY"); fi
    tmp="$(mktemp /data/warp.conf.XXXXXX)"
    if ! warp-register "${args[@]}" > "$tmp"; then
        rm -f "$tmp"
        echo "WARP: registration failed" >&2
        exit 1
    fi
    chmod 600 "$tmp"
    mv -f "$tmp" "$CONF"
    echo "WARP: device registered, profile saved in $CONF"
fi

# Solo IPv4 (come EasyProxy): più stabile con wireproxy
sed -E '/^(Address|AllowedIPs|DNS) = / { s/, *[^, ]*:[^, ]*//g }' "$CONF" > "$PROXY_CONF"

cat >> "$PROXY_CONF" <<CONF

[Socks5]
BindAddress = 0.0.0.0:${SOCKS_PORT:-1080}

[http]
BindAddress = 0.0.0.0:${HTTP_PORT:-8080}
CONF
chmod 600 "$PROXY_CONF"

echo "WARP: SOCKS5 on :${SOCKS_PORT:-1080}, HTTP on :${HTTP_PORT:-8080}"
exec wireproxy -c "$PROXY_CONF"
