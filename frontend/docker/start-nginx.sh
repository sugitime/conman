#!/bin/sh
set -e
PORT="${PORT:-80}"
# Render injects PORT; rewrite nginx listen directive
sed -i "s/listen 80;/listen ${PORT};/" /etc/nginx/conf.d/default.conf
exec nginx -g "daemon off;"
