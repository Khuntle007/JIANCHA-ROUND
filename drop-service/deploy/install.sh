#!/usr/bin/env bash
# Run ON THE SERVER as root, from a checkout of the repo (e.g. /opt/jc-round-src after the cron pull):
#   bash /opt/jc-round-src/drop-service/deploy/install.sh
# Idempotent: re-run to update server.js. Does NOT touch jc-round-api or other sites.
set -euo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd)"
DST=/opt/jc-round-drop
VHOST=/etc/nginx/sites-available/jc-round.scm-backoffice.conf

node -e 'process.exit(+process.versions.node.split(".")[0] >= 16 ? 0 : 1)' || { echo "Node >=16 required"; exit 1; }
ss -ltn | grep -q ':8093 ' && ! systemctl is-active --quiet jc-round-drop && { echo "port 8093 busy — set another PORT"; exit 1; }

install -d -m 755 "$DST"; install -d -m 700 -o www-data -g www-data "$DST/data"
install -m 644 "$SRC/server.js" "$DST/server.js"
[ -f "$DST/.env" ] || { install -m 600 "$SRC/deploy/env.example" "$DST/.env"; echo ">> fill GRAPH_* in $DST/.env (until then mail runs DRY-RUN)"; }
install -m 644 "$SRC/deploy/jc-round-drop.service" /etc/systemd/system/jc-round-drop.service
systemctl daemon-reload; systemctl enable --now jc-round-drop; systemctl restart jc-round-drop
sleep 1; curl -fsS http://127.0.0.1:8093/health; echo

if ! grep -q 'location ^~ /api/drop/' "$VHOST"; then
  cp "$VHOST" "$VHOST.bak-$(date +%Y%m%d%H%M)"
  python3 - "$VHOST" "$SRC/deploy/nginx-location.conf" <<'PY'
import sys,re
v,snip=sys.argv[1],open(sys.argv[2]).read()
s=open(v).read()
block="\n".join(l for l in snip.splitlines() if not l.startswith('#'))
i=s.find('location /api/ {')
assert i>0, 'no "location /api/" in vhost'
s=s[:i]+block.strip()+"\n\n    "+s[i:]
open(v,'w').write(s)
PY
  nginx -t && systemctl reload nginx && echo "nginx: /api/drop/ added"
fi
curl -fsS https://jc-round.scm-backoffice.com/api/drop/health; echo
