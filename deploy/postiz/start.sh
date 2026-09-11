#!/bin/sh
set -eu

cd /app
nginx
# Keep the pinned upstream schema initialization, then supervise the three
# services directly. PM2's Node wrapper can stall this release's backend.
pnpm run prisma-db-push
exec pm2-runtime start /opt/openocti/postiz/ecosystem.config.cjs
