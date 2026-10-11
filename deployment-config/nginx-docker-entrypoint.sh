#!/bin/sh
set -eu

TEMPLATE="/etc/nginx/templates/default.conf.template"
TARGET="/etc/nginx/conf.d/default.conf"

if [ ! -f "$TEMPLATE" ]; then
  echo "Nginx template not found: $TEMPLATE"
  exit 1
fi

envsubst '${PUBLIC_DOMAIN}' < "$TEMPLATE" > "$TARGET"
echo "Nginx config rendered for domain: ${PUBLIC_DOMAIN:-localhost}"
