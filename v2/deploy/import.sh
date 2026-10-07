#!/usr/bin/env bash
# One-time (or repeatable with --replace) import of v1 data into v2, then invite the first MAIN ADMIN.
#   bash /opt/jc-round-web/app/deploy/import.sh admin@jianchatea.com "Admin Name" [--replace]
set -euo pipefail
EMAIL="${1:?admin email}"; NAME="${2:-Admin}"; REPLACE="${3:-}"
cd /opt/jc-round-web/app
set -a; . /opt/jc-round-web/.env; set +a
cp /opt/jc-round-api/data/state.json /opt/jc-round-web/data/v1-state-$(date +%Y%m%d%H%M).json   # snapshot of what was imported
./node_modules/.bin/tsx scripts/import-legacy.ts --state /opt/jc-round-api/data/state.json --drop /opt/jc-round-drop/data $REPLACE
ADMIN_EMAIL="$EMAIL" ADMIN_NAME="$NAME" ./node_modules/.bin/tsx scripts/seed-admin.ts
chown -R www-data:www-data /opt/jc-round-web/data   # import ran as root (v1 data is root-only)
