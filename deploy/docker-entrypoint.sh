#!/bin/sh
set -eu

for key in $(env | awk -F= '$2 == "" { print $1 }'); do
  unset "$key"
done

if [ -z "$(find /data -mindepth 1 -maxdepth 1 ! -name openclaw -print -quit 2>/dev/null)" ]; then
  cp -R /app/data-demo/. /data/
fi

exec node /app/deploy/start-app.mjs --command "$@"
