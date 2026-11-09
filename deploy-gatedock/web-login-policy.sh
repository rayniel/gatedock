#!/bin/sh
set -eu

case "${GATEDOCK_WEB_LOCAL_LOGIN_ENABLED:-true}" in
    true) enabled=true; disabled=0 ;;
    false) enabled=false; disabled=1 ;;
    *) echo "GATEDOCK_WEB_LOCAL_LOGIN_ENABLED must be true or false" >&2; exit 1 ;;
esac

mkdir -p /etc/nginx/snippets
cat > /etc/nginx/conf.d/gatedock-web-login.conf <<EOF
map \$uri \$gatedock_password_login {
    default 0;
    ~*^/api/(v1/acl/|v1/account/|account/|v1/)?login/?\$ $disabled;
}
EOF
cat > /etc/nginx/snippets/gatedock-web-login.conf <<EOF
if (\$gatedock_password_login) {
    return 403 '{"message":"Web password login is disabled; use OIDC"}';
}
location = /api/gatedock/auth-policy {
    default_type application/json;
    add_header Cache-Control "no-store" always;
    return 200 '{"web_local_login_enabled":$enabled}';
}
EOF
