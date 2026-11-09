#!/bin/sh
set -eu

cd /data/apps/acl
flask db-setup
flask common-check-new-columns
python acl-schema.py
flask init-acl
flask init-department

exec gunicorn --workers="${GATEDOCK_ACL_WORKERS:-2}" autoapp:app -b 0.0.0.0:5000 \
    --access-logfile - --error-logfile -
