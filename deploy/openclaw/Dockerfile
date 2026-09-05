FROM node:24-bookworm-slim

RUN npm install --global openclaw@2026.6.34 && npm cache clean --force
COPY deploy/openclaw/openocti-plugin /opt/openocti-plugin
COPY deploy/openclaw/seed /opt/openocti-seed
COPY deploy/openclaw/configure-seed.mjs /opt/openocti/deploy/openclaw/configure-seed.mjs
COPY deploy/machine-secrets.mjs /opt/openocti/deploy/machine-secrets.mjs
COPY lib/machine-secret.js lib/edition.js /opt/openocti/lib/
COPY deploy/openclaw/entrypoint.sh /usr/local/bin/openocti-openclaw-entrypoint
RUN chmod 0755 /usr/local/bin/openocti-openclaw-entrypoint
RUN mkdir -p /data && chown node:node /data

ENV OPENCLAW_STATE_DIR=/data/openclaw
EXPOSE 18789
VOLUME ["/data"]
USER node
ENTRYPOINT ["openocti-openclaw-entrypoint"]
CMD ["openclaw", "gateway", "--bind", "lan", "--port", "18789"]
HEALTHCHECK --interval=15s --timeout=5s --start-period=90s --retries=8 \
  CMD ["node", "-e", "const s=require('node:net').connect(18789,'127.0.0.1',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1));s.setTimeout(4000,()=>process.exit(1))"]
