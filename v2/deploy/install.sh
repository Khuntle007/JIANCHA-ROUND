#!/usr/bin/env bash
# Install / update JC-ROUND v2 on the server (run as root). Idempotent — re-run after every push to update.
#   bash /opt/jc-round-src/v2/deploy/install.sh
# Does NOT touch nginx (see cutover.sh) or the v1 services / data.
set -euo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd)"
ROOT=/opt/jc-round-web
APP=$ROOT/app
ENVF=$ROOT/.env

node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>18||(a===18&&b>=18)?0:1)' || { echo "Node >= 18.18 required"; exit 1; }
command -v pdftotext >/dev/null || { apt-get install -y -qq poppler-utils >/dev/null; command -v pdftotext >/dev/null || { echo "pdftotext (poppler-utils) required"; exit 1; }; }
if ss -ltn | grep -q '127.0.0.1:8094 ' && ! systemctl is-active --quiet jc-round-web; then echo "port 8094 busy"; exit 1; fi

install -d -m 755 $ROOT $APP
install -d -m 700 -o www-data -g www-data $ROOT/data
rsync -a --delete --exclude node_modules --exclude /.next --exclude /data --exclude /.env "$SRC/" "$APP/"

if [ ! -f "$ENVF" ]; then
  ( umask 077
  {
    echo 'DATABASE_URL="file:/opt/jc-round-web/data/jcround.db"'
    echo 'DATA_DIR="/opt/jc-round-web/data"'
    echo 'APP_URL="https://jc-round.scm-backoffice.com"'
    echo "SESSION_SECRET=\"$(openssl rand -hex 32)\""
    echo 'MAIL_SENDER="Noreply@jianchatea.com"'
    echo 'MAX_PDF_BYTES=15728640'
    # reuse the Graph credentials already configured for v1 Order Drop (never printed)
    [ -f /opt/jc-round-drop/.env ] && grep -E '^(GRAPH_(TENANT_ID|CLIENT_ID|CLIENT_SECRET)|BC_[A-Z_]+)=' /opt/jc-round-drop/.env || true
  } > "$ENVF" )
  echo ">> created $ENVF ($(grep -c '^GRAPH_' "$ENVF") GRAPH_* / $(grep -c '^BC_' "$ENVF") BC_* lines copied)"
fi

cd "$APP"
npm ci --no-audit --no-fund --loglevel=error
set -a; . "$ENVF"; set +a
# schema changes that prisma flags as possible data loss stop the install; review, then re-run with ALLOW_DATA_LOSS=1
npx prisma db push --skip-generate ${ALLOW_DATA_LOSS:+--accept-data-loss}
npm run build
chmod -R go+rX "$APP"            # code is not secret; secrets live only in $ENVF (600)
chown -R www-data:www-data $APP/.next $ROOT/data
install -m 644 "$SRC/deploy/jc-round-web.service" /etc/systemd/system/jc-round-web.service
systemctl daemon-reload
systemctl enable --now jc-round-web >/dev/null 2>&1 || true
systemctl restart jc-round-web
for i in $(seq 1 20); do curl -fsS http://127.0.0.1:8094/api/health && echo && exit 0; sleep 1; done
echo "health check failed"; journalctl -u jc-round-web -n 40 --no-pager; exit 1
