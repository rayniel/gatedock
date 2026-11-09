#!/bin/bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"
umask 077
ACL_SOURCE="$DIR/../third_party/gatedock-acl"
if [[ -f "$ACL_SOURCE/.git" ]]; then
    export GATEDOCK_ACL_REVISION
    GATEDOCK_ACL_REVISION="$(git -C "$ACL_SOURCE" rev-parse HEAD)"
fi
files=(-f "$DIR/docker-compose.yaml")
if [[ "${1:-}" == "--ssh" ]]; then
    files+=(-f "$DIR/docker-compose.ssh.yaml")
    shift
fi
compose() {
    docker compose --project-directory "$DIR" --env-file "$DIR/.env" "${files[@]}" "$@"
}
fail() { echo "ERROR: $*" >&2; exit 1; }
require_tools() {
    command -v docker >/dev/null || fail "Docker is required"
    docker compose version >/dev/null || fail "Docker Compose v2 is required"
    docker info >/dev/null || fail "Docker daemon is unavailable"
}
initialize() {
    command -v openssl >/dev/null || fail "OpenSSL is required to generate credentials"
    [[ ! -e .env && ! -e runtime && ! -e data ]] || fail "Existing configuration/data found; init will not overwrite it"
    for value in "${GATEDOCK_PROJECT_NAME:-gatedock}" "${GATEDOCK_WEB_BIND:-127.0.0.1}" \
        "${GATEDOCK_WEB_PORT:-8666}" "${GATEDOCK_NETWORK_SUBNET:-172.29.80.0/24}" \
        "${GATEDOCK_WEB_IP:-172.29.80.10}" "${GATEDOCK_TRUSTED_PROXY_CIDR:-127.0.0.1/32}"; do
        [[ "$value" =~ ^[a-zA-Z0-9._:/-]+$ ]] || fail "Deployment settings must be single unquoted values without whitespace"
    done
    [[ "${GATEDOCK_WEB_PORT:-8666}" =~ ^[0-9]+$ ]] || fail "Web port must be numeric"
    (( ${GATEDOCK_WEB_PORT:-8666} >= 1 && ${GATEDOCK_WEB_PORT:-8666} <= 65535 )) || fail "Web port must be between 1 and 65535"
    mkdir runtime
    root_password="$(openssl rand -hex 24)"
    db_password="$(openssl rand -hex 24)"
    acl_password="$(openssl rand -hex 24)"
    app_id="$(openssl rand -hex 16)"
    app_secret="$(openssl rand -hex 32)"
    session_secret="$(openssl rand -hex 32)"
    aes_key="$(openssl rand -hex 16)"
    aes_iv="$(openssl rand -hex 8)"
    admin_password="$(openssl rand -hex 16)"
    admin_hash="$(printf '%s' "$admin_password" | openssl dgst -md5 -r)"
    admin_hash="${admin_hash%% *}"
    web_ip="${GATEDOCK_WEB_IP:-172.29.80.10}"
    cat > .env <<EOF
GATEDOCK_PROJECT_NAME=${GATEDOCK_PROJECT_NAME:-gatedock}
GATEDOCK_WEB_BIND=${GATEDOCK_WEB_BIND:-127.0.0.1}
GATEDOCK_WEB_PORT=${GATEDOCK_WEB_PORT:-8666}
GATEDOCK_NETWORK_SUBNET=${GATEDOCK_NETWORK_SUBNET:-172.29.80.0/24}
GATEDOCK_WEB_IP=$web_ip
GATEDOCK_TRUSTED_PROXY_CIDR=${GATEDOCK_TRUSTED_PROXY_CIDR:-127.0.0.1/32}
GATEDOCK_WEB_LOCAL_LOGIN_ENABLED=true
MYSQL_ROOT_PASSWORD=$root_password
GATEDOCK_DB_PASSWORD=$db_password
DB_ACL_PASSWORD=$acl_password
GATEDOCK_ACL_APP_ID=$app_id
GATEDOCK_ACL_APP_SECRET=$app_secret
GATEDOCK_SESSION_SECRET=$session_secret
GATEDOCK_ADMIN_PASSWORD_MD5=$admin_hash
EOF
    cat > runtime/config.yaml <<EOF
mode: release
http:
  host: 0.0.0.0
  port: 8888
  trustedProxies: ["$web_ip/32"]
ssh:
  host: 0.0.0.0
  port: 2222
guacd:
  host: oneterm-guacd
  port: 4822
mysql:
  host: mysql
  port: 3306
  user: gatedock
  password: "$db_password"
redis:
  host: redis
  port: 6379
  password: ""
log:
  level: info
  format: json
  maxSize: 10
  consoleEnable: true
auth:
  acl:
    appId: "$app_id"
    secretKey: "$app_secret"
    url: http://acl-api:5000/api/v1
  aes:
    key: "$aes_key"
    iv: "$aes_iv"
secretKey: "$session_secret"
session:
  replayDir: /replay/
EOF
    printf 'username=admin\npassword=%s\n' "$admin_password" > runtime/admin.credentials
    echo "Initialized. Admin credentials: runtime/admin.credentials (mode 600). Back up .env and runtime securely."
}
check() {
    require_tools
    [[ -f .env && -f runtime/config.yaml ]] || fail "Run ./gatedock.sh init first"
    [[ -f "$ACL_SOURCE/acl-api/autoapp.py" ]] || fail "Run git submodule update --init --recursive from the repository root"
    [[ -z "$(git -C "$ACL_SOURCE" status --porcelain)" ]] || fail "ACL submodule has uncommitted changes; commit them before building"
    compose config --quiet
}
verify() {
    compose exec -T web wget -q -O /dev/null http://127.0.0.1/healthz
    compose exec -T web wget -q -O /dev/null http://127.0.0.1/api/gatedock/auth-policy
    compose exec -T web wget -q -O /dev/null http://127.0.0.1/api/common-setting/v1/auth_config/enable_list
    compose exec -T api nc -z 127.0.0.1 8888
    echo "GateDock readiness checks passed. Configure/test OIDC before disabling Web password login."
}
backup() {
    mkdir -p backups
    destination="backups/$(date -u +%Y%m%dT%H%M%SZ)-$$"
    mkdir "$destination"
    compose stop web api
    if ! (
        set -e
        compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump -u root --single-transaction --routines --triggers --databases acl oneterm' > "$destination/databases.sql" || exit 1
        tar -czf "$destination/config-and-files.tar.gz" .env runtime data/replay data/rdp || exit 1
        compose images > "$destination/images.txt" || exit 1
        for service in api web acl-api; do
            image_id="$(compose images -q "$service")" || exit 1
            [[ -n "$image_id" ]] || exit 1
            docker tag "$image_id" "gatedock-$service:backup-$(basename "$destination")" || exit 1
        done
    ); then
        compose start api web
        fail "Backup failed; $destination is incomplete. Application restart requested."
    fi
    compose start api web
    echo "Backup written to $destination. Copy it off-host securely."
}
case "${1:-help}" in
    init) initialize ;;
    check) check ;;
    build) check; compose build api web acl-api ;;
    up) check; compose build api web acl-api; compose up -d --no-build --wait --wait-timeout 300; verify ;;
    update) check; compose build api web acl-api; backup; compose up -d --no-build --wait --wait-timeout 300; verify ;;
    restart-web) check; compose up -d --no-deps --no-build --force-recreate --wait --wait-timeout 90 web; compose exec -T web nginx -t ;;
    verify) check; verify ;;
    backup) check; backup ;;
    status) check; compose ps ;;
    logs) check; compose logs --tail=100 "${@:2}" ;;
    stop) check; compose stop ;;
    help|-h|--help) echo "Usage: ./gatedock.sh [--ssh] {init|check|build|up|update|restart-web|verify|backup|status|logs [service]|stop}" ;;
    *) fail "Unknown command: $1. Run ./gatedock.sh help." ;;
esac
