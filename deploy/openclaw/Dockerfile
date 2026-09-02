FROM node:24-bookworm-slim

RUN npm install --global openclaw@2026.6.34 && npm cache clean --force
COPY deploy/openclaw/openocti-plugin /opt/openocti-plugin
COPY deploy/openclaw/seed /opt/openocti-seed
COPY deploy/openclaw/configure-seed.mjs /opt/openocti/configure-seed.mjs
COPY deploy/openclaw/entrypoint.sh /usr/local/bin/openocti-openclaw-entrypoint
RUN chmod 0755 /usr/local/bin/openocti-openclaw-entrypoint

ENV OPENCLAW_STATE_DIR=/data/openclaw
EXPOSE 18789
VOLUME ["/data"]
ENTRYPOINT ["openocti-openclaw-entrypoint"]
CMD ["openclaw", "gateway", "--bind", "lan", "--port", "18789"]
