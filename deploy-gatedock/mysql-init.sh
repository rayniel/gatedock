#!/bin/bash
set -euo pipefail

for value in "$GATEDOCK_DB_PASSWORD" "$DB_ACL_PASSWORD" "$GATEDOCK_ACL_APP_ID" "$GATEDOCK_ACL_APP_SECRET" "$GATEDOCK_ADMIN_PASSWORD_MD5"; do
    if [[ ! "$value" =~ ^[a-f0-9]{32,64}$ ]]; then
        echo "Invalid generated database credential (expected hexadecimal)" >&2
        exit 1
    fi
done

export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"
mysql -u root <<SQL
CREATE DATABASE IF NOT EXISTS acl CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS oneterm CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'acl'@'%' IDENTIFIED BY '$DB_ACL_PASSWORD';
CREATE USER 'gatedock'@'%' IDENTIFIED BY '$GATEDOCK_DB_PASSWORD';
GRANT ALL PRIVILEGES ON acl.* TO 'acl'@'%';
GRANT ALL PRIVILEGES ON oneterm.* TO 'gatedock'@'%';
SQL

mysql -u root acl < /etc/gatedock/acl.sql
mysql -u root acl <<SQL
UPDATE acl_apps SET app_id='$GATEDOCK_ACL_APP_ID', secret_key='$GATEDOCK_ACL_APP_SECRET' WHERE name='oneterm';
UPDATE acl_apps SET app_id=LOWER(HEX(RANDOM_BYTES(16))), secret_key=LOWER(HEX(RANDOM_BYTES(32))) WHERE name <> 'oneterm';
UPDATE users SET password='$GATEDOCK_ADMIN_PASSWORD_MD5', \`key\`=LOWER(HEX(RANDOM_BYTES(16))), secret=LOWER(HEX(RANDOM_BYTES(16))) WHERE username='admin';
TRUNCATE TABLE acl_audit_resource_logs;
TRUNCATE TABLE acl_audit_role_logs;
TRUNCATE TABLE acl_operation_records;
SQL
