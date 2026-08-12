#!/bin/sh
set -e
PORT="${PORT:-80}"
echo "Starting nginx on port ${PORT}"
# Replace any listen directive with Render's PORT
sed -i "s/listen [0-9]*;/listen ${PORT};/g" /etc/nginx/conf.d/default.conf
# Frontend SPA does not need to proxy /api when VITE_API_URL is absolute
exec nginx -g "daemon off;"
