# JC-ROUND v2

Next.js 15 + Prisma/SQLite rebuild of the JIANCHA rounds system (`../jiancha-rounds.html` = v1).

- **Login:** email + password, invite-only (emailed link → user sets own password), forgot/reset by email,
  lockout after 5 wrong passwords, DB sessions (disable / reset / password change signs out everywhere).
- **Permissions:** 11 features × roles (MAIN ADMIN always all; others editable by MAIN ADMIN) + per-user overrides.
  Every page/API is denied unless its permission check passes; state-changing API calls require same-origin.
- **Public, no login:** `/s/<token>` branch share (revocable) · `/d/<token>` franchise Order Drop (revocable / rotatable, rate-limited, PDF-validated).
- **Email:** Microsoft Graph as `Noreply@jianchatea.com` (same Entra app as Recipe-DB); no `GRAPH_CLIENT_SECRET` → dry-run to `data/outbox/`.

## Local
```bash
cp .env.example .env   # set SESSION_SECRET (openssl rand -hex 32)
npm install && npx prisma db push
npm run import:legacy -- --state ../dev/.data/state.json --drop ../dev/.data/drop   # optional test data
ADMIN_EMAIL=you@jianchatea.com npm run seed:admin    # prints the invite link in dry-run
npm run dev            # http://localhost:3100
npm test && npm run typecheck && npm run build
```

## Server (root@jc-round droplet) — runs beside v1 until cutover
```bash
bash /opt/jc-round-src/v2/deploy/install.sh                       # install/update → systemd jc-round-web on 127.0.0.1:8094
bash /opt/jc-round-web/app/deploy/import.sh admin@jianchatea.com "Name"   # import v1 data + invite first MAIN ADMIN
bash /opt/jc-round-web/app/deploy/cutover.sh                      # nginx → v2   (… cutover.sh rollback → v1)
```
Data: `/opt/jc-round-web/data/` (jcround.db, files/, outbox/) · secrets: `/opt/jc-round-web/.env` (never commit).
