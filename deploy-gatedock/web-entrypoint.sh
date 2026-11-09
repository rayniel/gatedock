#!/bin/sh
set -eu

sh /etc/gatedock/web-login-policy.sh
envsubst '$ONETERM_API_HOST $ACL_API_HOST $GATEDOCK_TRUSTED_PROXY_CIDR' \
    < /etc/gatedock/nginx.conf.template > /etc/nginx/conf.d/gatedock.conf
nginx -t
exec nginx -g 'daemon off;'
