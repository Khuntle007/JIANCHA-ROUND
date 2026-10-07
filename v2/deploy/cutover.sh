#!/usr/bin/env bash
# Switch jc-round.scm-backoffice.com from v1 to v2 (or back with: cutover.sh rollback).
# v1 vhost file is never edited; we only swap which file sites-enabled points to.
set -euo pipefail
AV=/etc/nginx/sites-available; EN=/etc/nginx/sites-enabled
V1=$AV/jc-round.scm-backoffice.conf; V2=$AV/jc-round.scm-backoffice.v2.conf; LINK=$EN/jc-round.scm-backoffice.conf
if [ "${1:-}" = "rollback" ]; then
  ln -sfn "$V1" "$LINK"; nginx -t && systemctl reload nginx; echo "ROLLED BACK to v1"; exit 0
fi
curl -fsS http://127.0.0.1:8094/api/health >/dev/null || { echo "v2 not healthy on :8094 — run install.sh first"; exit 1; }
install -m 644 "$(dirname "$0")/nginx-v2.conf" "$V2"
ln -sfn "$V2" "$LINK"
if nginx -t; then systemctl reload nginx; echo "LIVE on v2 — rollback: bash $0 rollback"; else ln -sfn "$V1" "$LINK"; echo "nginx -t failed — kept v1"; exit 1; fi
curl -fsS https://jc-round.scm-backoffice.com/api/health; echo
