// JC-ROUND · External Order Drop service
// Pure Node (no dependencies). Runs beside jc-round-api; nginx proxies /api/drop/ → this service.
//   - External franchise accounts (admin-generated ID + password, scrypt) → portal token
//   - Back-office admins re-use their jc-round PIN login (validated against jc-round-api) → admin token
//   - PDF drops stored on disk, emailed to the item's supplier via Microsoft Graph from MAIL_FROM
'use strict';
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = +(process.env.PORT || 8093);
const HOST = process.env.HOST || '127.0.0.1';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const JCR_API = (process.env.JCR_API || 'http://127.0.0.1:8092').replace(/\/$/, '');
const PUBLIC_ORIGIN = (process.env.PUBLIC_ORIGIN || 'https://jc-round.scm-backoffice.com').replace(/\/$/, '');
const MAIL_FROM = process.env.MAIL_FROM || 'Noreply@jianchatea.com';
const MAIL_DRY_RUN = process.env.MAIL_DRY_RUN === '1' || !process.env.GRAPH_CLIENT_SECRET;
const MAX_PDF = +(process.env.MAX_PDF_BYTES || 15 * 1024 * 1024);
const ATTACH_MAX = 3 * 1024 * 1024;          // Graph sendMail inline attachment ceiling (~4MB request)
const TOKEN_TTL = 30 * 24 * 3600 * 1000;      // same lifetime as jc-round-api tokens
const LINK_TTL = 14 * 24 * 3600 * 1000;       // supplier download link for large PDFs
const ADMIN_ROLES = ['MAIN ADMIN', 'SCM Manager', 'WH ADMIN', 'PCM ADMIN'];

// Order items = one dropdown entry per supplier company (company + codes are internal only — never shown on
// the portal). The catalog is defined here; only the email recipients (to/cc) per group live in db.json.
const CATALOG = [
  { key: 'sp004', name: 'Yogurt', supplier: { code: 'SP004', name: 'บริษัท ดัชมิลล์ จำกัด' },
    ingredients: [{ code: '030019', name: 'Yogurt (2 Kg)' }] },
  { key: 'sp036', name: 'Creamcheese / Whipping cream', supplier: { code: 'SP036', name: 'บริษัท โกลเบิล พรีเมี่ยม ไวน์ จำกัด' },
    ingredients: [{ code: '030013', name: 'Creamcheese (1 Kg)' }, { code: '030014', name: 'Whipping cream (1 Ltr.)' }] },
  { key: 'sp162', name: 'Fresh milk', supplier: { code: 'SP162', name: 'บริษัท มาลี เอ็นเตอร์ไพรส์ จำกัด' },
    ingredients: [{ code: '030024', name: 'Fresh milk (2 Ltr.)' }] },
  { key: 'sp011', name: 'Ice hot creamer', supplier: { code: 'SP011', name: 'บริษัท ริช โปรดักส์ แมนูแฟคเจอริ่ง (ประเทศไทย) จำกัด' },
    ingredients: [{ code: '030012', name: 'Ice hot creamer (1 Ltr.)' }] },
  { key: 'sp163', name: 'Fruits', supplier: { code: 'SP163', name: 'บริษัท ทรีดี ฟู้ด แอนด์ ดริงค์ จำกัด' },
    ingredients: [
      { code: '010001', name: 'Lemon' }, { code: '010006', name: 'Mango' }, { code: '010010', name: 'Navel Orange' },
      { code: '010011', name: 'Pineapple' }, { code: '010012', name: 'Red Seedless Grapes' }, { code: '010016', name: 'Taro' },
      { code: '010039', name: 'Pomegranate' }, { code: '010044', name: 'Pink Guava' }, { code: '010045', name: 'Green Mango' },
      { code: '010003', name: 'Fuji Apple' }, { code: '010002', name: 'Watermelon' },
    ] },
].map(c => ({ ...c, label: c.ingredients.map(i => i.name).join(' / ') }));
// first-time recipients for a group that has none yet (admin changes them in the Email routing tab)
const DEFAULT_TO = { sp004: ['Malichat.no@jianchatea.com'], sp036: ['Malichat.no@jianchatea.com'], sp162: ['Chakrit.ji@jianchatea.com'] };
const FALLBACK_TO = ['Chakrit.ji@jianchatea.com'];
// pre-grouping item keys (2026-10-06 v1) → supplier group
const LEGACY_ITEM = { fresh_milk: 'sp162', yogurt: 'sp004', cream_cheese: 'sp036', whipping_cream: 'sp036' };


