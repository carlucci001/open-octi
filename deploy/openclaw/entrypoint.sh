#!/bin/sh
set -eu

plugin_dir="${OPENCLAW_STATE_DIR:-/data/openclaw}/extensions/openocti"
mkdir -p "$plugin_dir"
cp -R /opt/openocti-plugin/. "$plugin_dir/"

state_dir="${OPENCLAW_STATE_DIR:-/data/openclaw}"
config_file="$state_dir/openclaw.json"
if [ ! -f "$config_file" ]; then
  mkdir -p "$state_dir"
  cp /opt/openocti-seed/openclaw.json "$config_file"
  cp -R /opt/openocti-seed/workspace "$state_dir/workspace"
fi
# Re-apply provider/model/gateway settings from the environment on every boot so that adding a key
# to .env later "lights up" the agents without a volume reset. Set OPENOCTI_MANAGED_CONFIG=false to
# take over openclaw.json by hand.
if [ "${OPENOCTI_MANAGED_CONFIG:-true}" != "false" ]; then
  node /opt/openocti/configure-seed.mjs "$state_dir"
fi

exec "$@"
