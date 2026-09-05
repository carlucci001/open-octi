# bufferutil and utf-8-validate ship no linux-arm64 prebuilds, so on arm64 (Apple Silicon,
# Graviton, Raspberry Pi) npm compiles them from source and needs python3/make/g++.
# These tools live only in the dependency stages; the runtime image stays slim.
FROM node:24-bookworm-slim AS build-base
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

FROM build-base AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
# package.json pins a vendored local package (vendor/*.tgz); it must be present for npm ci
COPY vendor ./vendor
RUN npm ci --include=dev

FROM dependencies AS builder
WORKDIR /app
COPY . .
# The edition is resolved at BUILD time by next.config.js (closed-module aliases, NEXT_PUBLIC_FCC_EDITION).
ARG FCC_EDITION=openocti
ENV NEXT_TELEMETRY_DISABLED=1 \
    FCC_EDITION=${FCC_EDITION} \
    NEXT_PUBLIC_FCC_EDITION=${FCC_EDITION}
RUN npm run build

FROM build-base AS production-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY vendor ./vendor
RUN npm ci --omit=dev && npm cache clean --force

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ARG FCC_EDITION=openocti
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    FCC_EDITION=${FCC_EDITION} \
    NEXT_PUBLIC_FCC_EDITION=${FCC_EDITION} \
    CRM_DATA_DIR=/data \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/package.json /app/package-lock.json ./
COPY --chown=node:node data-demo ./data-demo
COPY --chown=node:node deploy/start-app.mjs deploy/machine-secrets.mjs ./deploy/
COPY --chown=node:node lib/machine-secret.js lib/edition.js ./lib/
COPY --chown=node:node deploy/docker-entrypoint.sh /usr/local/bin/openocti-entrypoint

RUN mkdir -p /data && chown node:node /data && chmod 0755 /usr/local/bin/openocti-entrypoint
USER node
EXPOSE 3000
VOLUME ["/data"]
ENTRYPOINT ["openocti-entrypoint"]
CMD ["npm", "run", "start"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/',{redirect:'manual'}).then(r=>{if(![200,307].includes(r.status))process.exit(1)}).catch(()=>process.exit(1))"]