/* ---------------- storage ---------------- */
const FILES_DIR = path.join(DATA_DIR, 'files');
const OUTBOX_DIR = path.join(DATA_DIR, 'outbox');
const DB_FILE = path.join(DATA_DIR, 'db.json');
fs.mkdirSync(FILES_DIR, { recursive: true, mode: 0o700 });
fs.mkdirSync(OUTBOX_DIR, { recursive: true, mode: 0o700 });

const SECRET = (() => {
  const f = path.join(DATA_DIR, 'secret.key');
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  return fs.readFileSync(f, 'utf8').trim();
})();

function loadDb() {
  let db = {};
  try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (_) {}
  db.accounts = db.accounts || [];
  db.drops = db.drops || [];
  const old = db.items || [];
  const uniq = arr => arr.filter((e, i) => arr.findIndex(x => x.toLowerCase() === e.toLowerCase()) === i);
  db.items = CATALOG.map(c => {
    const same = old.find(o => o.key === c.key);
    const legacy = old.filter(o => LEGACY_ITEM[o.key] === c.key);
    const to = same ? same.to : uniq(legacy.flatMap(o => o.to || []));
    const cc = same ? same.cc : uniq(legacy.flatMap(o => o.cc || []));
    return { ...c, to: to && to.length ? to : (DEFAULT_TO[c.key] || FALLBACK_TO).slice(), cc: cc || [] };
  });
  db.drops.forEach(d => { if (LEGACY_ITEM[d.item]) { d.itemLegacy = d.item; d.item = LEGACY_ITEM[d.item]; } });
  db.seq = db.seq || 0;
  return db;
}
let DB = loadDb();
function saveDb() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(DB, null, 1), { mode: 0o600 });
  fs.renameSync(tmp, DB_FILE);
}
saveDb();

/* ---------------- crypto helpers ---------------- */
const b64u = b => Buffer.from(b).toString('base64url');
function sign(payload) {
  const body = b64u(JSON.stringify(payload));
  return body + '.' + crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
}
function verify(token) {
  if (!token || typeof token !== 'string') return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const want = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (want.length !== mac.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(mac))) return null;
  try { const p = JSON.parse(Buffer.from(body, 'base64url').toString()); return p.exp > Date.now() ? p : null; } catch (_) { return null; }
}
function hashPw(pw, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  return { salt, hash: crypto.scryptSync(pw, salt, 64).toString('hex') };
}
function checkPw(pw, rec) {
  const h = crypto.scryptSync(pw, rec.salt, 64);
  const want = Buffer.from(rec.hash, 'hex');
  return h.length === want.length && crypto.timingSafeEqual(h, want);
}
function genPassword() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let s = ''; const r = crypto.randomBytes(12);
  for (let i = 0; i < 12; i++) s += A[r[i] % A.length];
  return s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8);
}
function genUsername() {
  let u;
  do { u = 'fr-' + crypto.randomBytes(3).toString('hex'); } while (DB.accounts.some(a => a.username === u));
  return u;
}
const id = p => p + crypto.randomBytes(6).toString('hex');

/* ---------------- login throttling ---------------- */
const fails = new Map(); // key → {n, until}
function throttled(key) { const f = fails.get(key); return f && f.until > Date.now(); }
function noteFail(key) {
  const f = fails.get(key) || { n: 0, until: 0 };
  f.n++; if (f.n >= 5) { f.until = Date.now() + 15 * 60 * 1000; f.n = 0; }
  fails.set(key, f);
}

