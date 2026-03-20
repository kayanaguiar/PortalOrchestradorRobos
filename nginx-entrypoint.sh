#!/bin/sh
set -e

if [ -f /etc/nginx/ssl/cert.pem ] && [ -f /etc/nginx/ssl/key.pem ]; then
  echo "SSL certificates found - enabling HTTPS"
  cp /etc/nginx/nginx-ssl.conf /etc/nginx/conf.d/default.conf
else
  echo "No SSL certificates - running HTTP only"
  cp /etc/nginx/nginx-http.conf /etc/nginx/conf.d/default.conf
fi

exec nginx -g "daemon off;"
