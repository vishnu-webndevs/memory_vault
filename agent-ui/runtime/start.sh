#!/usr/bin/env bash
set -euo pipefail
ENV_FILE=/etc/default/agent-ui-websocket
if [ -f "$ENV_FILE" ]; then
  . "$ENV_FILE"
fi
NODE_BIN=$(command -v node || true)
if [ -z "${NODE_BIN:-}" ]; then
  if [ -x /usr/bin/node ]; then NODE_BIN=/usr/bin/node; fi
  if [ -x /usr/local/bin/node ]; then NODE_BIN=/usr/local/bin/node; fi
fi
if [ -z "${NODE_BIN:-}" ]; then
  echo "node binary not found" >&2
  exit 1
fi
cd /var/www/sites/agent-ui/runtime
exec "$NODE_BIN" websocket.js