/* ---------------- jc-round-api bridge ---------------- */
function httpJson(method, url, body, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const data = body == null ? null : (typeof body === 'string' ? body : JSON.stringify(body));
    const req = lib.request(u, {
      method, headers: { ...(data ? { 'Content-Type': typeof body === 'string' ? 'application/x-www-form-urlencoded' : 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}), ...(headers || {}) },
      timeout: 20000,
    }, res => {
      const chunks = []; res.on('data', c => chunks.push(c));
      res.on('end', () => { const t = Buffer.concat(chunks).toString(); let j = null; try { j = t ? JSON.parse(t) : null; } catch (_) {} resolve({ status: res.statusCode, json: j, text: t }); });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
let stateCache = { at: 0, state: null };
async function jcrState(force) {
  if (!force && stateCache.state && Date.now() - stateCache.at < 60 * 1000) return stateCache.state;
  const r = await httpJson('GET', JCR_API + '/state');
  if (r.status !== 200 || !r.json) throw new Error('jc-round-api /state ' + r.status);
  stateCache = { at: Date.now(), state: r.json.state || {} };
  return stateCache.state;
}
async function branchList() {
  const st = await jcrState();
  return (st.branches || []).filter(b => b.active !== false).map(b => ({ code: b.code, name: b.nameEn || b.nameTh || b.code }));
}
function canUseDrop(user) {
  if (!user || user.active === false) return false;
  const p = user.perms || {};
  if (p.orderDrop === true) return true;
  return ADMIN_ROLES.includes(user.role) && p.orderDrop !== false;
}

/* ---------------- mail (Microsoft Graph) ---------------- */
let graphTok = { tok: null, exp: 0 };
async function graphToken() {
  if (graphTok.tok && graphTok.exp > Date.now() + 60000) return graphTok.tok;
  const form = new URLSearchParams({
    client_id: process.env.GRAPH_CLIENT_ID, client_secret: process.env.GRAPH_CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials',
  }).toString();
  const r = await httpJson('POST', `https://login.microsoftonline.com/${process.env.GRAPH_TENANT_ID}/oauth2/v2.0/token`, form);
  if (r.status !== 200 || !r.json || !r.json.access_token) throw new Error('Graph token failed: ' + r.status + ' ' + (r.json && r.json.error_description || r.text).slice(0, 200));
  graphTok = { tok: r.json.access_token, exp: Date.now() + r.json.expires_in * 1000 };
  return graphTok.tok;
}
const escHtml = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function fileLink(drop) {
  const exp = Date.now() + LINK_TTL;
  const sig = crypto.createHmac('sha256', SECRET).update(drop.id + '.' + exp).digest('base64url');
  return `${PUBLIC_ORIGIN}/api/drop/f/${drop.id}?exp=${exp}&sig=${sig}`;
}
function buildMail(drop, item) {
  const subject = `[JIANCHA Order Drop] ${item.name} · ${drop.branchName} · ${drop.ref}`;
  const big = drop.size > ATTACH_MAX;
  const when = new Date(drop.createdAt).toLocaleString('en-GB', { timeZone: 'Asia/Bangkok' });
  const row = (k, v) => `<tr><td style="padding:6px 14px 6px 0;color:#525252;font-size:12px;letter-spacing:.06em;text-transform:uppercase">${k}</td><td style="padding:6px 0;font-size:14px;color:#181818"><b>${v}</b></td></tr>`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px">
  <div style="background:#181818;color:#fff;padding:16px 20px;letter-spacing:.2em;font-weight:700">JIAN CHA <span style="color:#AD9C82;font-size:11px;letter-spacing:.25em;font-weight:400">· ORDER DROP</span></div>
  <div style="border:1px solid #EBE9E6;border-top:3px solid #AD9C82;padding:18px 20px">
   <p style="margin:0 0 12px;font-size:14px">มีใบสั่งซื้อใหม่จากสาขาแฟรนไชส์ / New franchise order received.</p>
   <table style="border-collapse:collapse">${row('Ref', escHtml(drop.ref))}${row('Item', escHtml(item.label))}${row('Branch', escHtml(drop.branchName) + ' (' + escHtml(drop.branchCode) + ')')}${row('Issued by', escHtml(drop.issuerName))}${row('Submitted', escHtml(when) + ' (BKK)')}${row('File', escHtml(drop.fileName))}</table>
   ${big ? `<p style="margin:16px 0 0"><a href="${fileLink(drop)}" style="background:#181818;color:#fff;padding:10px 16px;text-decoration:none;font-size:13px;letter-spacing:.06em">DOWNLOAD PDF</a><br><span style="font-size:11px;color:#525252">ลิงก์ใช้ได้ 14 วัน / Link valid 14 days</span></p>` : `<p style="margin:16px 0 0;font-size:12px;color:#525252">ไฟล์ PDF แนบมากับอีเมลนี้ / PDF attached.</p>`}
  </div>
  <p style="font-size:11px;color:#525252;margin:10px 2px">อีเมลอัตโนมัติจากระบบ JC-ROUND — กรุณาอย่าตอบกลับ / Automated message, please do not reply.</p></div>`;
  return { subject, html, big };
}
async function sendDropMail(drop) {
  const item = DB.items.find(i => i.key === drop.item);
  if (!item || !item.to || !item.to.length) throw new Error('no recipient configured for item ' + drop.item);
  const { subject, html, big } = buildMail(drop, item);
  const message = {
    subject, body: { contentType: 'HTML', content: html },
    toRecipients: item.to.map(a => ({ emailAddress: { address: a } })),
    ccRecipients: (item.cc || []).map(a => ({ emailAddress: { address: a } })),
  };
  if (!big) {
    message.attachments = [{
      '@odata.type': '#microsoft.graph.fileAttachment', name: drop.fileName, contentType: 'application/pdf',
      contentBytes: fs.readFileSync(path.join(FILES_DIR, drop.id + '.pdf')).toString('base64'),
    }];
  }
  if (MAIL_DRY_RUN) {
    fs.writeFileSync(path.join(OUTBOX_DIR, drop.id + '-' + Date.now() + '.json'),
      JSON.stringify({ from: MAIL_FROM, ...message, attachments: (message.attachments || []).map(a => ({ name: a.name, bytes: Buffer.from(a.contentBytes, 'base64').length })) }, null, 1));
    return { to: item.to, cc: item.cc || [], dryRun: true };
  }
  const tok = await graphToken();
  const r = await httpJson('POST', `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(MAIL_FROM)}/sendMail`,
    { message, saveToSentItems: true }, { Authorization: 'Bearer ' + tok });
  if (r.status !== 202) throw new Error('Graph sendMail ' + r.status + ' ' + (r.text || '').slice(0, 300));
  return { to: item.to, cc: item.cc || [] };
}
async function deliver(drop) {
  drop.email = drop.email || { attempts: 0 };
  drop.email.attempts = (drop.email.attempts || 0) + 1;
  drop.email.status = 'sending'; saveDb();
  try {
    const r = await sendDropMail(drop);
    Object.assign(drop.email, { status: r.dryRun ? 'dry-run' : 'sent', to: r.to, cc: r.cc, sentAt: new Date().toISOString(), error: '' });
  } catch (e) {
    Object.assign(drop.email, { status: 'failed', error: String(e.message || e).slice(0, 400) });
    console.error('[mail]', drop.ref, e.message);
  }
  saveDb();
}

/* ---------------- http plumbing ---------------- */
function send(res, code, obj, headers) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...(headers || {}) });
  res.end(body);
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > limit) { reject(Object.assign(new Error('too large'), { code: 413 })); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function readJson(req) { const b = await readBody(req, 256 * 1024); try { return JSON.parse(b.toString() || '{}'); } catch (_) { return {}; } }
const bearer = req => (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
const clientIp = req => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
const cleanStr = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const emailOk = e => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(e);
function pubAccount(a) { return { id: a.id, username: a.username, name: a.name, branches: a.branches || [], active: a.active !== false, createdAt: a.createdAt, createdBy: a.createdBy, lastLoginAt: a.lastLoginAt || null }; }
function pubDrop(d) { return { id: d.id, ref: d.ref, branchCode: d.branchCode, branchName: d.branchName, issuerName: d.issuerName, item: d.item, itemLabel: (DB.items.find(i => i.key === d.item) || {}).name || d.item, fileName: d.fileName, size: d.size, createdAt: d.createdAt, username: d.username, accountName: d.accountName, email: d.email || {} }; }
const pubItems = () => DB.items.map(i => ({ key: i.key, label: i.label, name: i.name })); // portal: no supplier / codes
function streamPdf(res, drop, inline) {
  const f = path.join(FILES_DIR, drop.id + '.pdf');
  if (!fs.existsSync(f)) return send(res, 404, { error: 'file missing' });
  res.writeHead(200, {
    'Content-Type': 'application/pdf', 'Content-Length': fs.statSync(f).size, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${drop.ref}.pdf"; filename*=UTF-8''${encodeURIComponent(drop.fileName)}`,
  });
  fs.createReadStream(f).pipe(res);
}

