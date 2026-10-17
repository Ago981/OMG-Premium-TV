# Cloudflare WARP come proxy di uscita (SOCKS5 :1080, HTTP :8080) per l'addon e per MediaFlow.
# Userspace (wireproxy): niente NET_ADMIN, niente /dev/net/tun, niente privilegi.
# Stesse versioni fissate usate da EasyProxy.
FROM debian:bookworm-slim

ARG WARP_GENERATOR_COMMIT=d4616f154d654d5c159c193432159240c96614bb
ARG WIREPROXY_VERSION=1.1.3

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends bash curl jq wireguard-tools ca-certificates; \
    rm -rf /var/lib/apt/lists/*; \
    arch="$(dpkg --print-architecture)"; \
    case "$arch" in \
        amd64) wp_arch="amd64" ;; \
        arm64) wp_arch="arm64" ;; \
        armhf) wp_arch="arm" ;; \
        *) echo "Unsupported architecture: $arch" >&2; exit 1 ;; \
    esac; \
    curl -fL "https://raw.githubusercontent.com/lanrat/wireguard-warp-generator/${WARP_GENERATOR_COMMIT}/scripts/warp-register.sh" -o /usr/local/bin/warp-register; \
    chmod 755 /usr/local/bin/warp-register; \
    curl -fL "https://github.com/windtf/wireproxy/releases/download/v${WIREPROXY_VERSION}/wireproxy_linux_${wp_arch}.tar.gz" -o /tmp/wireproxy.tar.gz; \
    curl -fL "https://github.com/windtf/wireproxy/releases/download/v${WIREPROXY_VERSION}/checksums.txt" -o /tmp/checksums.txt; \
    checksum="$(awk -v a="wireproxy_linux_${wp_arch}.tar.gz" '$2 == a { print $1 }' /tmp/checksums.txt)"; \
    test -n "$checksum"; \
    printf '%s  /tmp/wireproxy.tar.gz\n' "$checksum" | sha256sum -c -; \
    tar -xzf /tmp/wireproxy.tar.gz -C /usr/local/bin wireproxy; \
    chmod 755 /usr/local/bin/wireproxy; \
    rm -f /tmp/wireproxy.tar.gz /tmp/checksums.txt; \
    useradd --system --home /data warp; \
    mkdir -p /data; chown warp:warp /data

COPY --chmod=755 entrypoint.sh /usr/local/bin/warp-entrypoint

USER warp
VOLUME ["/data"]
EXPOSE 1080 8080

# Sano solo se il traffico esce davvero da Cloudflare WARP
HEALTHCHECK --interval=60s --timeout=15s --start-period=30s --retries=3 \
    CMD curl -fsS --max-time 10 -x http://127.0.0.1:8080 https://www.cloudflare.com/cdn-cgi/trace | grep -Eq '^warp=(on|plus)$'

ENTRYPOINT ["/usr/local/bin/warp-entrypoint"]
