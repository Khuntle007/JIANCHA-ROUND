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
const { execFile } = require('child_process');

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

const OTHER_KEY = 'other';
const DEFAULT_ITEMS = [
  { key: 'fresh_milk', label: 'Fresh Milk', labelTh: 'นมสด', to: ['Chakrit.ji@jianchatea.com'], cc: [] },
  { key: 'yogurt', label: 'Yogurt', labelTh: 'โยเกิร์ต', to: ['Malichat.no@jianchatea.com'], cc: [] },
  { key: 'cream_cheese', label: 'Creamcheese', labelTh: 'ครีมชีส', to: ['Malichat.no@jianchatea.com'], cc: [] },
  { key: 'whipping_cream', label: 'Whipping cream', labelTh: 'วิปปิ้งครีม', to: ['Chakrit.ji@jianchatea.com'], cc: [] },
];

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
  db.items = db.items && db.items.length ? db.items : DEFAULT_ITEMS.map(i => ({ ...i }));
  // catch-all for PO lines that match no item: recorded + emailed to this item's recipients (empty = shows in back office as "waiting for SCM")
  if (!db.items.some(i => i.key === OTHER_KEY)) db.items.push({ key: OTHER_KEY, label: 'Other', labelTh: 'อื่นๆ / ไม่ระบุประเภท', to: [], cc: [] });
  db.products = db.products || [];   // product code (from PO / Business Central) -> suppliers
  db.settings = Object.assign({ scmEmails: ['xxx@gmail.com'], reminderHours: 0 }, db.settings || {}); // placeholder SCM address: edit in back office
  db.settings.bc = db.settings.bc || {};
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
function httpJson(method, url, body, headers, timeoutMs) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const data = body == null ? null : (typeof body === 'string' ? body : JSON.stringify(body));
    const req = lib.request(u, {
      method, headers: { ...(data ? { 'Content-Type': typeof body === 'string' ? 'application/x-www-form-urlencoded' : 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}), ...(headers || {}) },
      timeout: timeoutMs || 20000,
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

/* ---------------- PO parsing (pdftotext) ---------------- */
function pdfText(buf) {
  return new Promise((resolve, reject) => {
    const tmp = path.join(DATA_DIR, 'tmp-' + crypto.randomBytes(8).toString('hex') + '.pdf');
    fs.writeFileSync(tmp, buf, { mode: 0o600 });
    execFile('pdftotext', ['-layout', '-enc', 'UTF-8', tmp, '-'], { timeout: 20000, maxBuffer: 8 * 1024 * 1024 }, (err, out) => {
      fs.unlink(tmp, () => {});
      if (err) return reject(Object.assign(new Error(err.code === 'ENOENT' ? 'pdftotext not installed' : 'cannot read PDF'), { code: err.code === 'ENOENT' ? 'NOTOOL' : 'BADPDF' }));
      resolve(String(out));
    });
  });
}
const num = v => parseFloat(String(v).replace(/,/g, ''));
function parsePo(text) {
  const lines = text.split(/\r?\n/);
  const col = (l, n) => (l || '').slice(0, n).split(/\s{3,}/)[0].trim();
  const po = { number: (text.match(/\bPO\d{6,}\b/) || [])[0] || '', lines: [] };
  const bi = lines.findIndex(l => /BUYER\s*\/\s*SHIP TO/i.test(l));
  if (bi >= 0) { const l = lines.slice(bi + 1).find(x => x.trim()); po.buyer = l ? l.trim().split(/\s{3,}/)[0] : ''; }
  po.buyer = po.buyer || '';
  const grab = re => { const m = text.match(re); return m ? m[1].trim() : ''; };
  po.issuedDate = grab(/Issued date\s*:\s*(\S+)/i); po.dueDate = grab(/Due date\s*:\s*(\S+)/i); po.creditTerms = grab(/Credit terms\s*:\s*(\S+)/i);
  po.contact = grab(/Contact\s*:\s*(.+?)(?:\s{3,}|$)/im); po.tel = grab(/Tel\s*:\s*(.+?)(?:\s{3,}|$)/im);
  po.issuedBy = grab(/Issued by\s*:\s*(.+?)\s*$/im);
  const rowRe = /^\s*(\d{1,3})\s+(\d{4,}\s*-\s*.+?)\s{2,}([\d,]+(?:\.\d+)?)\s+(\S+)\s+([YN])\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)\s*$/;
  for (const l of lines) {
    const m = l.match(rowRe);
    if (m) po.lines.push({ no: +m[1], name: m[2].replace(/\s+/g, ' ').trim(), qty: num(m[3]), unit: m[4], vat: m[5], price: num(m[6]), total: num(m[7]) });
  }
  const t = text.match(/(?<!Grand )\bTotal\s+([\d,]+\.\d+)\s*$/m), v = text.match(/VAT\s*\((\d+(?:\.\d+)?)%\)\s+([\d,]+\.\d+)/i), g = text.match(/Grand Total\s+([\d,]+\.\d+)/i);
  po.total = t ? num(t[1]) : null; po.vatRate = v ? v[1] : ''; po.vat = v ? num(v[2]) : null; po.grand = g ? num(g[1]) : null;
  const ri = lines.findIndex(l => /Remarks\s*:/i.test(l));
  if (ri >= 0) {
    const end = lines.findIndex((l, i) => i > ri && /Authorized by|_{6,}/.test(l));
    po.remarks = lines.slice(ri, end > ri ? end : ri + 6).map((l, i) => (i === 0 ? l.replace(/^.*?Remarks\s*:/i, '') : l).slice(0, 60).trim()).filter(Boolean).join(' ').replace(/^-$/, '');
  } else po.remarks = '';
  return po;
}
const normName = x => String(x || '').toLowerCase().replace(/[\s\-_.]+/g, '');
function itemForLine(name) {
  const n = normName(name);
  const hit = DB.items.find(i => i.key !== OTHER_KEY && [i.label, i.labelTh].some(w => normName(w).length >= 2 && n.includes(normName(w))));
  return hit ? hit.key : OTHER_KEY;
}

/* ---------------- products (codes from PO / Business Central) ---------------- */
const codeOf = name => { const m = String(name || '').match(/^\s*(\d{4,})\s*-\s*/); return m ? m[1] : ''; };
function ensureProduct(code, name) {
  let p = DB.products.find(x => x.code === code);
  if (!p) { p = { code, name: name || '', source: 'po', suppliers: [] }; DB.products.push(p); }
  p.seen = true; if (!p.name && name) p.name = name;
  return p;
}
const cleanSuppliers = list => (Array.isArray(list) ? list : []).map(x => ({
  id: cleanStr(x.id, 20) || id('s'), name: cleanStr(x.name, 80),
  to: (x.to || []).map(e => cleanStr(e, 120)).filter(Boolean), cc: (x.cc || []).map(e => cleanStr(e, 120)).filter(Boolean),
}));
const bcConf = () => {
  const tenant = process.env.BC_TENANT_ID || process.env.GRAPH_TENANT_ID || '';
  return { tenant, client: process.env.BC_CLIENT_ID || process.env.GRAPH_CLIENT_ID || '', secret: process.env.BC_CLIENT_SECRET || process.env.GRAPH_CLIENT_SECRET || '',
    env: process.env.BC_ENVIRONMENT || 'Production', company: process.env.BC_COMPANY || '',
    api: (process.env.BC_API_BASE || 'https://api.businesscentral.dynamics.com').replace(/\/$/, ''),
    tokenUrl: process.env.BC_TOKEN_URL || `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token` };
};
const bcConfigured = () => { const c = bcConf(); return !!(c.tenant && c.client && c.secret && c.company); };
let bcRunning = false;
async function bcSync() { // pulls item No. + Description from Business Central into DB.products
  if (!bcConfigured()) throw new Error('ยังไม่ได้ตั้งค่า Business Central (BC_TENANT_ID / BC_CLIENT_ID / BC_CLIENT_SECRET / BC_COMPANY ใน .env)');
  if (bcRunning) throw new Error('กำลังซิงก์อยู่');
  bcRunning = true;
  try {
    const c = bcConf();
    const t = await httpJson('POST', c.tokenUrl, new URLSearchParams({ client_id: c.client, client_secret: c.secret, scope: 'https://api.businesscentral.dynamics.com/.default', grant_type: 'client_credentials' }).toString());
    if (t.status !== 200 || !t.json || !t.json.access_token) throw new Error('BC token ' + t.status + ' ' + ((t.json && t.json.error_description) || t.text || '').slice(0, 200));
    const hdr = { Authorization: 'Bearer ' + t.json.access_token, Prefer: 'odata.maxpagesize=5000' };
    const base = `${c.api}/v2.0/${c.tenant}/${encodeURIComponent(c.env)}/api/v2.0`;
    const cs = await httpJson('GET', base + '/companies', null, hdr, 60000);
    if (cs.status !== 200 || !cs.json) throw new Error('BC companies ' + cs.status + ' ' + (cs.text || '').slice(0, 200));
    const comp = (cs.json.value || []).find(x => [x.id, x.name, x.displayName].includes(c.company));
    if (!comp) throw new Error('ไม่พบบริษัท "' + c.company + '" ใน Business Central');
    let url = `${base}/companies(${comp.id})/items?$select=number,displayName,blocked`, n = 0;
    const byCode = new Map(DB.products.map(p => [p.code, p]));
    while (url) {
      const r = await httpJson('GET', url, null, hdr, 120000);
      if (r.status !== 200 || !r.json) throw new Error('BC items ' + r.status + ' ' + (r.text || '').slice(0, 200));
      for (const it of r.json.value || []) {
        const code = cleanStr(it.number, 40); if (!code) continue;
        let p = byCode.get(code);
        if (!p) { p = { code, name: '', source: 'bc', suppliers: [] }; DB.products.push(p); byCode.set(code, p); }
        p.name = cleanStr(it.displayName, 200) || p.name; p.bc = true; p.blocked = !!it.blocked; n++;
      }
      url = r.json['@odata.nextLink'] || '';
    }
    DB.settings.bc = { lastSyncAt: new Date().toISOString(), count: n, company: comp.displayName || comp.name, error: '' };
    saveDb(); return DB.settings.bc;
  } catch (e) {
    DB.settings.bc = { ...DB.settings.bc, error: String(e.message || e).slice(0, 300), failedAt: new Date().toISOString() }; saveDb(); throw e;
  } finally { bcRunning = false; }
}

/* ---------------- PO report (one row per PO line) ---------------- */
const bkkDay = iso => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
function buildReport(params, scope, admin) {
  const lab = k => (DB.items.find(i => i.key === k) || {}).label || k;
  const from = cleanStr(params.get('from'), 10), to = cleanStr(params.get('to'), 10);
  const many = k => params.getAll(k).map(v => cleanStr(v, 120)).filter(Boolean).slice(0, 200); // repeated params = multi-select
  const branch = many('branch'), item = many('item'), account = many('account');
  const q = cleanStr(params.get('q'), 80).toLowerCase();
  const rows = [], branches = new Set();
  for (const d of scope.slice().reverse()) {
    if (d.branchName) branches.add(d.branchName);
    const day = bkkDay(d.createdAt);
    if ((from && day < from) || (to && day > to) || (branch.length && !branch.includes(d.branchName)) || (item.length && !item.includes(d.item)) || (account.length && !account.includes(d.accountId))) continue;
    const po = d.po, lines = po && po.lines && po.lines.length ? po.lines : [null];
    for (const l of lines) {
      const r = {
        dropId: d.id, fileName: d.fileName, createdAt: d.createdAt, day, ref: d.ref, poNumber: po ? po.number : '', branch: d.branchName, itemKey: d.item, itemLabel: lab(d.item),
        issuedDate: po ? po.issuedDate : '', issuer: d.issuerName, account: d.accountName || d.username, emailStatus: (d.email || {}).status || '',
        supplier: admin && d.route ? d.route.supplierName || '' : '', pending: (d.email || {}).status === 'pending', hasDetail: !!l, no: l ? l.no : '', product: l ? l.name : '', qty: l ? l.qty : null, unit: l ? l.unit : '', vat: l ? l.vat : '', price: l ? l.price : null, total: l ? l.total : null,
      };
      if (q && ![r.poNumber, r.ref, r.product, r.branch].some(x => String(x).toLowerCase().includes(q))) continue;
      rows.push(r);
    }
  }
  return { rows: rows.slice(0, 5000), truncated: rows.length > 5000, branches: [...branches].sort(), items: DB.items.map(i => ({ key: i.key, label: i.label })) };
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
const money = n => n == null ? '' : Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function buildMail(drop, item) {
  const po = drop.po;
  const subject = `[JIANCHA Order Drop] ${item.label} · ${po ? (po.buyer || drop.branchName) + ' · ' + po.number : drop.branchName} · ${drop.ref}`;
  const big = drop.size > ATTACH_MAX;
  const when = new Date(drop.createdAt).toLocaleString('en-GB', { timeZone: 'Asia/Bangkok' });
  const row = (k, v) => v ? `<tr><td style="padding:5px 14px 5px 0;color:#525252;font-size:12px;letter-spacing:.06em;text-transform:uppercase;vertical-align:top">${k}</td><td style="padding:5px 0;font-size:14px;color:#181818"><b>${v}</b></td></tr>` : '';
  const td = (v, al) => `<td style="padding:6px 8px;border-bottom:1px solid #EBE9E6;font-size:13px;text-align:${al || 'left'}">${v}</td>`;
  const th = (v, al) => `<th style="padding:6px 8px;background:#F3F1EB;font-size:11px;letter-spacing:.05em;text-transform:uppercase;text-align:${al || 'left'}">${v}</th>`;
  let head, body = '';
  if (po) {
    head = row('Ref', escHtml(drop.ref)) + row('PO No.', escHtml(po.number)) + row('Item', escHtml(item.label) + (item.labelTh ? ' · ' + escHtml(item.labelTh) : ''))
      + row('Buyer / Ship to', escHtml(po.buyer)) + row('Contact', escHtml(po.contact) + (po.tel && po.tel !== '-' && po.tel !== '--' ? ' · ' + escHtml(po.tel) : ''))
      + row('Issued date', escHtml(po.issuedDate)) + row('Due date', po.dueDate && po.dueDate !== '-' ? escHtml(po.dueDate) : '') + row('Credit terms', po.creditTerms && po.creditTerms !== '-' ? escHtml(po.creditTerms) : '')
      + row('Issued by', escHtml(po.issuedBy || drop.issuerName)) + row('Submitted', escHtml(when) + ' (BKK)');
    body = `<table style="border-collapse:collapse;width:100%;margin-top:16px"><tr>${th('No.')}${th('Ingredient')}${th('Qty', 'right')}${th('Unit')}${th('VAT')}${th('Price', 'right')}${th('Total', 'right')}</tr>`
      + po.lines.map((l, i) => `<tr>${td(i + 1)}${td(escHtml(l.name))}${td(escHtml(l.qty), 'right')}${td(escHtml(l.unit))}${td(escHtml(l.vat))}${td(money(l.price), 'right')}${td(money(l.total), 'right')}</tr>`).join('') + '</table>'
      + `<table style="border-collapse:collapse;margin:10px 0 0 auto">${po.partial
        ? `<tr><td style="padding:3px 14px;font-size:13px;color:#525252">Total (this item)</td><td style="padding:3px 0;font-size:14px;text-align:right"><b>${money(po.total)}</b></td></tr>`
        : `<tr><td style="padding:3px 14px;font-size:13px;color:#525252">Total</td><td style="text-align:right;font-size:13px">${money(po.total)}</td></tr>`
          + `<tr><td style="padding:3px 14px;font-size:13px;color:#525252">VAT${po.vatRate ? ' (' + escHtml(po.vatRate) + '%)' : ''}</td><td style="text-align:right;font-size:13px">${money(po.vat)}</td></tr>`
          + `<tr><td style="padding:3px 14px;font-size:14px"><b>Grand Total</b></td><td style="text-align:right;font-size:15px"><b>${money(po.grand)}</b></td></tr>`}</table>`
      + (po.partial ? `<p style="font-size:11px;color:#8a6d00;margin:8px 0 0">ใบ PO นี้มีหลายประเภทสินค้า — เมลนี้แสดงเฉพาะรายการของ ${escHtml(item.label)} / This PO has several item types; only this item's lines are shown.</p>` : '')
      + (po.remarks ? `<p style="font-size:13px;margin:12px 0 0"><span style="color:#525252">Remarks:</span> ${escHtml(po.remarks)}</p>` : '');
  } else {
    head = row('Ref', escHtml(drop.ref)) + row('Item', escHtml(item.label) + (item.labelTh ? ' · ' + escHtml(item.labelTh) : ''))
      + row('Branch', escHtml(drop.branchName) + (drop.branchCode ? ' (' + escHtml(drop.branchCode) + ')' : '')) + row('Issued by', escHtml(drop.issuerName))
      + row('Submitted', escHtml(when) + ' (BKK)') + row('File', escHtml(drop.fileName));
  }
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:680px">
  <div style="background:#181818;color:#fff;padding:16px 20px;letter-spacing:.2em;font-weight:700">JIAN CHA <span style="color:#AD9C82;font-size:11px;letter-spacing:.25em;font-weight:400">· ORDER DROP</span></div>
  <div style="border:1px solid #EBE9E6;border-top:3px solid #AD9C82;padding:18px 20px">
   <p style="margin:0 0 12px;font-size:14px">มีใบสั่งซื้อใหม่จากสาขาแฟรนไชส์ / New franchise order received.</p>
   <table style="border-collapse:collapse">${head}</table>${body}
   ${big ? `<p style="margin:16px 0 0"><a href="${fileLink(drop)}" style="background:#181818;color:#fff;padding:10px 16px;text-decoration:none;font-size:13px;letter-spacing:.06em">DOWNLOAD PDF</a><br><span style="font-size:11px;color:#525252">ไฟล์ใหญ่เกินแนบอีเมล — ลิงก์ใช้ได้ 14 วัน / File too large to attach — link valid 14 days.</span></p>` : `<p style="font-size:12px;color:#525252;margin:14px 0 0">ไฟล์ PDF แนบมากับอีเมลนี้ / PDF attached.</p>`}
  </div>
  <p style="font-size:11px;color:#525252;margin:10px 2px">อีเมลอัตโนมัติจากระบบ JC-ROUND — กรุณาอย่าตอบกลับ / Automated message, please do not reply.</p></div>`;
  return { subject, html, big };
}
async function transmit(message, tag) { // the one place that actually sends (or writes to the outbox in dry-run)
  if (MAIL_DRY_RUN) {
    fs.writeFileSync(path.join(OUTBOX_DIR, tag + '-' + Date.now() + '.json'),
      JSON.stringify({ from: MAIL_FROM, ...message, attachments: (message.attachments || []).map(a => ({ name: a.name, bytes: Buffer.from(a.contentBytes, 'base64').length })) }, null, 1));
    return { dryRun: true };
  }
  const tok = await graphToken();
  const r = await httpJson('POST', `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(MAIL_FROM)}/sendMail`,
    { message, saveToSentItems: true }, { Authorization: 'Bearer ' + tok });
  if (r.status !== 202) throw new Error('Graph sendMail ' + r.status + ' ' + (r.text || '').slice(0, 300));
  return {};
}
async function sendDropMail(drop) {
  const item = DB.items.find(i => i.key === drop.item) || { key: drop.item, label: drop.item, labelTh: '', to: [], cc: [] };
  // a supplier chosen via product code (route) wins over the item-type recipients
  const rec = drop.route && drop.route.kind === 'supplier' ? drop.route : item;
  if (!rec.to || !rec.to.length) throw new Error('no recipient configured for ' + (drop.route && drop.route.supplierName || 'item ' + drop.item));
  const { subject, html, big } = buildMail(drop, item);
  const message = {
    subject, body: { contentType: 'HTML', content: html },
    toRecipients: rec.to.map(a => ({ emailAddress: { address: a } })),
    ccRecipients: (rec.cc || []).map(a => ({ emailAddress: { address: a } })),
  };
  if (!big) {
    message.attachments = [{
      '@odata.type': '#microsoft.graph.fileAttachment', name: drop.fileName, contentType: 'application/pdf',
      contentBytes: fs.readFileSync(path.join(FILES_DIR, drop.id + '.pdf')).toString('base64'),
    }];
  }
  const r = await transmit(message, drop.id);
  return { to: rec.to, cc: rec.cc || [], ...(r.dryRun ? { dryRun: true } : {}) };
}
/* SCM is told (once; reminders optional) when a PO line has several suppliers and nobody has chosen yet */
async function notifyScm(drops) {
  const to = (DB.settings.scmEmails || []).filter(emailOk);
  if (!drops.length || !to.length) return;
  const byPo = new Map();
  drops.forEach(d => { const k = d.po ? d.po.number : d.ref; if (!byPo.has(k)) byPo.set(k, []); byPo.get(k).push(d); });
  const td = v => `<td style="padding:6px 8px;border-bottom:1px solid #EBE9E6;font-size:13px">${v}</td>`;
  const blocks = [...byPo].map(([no, ds]) => `<p style="margin:14px 0 4px;font-size:14px"><b>${escHtml(no)}</b> · ${escHtml(ds[0].branchName)}</p><table style="border-collapse:collapse;width:100%">${ds.map(d => d.po.lines.map(l =>
    `<tr>${td(escHtml(d.ref))}${td(escHtml(l.name))}${td(escHtml(l.qty) + ' ' + escHtml(l.unit))}${td('<span style="color:#8a6d00">' + d.route.options.map(o => escHtml(o.name)).join(' / ') + '</span>')}</tr>`).join('')).join('')}</table>`).join('');
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:680px"><div style="background:#181818;color:#fff;padding:16px 20px;letter-spacing:.2em;font-weight:700">JIAN CHA <span style="color:#AD9C82;font-size:11px;letter-spacing:.25em;font-weight:400">· ORDER DROP</span></div>
  <div style="border:1px solid #EBE9E6;border-top:3px solid #AD9C82;padding:18px 20px"><p style="margin:0 0 8px;font-size:14px">มีรายการสินค้าที่มี supplier หลายเจ้า ระบบ<b>ยังไม่ได้ส่ง</b>อีเมลถึง supplier กรุณาเลือก supplier / These items have several suppliers — nothing was sent yet. Please choose one.</p>${blocks}
  <p style="margin:18px 0 0"><a href="${PUBLIC_ORIGIN}/#/drops" style="background:#181818;color:#fff;padding:10px 16px;text-decoration:none;font-size:13px;letter-spacing:.06em">เปิดหน้ารอเลือก supplier</a></p>
  <p style="font-size:11px;color:#525252;margin:10px 0 0">ต้องล็อกอินหลังบ้าน → Order Drop → แท็บ “รอเลือก supplier”</p></div></div>`;
  try {
    await transmit({ subject: `[JIANCHA Order Drop] รอเลือก supplier · ${[...byPo.keys()].join(', ')}`, body: { contentType: 'HTML', content: html }, toRecipients: to.map(a => ({ emailAddress: { address: a } })) }, 'scm-' + drops[0].id);
    const now = new Date().toISOString(); drops.forEach(d => { d.notifiedAt = now; d.notifyError = ''; });
  } catch (e) { drops.forEach(d => { d.notifyError = String(e.message || e).slice(0, 300); }); console.error('[notify-scm]', e.message); }
  saveDb();
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
const canReport = a => !!a.portalAdmin || a.reportAccess !== false; // legacy accounts (field missing) keep report access
function pubAccount(a) { return { id: a.id, username: a.username, name: a.name, branches: a.branches || [], active: a.active !== false, portalAdmin: !!a.portalAdmin, reportAccess: canReport(a), createdAt: a.createdAt, createdBy: a.createdBy, lastLoginAt: a.lastLoginAt || null }; }
function pubDrop(d, admin) {
  const o = { id: d.id, ref: d.ref, branchCode: d.branchCode, branchName: d.branchName, issuerName: d.issuerName, poNumber: d.po ? d.po.number : '', item: d.item, itemLabel: (DB.items.find(i => i.key === d.item) || {}).label || d.item, fileName: d.fileName, size: d.size, createdAt: d.createdAt, username: d.username, accountName: d.accountName, email: d.email || {} };
  if (admin && d.route) { // suppliers + emails are back-office only
    o.supplierName = d.route.supplierName || '';
    if (d.route.kind === 'pending') { o.pendingCode = d.route.code; o.options = d.route.options.map(x => ({ id: x.id, name: x.name, to: x.to, cc: x.cc })); o.lines = d.po ? d.po.lines : []; o.notifiedAt = d.notifiedAt || ''; }
    else if (d.route.chosenBy) { o.chosenBy = d.route.chosenBy; o.chosenAt = d.route.chosenAt; }
  }
  return o;
}
const pubItems = () => DB.items.map(i => ({ key: i.key, label: i.label, labelTh: i.labelTh }));
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
    if (M === 'GET' && seg[1] === 'drops' && !seg[2]) {
      return send(res, 200, { drops: DB.drops.filter(d => d.accountId === a.id).slice(-200).reverse().map(d => pubDrop(d)) });
    }
    if (M === 'GET' && seg[1] === 'report') {
      if (!canReport(a)) return send(res, 403, { error: 'ไม่มีสิทธิ์เข้าหน้ารายงาน' });
      return send(res, 200, buildReport(u.searchParams, DB.drops.filter(d => d.accountId === a.id)));
    }
    if (M === 'GET' && seg[1] === 'drops' && seg[2] && seg[3] === 'file') { // original PDF of one of this account's own drops
      if (!canReport(a)) return send(res, 403, { error: 'ไม่มีสิทธิ์' });
      const d = DB.drops.find(x => x.id === seg[2] && x.accountId === a.id);
      return d ? streamPdf(res, d, false) : send(res, 404, { error: 'not found' });
    }
    if (seg[1] === 'access') { // franchise-side admins manage who can open the report page
      if (!a.portalAdmin) return send(res, 403, { error: 'admin only' });
      if (M === 'GET' && !seg[2]) return send(res, 200, { accounts: DB.accounts.filter(x => x.active !== false).map(x => ({ id: x.id, name: x.name, username: x.username, portalAdmin: !!x.portalAdmin, reportAccess: canReport(x) })) });
      if (M === 'POST' && seg[2]) {
        const t = DB.accounts.find(x => x.id === seg[2]);
        if (!t) return send(res, 404, { error: 'not found' });
        if (t.portalAdmin) return send(res, 400, { error: 'แอดมินเข้ารายงานได้เสมอ' });
        const b = await readJson(req);
        t.reportAccess = !!b.reportAccess; saveDb();
        return send(res, 200, { id: t.id, reportAccess: canReport(t) });
      }
    }
    if (M === 'POST' && seg[1] === 'drops') {
      let fileName = cleanStr(u.searchParams.get('filename'), 150).replace(/[\\/:*?"<>|]/g, '_') || 'order.pdf';
      if (!/\.pdf$/i.test(fileName)) fileName += '.pdf';
      let buf;
      try { buf = await readBody(req, MAX_PDF); } catch (e) { return send(res, e.code === 413 ? 413 : 400, { error: e.code === 413 ? 'file too large' : 'upload failed' }); }
      if (buf.length < 8 || buf.subarray(0, 5).toString('latin1') !== '%PDF-') return send(res, 400, { error: 'file must be a PDF' });
      let po;
      try { po = parsePo(await pdfText(buf)); }
      catch (e) { return send(res, e.code === 'NOTOOL' ? 503 : 422, { error: e.code === 'NOTOOL' ? 'ระบบอ่าน PDF ยังไม่พร้อม แจ้งทีม SCM' : 'อ่านไฟล์ PDF ไม่ได้' }); }
      if (!po.number || !po.lines.length) return send(res, 422, { error: 'ไม่พบข้อมูล PO ในไฟล์นี้ — ต้องเป็นใบ PO (PURCHASE ORDER) จากระบบ PO เท่านั้น' });
      // route every PO line: product code -> its supplier (1 = auto, >1 = SCM chooses), else fall back to item type by name
      const groups = new Map();
      for (const l of po.lines) {
        const code = codeOf(l.name), prod = code ? ensureProduct(code, l.name.replace(/^\s*\d+\s*-\s*/, '').trim()) : null;
        let key, route = null;
        const sup = prod ? prod.suppliers.filter(x => x.to && x.to.length) : [];
        if (sup.length === 1) { route = { kind: 'supplier', supplierId: sup[0].id, supplierName: sup[0].name, to: sup[0].to, cc: sup[0].cc || [] }; key = 'to:' + sup[0].to.slice().sort().join(','); }
        else if (sup.length > 1) { route = { kind: 'pending', code, options: sup.map(x => ({ id: x.id, name: x.name, to: x.to, cc: x.cc || [] })) }; key = 'pending:' + code; }
        else key = 'item:' + itemForLine(l.name);
        if (!groups.has(key)) groups.set(key, { route, item: itemForLine(l.name), lines: [] });
        groups.get(key).lines.push(l);
      }
      const now = new Date();
      const ymd = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }).replace(/-/g, '');
      const sha = crypto.createHash('sha256').update(buf).digest('hex');
      const out = [];
      for (const g of groups.values()) {
        DB.seq++;
        const lines = g.lines, partial = groups.size > 1;
        const gpo = { ...po, lines, partial, ...(partial ? { total: Math.round(lines.reduce((x, l) => x + l.total, 0) * 100) / 100 } : {}) };
        const drop = {
          id: id('d'), ref: `OD-${ymd}-${String(DB.seq).padStart(4, '0')}`, accountId: a.id, username: a.username, accountName: a.name,
          branchCode: '', branchName: po.buyer || '-', issuerName: po.issuedBy || a.name, item: g.item, fileName, size: buf.length,
          sha256: sha, createdAt: now.toISOString(), email: { status: g.route && g.route.kind === 'pending' ? 'pending' : 'queued', attempts: 0 }, po: gpo,
        };
        if (g.route) drop.route = g.route;
        fs.writeFileSync(path.join(FILES_DIR, drop.id + '.pdf'), buf, { mode: 0o600 });
        DB.drops.push(drop); out.push(drop);
      }
      saveDb();
      out.filter(d => d.email.status !== 'pending').forEach(deliver); // async — portal gets the refs immediately
      notifyScm(out.filter(d => d.email.status === 'pending')); // SCM picks the supplier; nothing is emailed to suppliers yet
      return send(res, 201, { drop: pubDrop(out[0]), drops: out.map(d => pubDrop(d)) });
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

    if (M === 'GET' && seg[1] === 'report') {
      return send(res, 200, { ...buildReport(u.searchParams, DB.drops, true), accounts: DB.accounts.map(x => ({ id: x.id, name: x.name, username: x.username })) });
    }
    if (M === 'GET' && seg[1] === 'overview') {
      return send(res, 200, {
        drops: DB.drops.slice().reverse().map(d => pubDrop(d, true)), settings: { scmEmails: DB.settings.scmEmails, reminderHours: DB.settings.reminderHours }, bc: { configured: bcConfigured(), ...DB.settings.bc }, accounts: DB.accounts.map(pubAccount), items: DB.items,
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
      if (d.email && d.email.status === 'pending') return send(res, 400, { error: 'รายการนี้รอเลือก supplier ก่อน' });
      await deliver(d);
      return send(res, 200, { drop: pubDrop(d, true) });
    }
    if (M === 'POST' && seg[1] === 'drops' && seg[2] && seg[3] === 'choose') { // SCM/admin picks the supplier for a pending line
      const d = DB.drops.find(x => x.id === seg[2]);
      if (!d) return send(res, 404, { error: 'not found' });
      if (!d.route || d.route.kind !== 'pending' || d.email.status !== 'pending') return send(res, 400, { error: 'รายการนี้ไม่ได้รอเลือก supplier' });
      const b = await readJson(req);
      const o = d.route.options.find(x => x.id === cleanStr(b.supplierId, 20));
      if (!o) return send(res, 400, { error: 'supplier ไม่ถูกต้อง' });
      d.route = { kind: 'supplier', supplierId: o.id, supplierName: o.name, to: o.to, cc: o.cc || [], chosenBy: actor, chosenAt: new Date().toISOString() };
      d.email = { status: 'queued', attempts: 0 }; saveDb();
      await deliver(d);
      return send(res, 200, { drop: pubDrop(d, true) });
    }
    if (M === 'GET' && seg[1] === 'products') { // default list = products with suppliers or seen in a PO; q searches the whole Business Central catalog
      const q = cleanStr(u.searchParams.get('q'), 60).toLowerCase();
      let list = DB.products.filter(p => q ? (p.code + ' ' + p.name).toLowerCase().includes(q) : (p.suppliers.length || p.seen));
      const total = list.length; list = list.sort((x, y) => x.code.localeCompare(y.code)).slice(0, 100);
      return send(res, 200, { products: list, total, all: DB.products.length });
    }
    if (M === 'POST' && seg[1] === 'products' && seg[2]) { // set the suppliers of one product code (creates it if unknown)
      const b = await readJson(req), code = cleanStr(seg[2], 40);
      if (!/^[A-Za-z0-9._-]{1,40}$/.test(code)) return send(res, 400, { error: 'รหัสสินค้าไม่ถูกต้อง' });
      const sup = cleanSuppliers(b.suppliers);
      for (const x of sup) {
        if (!x.name) return send(res, 400, { error: 'ใส่ชื่อ supplier ทุกเจ้า' });
        if (!x.to.length) return send(res, 400, { error: x.name + ': ต้องมีอีเมลอย่างน้อย 1' });
        const bad = [...x.to, ...x.cc].find(e => !emailOk(e));
        if (bad) return send(res, 400, { error: 'อีเมลไม่ถูกต้อง: ' + bad });
      }
      let p = DB.products.find(x => x.code === code);
      if (!p) { p = { code, name: cleanStr(b.name, 200), source: 'manual', suppliers: [] }; DB.products.push(p); }
      p.suppliers = sup; saveDb();
      return send(res, 200, { product: p });
    }
    if (M === 'POST' && seg[1] === 'settings') {
      const b = await readJson(req);
      const emails = (Array.isArray(b.scmEmails) ? b.scmEmails : []).map(e => cleanStr(e, 120)).filter(Boolean);
      const bad = emails.find(e => !emailOk(e));
      if (bad) return send(res, 400, { error: 'อีเมลไม่ถูกต้อง: ' + bad });
      const h = Math.max(0, Math.min(720, Math.round(+b.reminderHours || 0)));
      DB.settings.scmEmails = emails; DB.settings.reminderHours = h; saveDb();
      return send(res, 200, { settings: { scmEmails: emails, reminderHours: h } });
    }
    if (M === 'POST' && seg[1] === 'bc' && seg[2] === 'sync') {
      try { const r = await bcSync(); return send(res, 200, { bc: { configured: true, ...r } }); }
      catch (e) { return send(res, 502, { error: String(e.message || e) }); }
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
      const a = { id: id('x'), username, name, branches: Array.isArray(b.branches) ? b.branches.map(c => cleanStr(c, 32)).filter(Boolean) : [], active: true, portalAdmin: !!b.portalAdmin, reportAccess: !!b.reportAccess, createdAt: new Date().toISOString(), createdBy: actor, pwv: 0, ...hashPw(password) };
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
      if (b.portalAdmin != null) a.portalAdmin = !!b.portalAdmin;
      if (b.reportAccess != null) a.reportAccess = !!b.reportAccess;
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
      if (b.add) { // new item type: PO lines whose name contains its label (EN or TH) are routed to it
        const label = cleanStr(b.add.label, 60), labelTh = cleanStr(b.add.labelTh, 60);
        const to = (b.add.to || []).map(e => cleanStr(e, 120)).filter(Boolean), cc = (b.add.cc || []).map(e => cleanStr(e, 120)).filter(Boolean);
        if (!label) return send(res, 400, { error: 'item name required' });
        const bad = [...to, ...cc].find(e => !emailOk(e));
        if (bad) return send(res, 400, { error: 'invalid email: ' + bad });
        if (!to.length) return send(res, 400, { error: 'at least one recipient' });
        const key = normName(label).replace(/[^a-z0-9ก-๙]/g, '').slice(0, 30) || id('i');
        if (DB.items.some(i => i.key === key || normName(i.label) === normName(label))) return send(res, 400, { error: 'item already exists' });
        DB.items.splice(DB.items.findIndex(i => i.key === OTHER_KEY), 0, { key, label, labelTh, to, cc }); saveDb();
      }
      const out = [];
      for (const it of b.items) {
        const cur = DB.items.find(i => i.key === it.key);
        if (!cur) continue;
        const to = (it.to || []).map(e => cleanStr(e, 120)).filter(Boolean), cc = (it.cc || []).map(e => cleanStr(e, 120)).filter(Boolean);
        const bad = [...to, ...cc].find(e => !emailOk(e));
        if (bad) return send(res, 400, { error: 'invalid email: ' + bad });
        if (!to.length && cur.key !== OTHER_KEY) return send(res, 400, { error: cur.label + ': at least one recipient' });
        out.push({ ...cur, to, cc });
      }
      DB.items = DB.items.map(i => out.find(o => o.key === i.key) || i); saveDb();
      return send(res, 200, { items: DB.items });
    }
    return send(res, 404, { error: 'not found' });
  }
  return send(res, 404, { error: 'not found' });
}

/* reminders for lines still waiting for SCM (off by default: settings.reminderHours = 0) + daily Business Central sync */
setInterval(() => {
  const h = DB.settings.reminderHours;
  if (!(h > 0)) return;
  const due = DB.drops.filter(d => d.email && d.email.status === 'pending' && Date.now() - Date.parse(d.notifiedAt || d.createdAt) >= h * 3600 * 1000);
  if (due.length) notifyScm(due);
}, 15 * 60 * 1000).unref();
setInterval(() => {
  if (bcConfigured() && !(Date.now() - Date.parse(DB.settings.bc.lastSyncAt || 0) < 24 * 3600 * 1000)) bcSync().catch(e => console.error('[bc]', e.message));
}, 60 * 60 * 1000).unref();
setTimeout(() => { if (bcConfigured() && !DB.settings.bc.lastSyncAt) bcSync().catch(e => console.error('[bc]', e.message)); }, 20000).unref();

http.createServer((req, res) => {
  handle(req, res).catch(e => { console.error('[err]', req.method, req.url, e); if (!res.headersSent) send(res, 500, { error: 'server error' }); });
}).listen(PORT, HOST, () => console.log(`jc-round-drop on ${HOST}:${PORT} · mail ${MAIL_DRY_RUN ? 'DRY-RUN (outbox)' : 'Graph as ' + MAIL_FROM}`));