/* ---------------- routes ---------------- */
async function handle(req, res) {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname.replace(/^\/api\/drop/, '').replace(/\/+$/, '') || '/';
  const M = req.method;
  const seg = p.split('/').filter(Boolean);

  if (p === '/health') return send(res, 200, { ok: true, mailDryRun: MAIL_DRY_RUN });

  /* ---- supplier signed download link ---- */
  if (M === 'GET' && seg[0] === 'f' && seg[1]) {
    const exp = +u.searchParams.get('exp'), sig = u.searchParams.get('sig') || '';
    const want = crypto.createHmac('sha256', SECRET).update(seg[1] + '.' + exp).digest('base64url');
    const d = DB.drops.find(x => x.id === seg[1]);
    if (!d || !(exp > Date.now()) || want.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return send(res, 403, { error: 'link expired or invalid' });
    return streamPdf(res, d, true);
  }

  /* ---- external portal ---- */
  if (seg[0] === 'portal') {
    if (M === 'POST' && seg[1] === 'login') {
      const b = await readJson(req);
      const username = cleanStr(b.username, 64).toLowerCase(), password = String(b.password || '');
      const key = 'p:' + username, ipKey = 'pi:' + clientIp(req);
      if (throttled(key) || throttled(ipKey)) return send(res, 429, { error: 'too many attempts, try again in 15 minutes' });
      const a = DB.accounts.find(x => x.username === username);
      if (!a || a.active === false || !password || !checkPw(password, a)) { noteFail(key); noteFail(ipKey); return send(res, 401, { error: 'invalid username or password' }); }
      fails.delete(key);
      a.lastLoginAt = new Date().toISOString(); saveDb();
      return send(res, 200, { token: sign({ k: 'ext', aid: a.id, pv: a.pwv || 0, exp: Date.now() + TOKEN_TTL }), account: pubAccount(a) });
    }
    const t = verify(bearer(req));
    const a = t && t.k === 'ext' && DB.accounts.find(x => x.id === t.aid);
    if (!a || a.active === false || (a.pwv || 0) !== t.pv) return send(res, 401, { error: 'login required' });

    if (M === 'GET' && seg[1] === 'me') {
      const all = await branchList().catch(() => []);
      const allowed = (a.branches || []).length ? all.filter(b => a.branches.includes(b.code)) : all;
      return send(res, 200, { account: pubAccount(a), branches: allowed, items: pubItems(), maxBytes: MAX_PDF });
    }
    if (M === 'GET' && seg[1] === 'drops') {
      return send(res, 200, { drops: DB.drops.filter(d => d.accountId === a.id).slice(-200).reverse().map(pubDrop) });
    }
    if (M === 'POST' && seg[1] === 'drops') {
      const q = u.searchParams;
      const branchCode = cleanStr(q.get('branch'), 32), issuerName = cleanStr(q.get('issuer'), 120), itemKey = cleanStr(q.get('item'), 40);
      let fileName = cleanStr(q.get('filename'), 150).replace(/[\\/:*?"<>|]/g, '_') || 'order.pdf';
      if (!/\.pdf$/i.test(fileName)) fileName += '.pdf';
      if (!issuerName) return send(res, 400, { error: 'name of order issuer is required' });
      const item = DB.items.find(i => i.key === itemKey);
      if (!item) return send(res, 400, { error: 'unknown item' });
      const branches = await branchList();
      const br = branches.find(b => b.code === branchCode);
      if (!br || ((a.branches || []).length && !a.branches.includes(branchCode))) return send(res, 400, { error: 'branch not allowed' });
      let buf;
      try { buf = await readBody(req, MAX_PDF); } catch (e) { return send(res, e.code === 413 ? 413 : 400, { error: e.code === 413 ? 'file too large' : 'upload failed' }); }
      if (buf.length < 8 || buf.subarray(0, 5).toString('latin1') !== '%PDF-') return send(res, 400, { error: 'file must be a PDF' });
      DB.seq++;
      const now = new Date();
      const ymd = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }).replace(/-/g, '');
      const drop = {
        id: id('d'), ref: `OD-${ymd}-${String(DB.seq).padStart(4, '0')}`, accountId: a.id, username: a.username, accountName: a.name,
        branchCode: br.code, branchName: br.name, issuerName, item: item.key, fileName, size: buf.length,
        sha256: crypto.createHash('sha256').update(buf).digest('hex'), createdAt: now.toISOString(), email: { status: 'queued', attempts: 0 },
      };
      fs.writeFileSync(path.join(FILES_DIR, drop.id + '.pdf'), buf, { mode: 0o600 });
      DB.drops.push(drop); saveDb();
      deliver(drop); // async — portal gets the ref immediately
      return send(res, 201, { drop: pubDrop(drop) });
    }
    return send(res, 404, { error: 'not found' });
  }

  /* ---- back-office admin ---- */
  if (seg[0] === 'admin') {
    if (M === 'POST' && seg[1] === 'session') {
      // Back office forwards the same userId+PIN the user just logged in with; validated by jc-round-api.
      const b = await readJson(req);
      const userId = cleanStr(b.userId, 64), pin = String(b.pin || '');
      const key = 'a:' + userId;
      if (throttled(key)) return send(res, 429, { error: 'too many attempts' });
      const r = await httpJson('POST', JCR_API + '/login', { userId, pin }, { 'X-Forwarded-For': clientIp(req) });
      if (r.status !== 200 || !r.json || !r.json.token) { noteFail(key); return send(res, 401, { error: 'invalid login' }); }
      const st = await jcrState(true);
      const user = (st.users || []).find(x => x.id === userId);
      if (!canUseDrop(user)) return send(res, 403, { error: 'no Order Drop permission' });
      return send(res, 200, { token: sign({ k: 'adm', uid: user.id, name: user.name, exp: Date.now() + TOKEN_TTL }) });
    }
    const t = verify(bearer(req));
    if (!t || t.k !== 'adm') return send(res, 401, { error: 'login required' });
    const st = await jcrState().catch(() => null);
    const user = st && (st.users || []).find(x => x.id === t.uid);
    if (!canUseDrop(user)) return send(res, 403, { error: 'no Order Drop permission' });
    const actor = user.name;

    if (M === 'GET' && seg[1] === 'overview') {
      return send(res, 200, {
        drops: DB.drops.slice().reverse().map(pubDrop), accounts: DB.accounts.map(pubAccount), items: DB.items,
        portalUrl: PUBLIC_ORIGIN + '/#/drop', mailFrom: MAIL_FROM, mailDryRun: MAIL_DRY_RUN,
      });
    }
    if (M === 'GET' && seg[1] === 'drops' && seg[2] && seg[3] === 'file') {
      const d = DB.drops.find(x => x.id === seg[2]);
      return d ? streamPdf(res, d, true) : send(res, 404, { error: 'not found' });
    }
    if (M === 'POST' && seg[1] === 'drops' && seg[2] && seg[3] === 'resend') {
      const d = DB.drops.find(x => x.id === seg[2]);
      if (!d) return send(res, 404, { error: 'not found' });
      await deliver(d);
      return send(res, 200, { drop: pubDrop(d) });
    }
    if (M === 'DELETE' && seg[1] === 'drops' && seg[2]) {
      const d = DB.drops.find(x => x.id === seg[2]);
      if (!d) return send(res, 404, { error: 'not found' });
      DB.drops = DB.drops.filter(x => x.id !== d.id);
      try { fs.unlinkSync(path.join(FILES_DIR, d.id + '.pdf')); } catch (_) {}
      saveDb(); return send(res, 200, { ok: true });
    }
    if (M === 'POST' && seg[1] === 'accounts' && !seg[2]) {
      const b = await readJson(req);
      const name = cleanStr(b.name, 120);
      if (!name) return send(res, 400, { error: 'name required' });
      let username = cleanStr(b.username, 40).toLowerCase();
      if (username && !/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username)) return send(res, 400, { error: 'username: 3–40 chars, a-z 0-9 . _ -' });
      if (username && DB.accounts.some(x => x.username === username)) return send(res, 409, { error: 'username already exists' });
      username = username || genUsername();
      const password = genPassword();
      const a = { id: id('x'), username, name, branches: Array.isArray(b.branches) ? b.branches.map(c => cleanStr(c, 32)).filter(Boolean) : [], active: true, createdAt: new Date().toISOString(), createdBy: actor, pwv: 0, ...hashPw(password) };
      DB.accounts.push(a); saveDb();
      return send(res, 201, { account: pubAccount(a), password });
    }
    if (M === 'POST' && seg[1] === 'accounts' && seg[2]) {
      const a = DB.accounts.find(x => x.id === seg[2]);
      if (!a) return send(res, 404, { error: 'not found' });
      if (seg[3] === 'reset') {
        const password = genPassword();
        Object.assign(a, hashPw(password)); a.pwv = (a.pwv || 0) + 1; // invalidates existing portal sessions
        saveDb(); return send(res, 200, { account: pubAccount(a), password });
      }
      const b = await readJson(req);
      if (b.name != null) a.name = cleanStr(b.name, 120) || a.name;
      if (Array.isArray(b.branches)) a.branches = b.branches.map(c => cleanStr(c, 32)).filter(Boolean);
      if (b.active != null) { a.active = !!b.active; if (!a.active) a.pwv = (a.pwv || 0) + 1; }
      saveDb(); return send(res, 200, { account: pubAccount(a) });
    }
    if (M === 'DELETE' && seg[1] === 'accounts' && seg[2]) {
      DB.accounts = DB.accounts.filter(x => x.id !== seg[2]); saveDb();
      return send(res, 200, { ok: true });
    }
    if (M === 'POST' && seg[1] === 'items') {
      const b = await readJson(req);
      if (!Array.isArray(b.items)) return send(res, 400, { error: 'items required' });
      const out = [];
      for (const it of b.items) {
        const cur = DB.items.find(i => i.key === it.key);
        if (!cur) continue;
        const to = (it.to || []).map(e => cleanStr(e, 120)).filter(Boolean), cc = (it.cc || []).map(e => cleanStr(e, 120)).filter(Boolean);
        const bad = [...to, ...cc].find(e => !emailOk(e));
        if (bad) return send(res, 400, { error: 'invalid email: ' + bad });
        if (!to.length) return send(res, 400, { error: cur.label + ': at least one recipient' });
        out.push({ ...cur, to, cc });
      }
      DB.items = DB.items.map(i => out.find(o => o.key === i.key) || i); saveDb();
      return send(res, 200, { items: DB.items });
    }
    return send(res, 404, { error: 'not found' });
  }
  return send(res, 404, { error: 'not found' });
}

http.createServer((req, res) => {
  handle(req, res).catch(e => { console.error('[err]', req.method, req.url, e); if (!res.headersSent) send(res, 500, { error: 'server error' }); });
}).listen(PORT, HOST, () => console.log(`jc-round-drop on ${HOST}:${PORT} · mail ${MAIL_DRY_RUN ? 'DRY-RUN (outbox)' : 'Graph as ' + MAIL_FROM}`));
