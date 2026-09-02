#!/bin/sh
set -eu

if [ -z "$(find /data -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]; then
  cp -R /app/data-demo/. /data/
fi

exec "$@"
