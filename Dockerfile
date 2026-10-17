# ---- build: compila TypeScript/TSX in dist/
FROM node:22-slim AS build
WORKDIR /app
# Strumenti per compilare better-sqlite3 se non esiste un binario precompilato per l'architettura
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ && \
    rm -rf /var/lib/apt/lists/*
# Header di Node già presenti nell'immagine: niente download durante la compilazione
ENV npm_config_nodedir=/usr/local
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ---- runtime
FROM node:22-slim
WORKDIR /app

# Python per gli script generatore/resolver degli utenti
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 python3-requests ca-certificates && \
    rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=10000 \
    DATA_DIR=/app/data

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json addon-config.json link.epg.remapping ./
COPY public ./public

# Il processo (e quindi gli script Python) non gira come root
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node

EXPOSE 10000
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||10000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
