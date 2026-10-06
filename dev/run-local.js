// Local dev harness (NOT for production): mock jc-round-api :8092 + drop-service :8093 + static/proxy :8090
// Usage: node dev/run-local.js  → http://localhost:8090  (mail is DRY-RUN → dev/.data/drop/outbox)
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..'), DATA = path.join(__dirname, '.data');
fs.mkdirSync(DATA, { recursive: true });

/* ---- mock jc-round-api (mirrors the endpoints in SCM-JC-ROUND.md §5.2) ---- */
const SF = path.join(DATA, 'state.json'), AF = path.join(DATA, 'auth.json');
const rd = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return d; } };
const tokens = new Map();
const strip = db => { db = JSON.parse(JSON.stringify(db)); const auth = rd(AF, {}); (db.users || []).forEach(u => { delete u.pin; u.hasPin = !!auth[u.id]; }); return db; };
http.createServer((req, res) => {
  let b = ''; req.on('data', c => b += c); req.on('end', () => {
    const j = (() => { try { return JSON.parse(b || '{}'); } catch (_) { return {}; } })();
    const out = (c, o) => { res.writeHead(c, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    const st = rd(SF, null), auth = rd(AF, {}), p = req.url.split('?')[0];
    if (p === '/health') return out(200, { ok: true });
    if (req.method === 'GET' && p === '/state') return out(200, st ? { init: true, state: strip(st) } : { init: false });
    if (req.method === 'POST' && p === '/seed') { if (!st) fs.writeFileSync(SF, JSON.stringify(strip(j.db))); return out(200, { ok: true }); }
    if (req.method === 'POST' && p === '/setpin') { if (auth[j.userId]) return out(409, { error: 'pin already set' }); auth[j.userId] = j.pin; fs.writeFileSync(AF, JSON.stringify(auth)); const t = crypto.randomBytes(12).toString('hex'); tokens.set(t, j.userId); return out(200, { token: t }); }
    if (req.method === 'POST' && p === '/login') { if (!auth[j.userId] || auth[j.userId] !== j.pin) return out(401, { error: 'bad pin' }); const t = crypto.randomBytes(12).toString('hex'); tokens.set(t, j.userId); return out(200, { token: t }); }
    if (req.method === 'POST' && p === '/state') { if (!tokens.has((req.headers.authorization || '').slice(7))) return out(401, {}); fs.writeFileSync(SF, JSON.stringify(strip(j.db))); return out(200, { ok: true }); }
    out(404, { error: 'nf' });
  });
}).listen(8092, '127.0.0.1');

/* ---- drop service ---- */
spawn(process.execPath, [path.join(ROOT, 'drop-service/server.js')], {
  stdio: 'inherit', env: { ...process.env, PORT: '8093', DATA_DIR: path.join(DATA, 'drop'), MAIL_DRY_RUN: '1', PUBLIC_ORIGIN: 'http://localhost:8090' },
});

/* ---- static + nginx-like proxy ---- */
http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    const drop = req.url.startsWith('/api/drop/') || req.url === '/api/drop';
    const up = http.request({ host: '127.0.0.1', port: drop ? 8093 : 8092, path: drop ? req.url : req.url.slice(4), method: req.method, headers: { ...req.headers, 'x-forwarded-for': '127.0.0.1' } },
      r => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    up.on('error', () => { res.writeHead(502); res.end('{}'); });
    return req.pipe(up);
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(fs.readFileSync(path.join(ROOT, 'jiancha-rounds.html')));
}).listen(8090, () => console.log('local JC-ROUND → http://localhost:8090'));
