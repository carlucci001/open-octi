FROM node:24-bookworm-slim AS dependencies
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

FROM node:24-bookworm-slim AS production-dependencies
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
COPY --chown=node:node deploy/docker-entrypoint.sh /usr/local/bin/openocti-entrypoint

RUN mkdir -p /data && chown node:node /data && chmod 0755 /usr/local/bin/openocti-entrypoint
USER node
EXPOSE 3000
VOLUME ["/data"]
ENTRYPOINT ["openocti-entrypoint"]
CMD ["npm", "run", "start"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/',{redirect:'manual'}).then(r=>{if(![200,307].includes(r.status))process.exit(1)}).catch(()=>process.exit(1))"]
