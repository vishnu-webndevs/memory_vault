#!/bin/sh
set -e

API_BASE_VALUE="${API_BASE:-https://api.webndevs.com/api/}"
WS_URL_VALUE="${WS_URL:-wss://ws.webndevs.com/ws}"

cat >/usr/share/nginx/html/config.js <<EOF
window.APP_CONFIG = {
  API_BASE: "${API_BASE_VALUE}",
  WS_URL: "${WS_URL_VALUE}"
};
EOF

exec nginx -g 'daemon off;'

