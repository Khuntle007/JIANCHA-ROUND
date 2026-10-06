#!/usr/bin/env node
// View / change Order Drop email routing per item from the server shell (run as root).
//   node set-recipients.js --list
//   node set-recipients.js --item yogurt --add-to it.manager@jianchatea.com
//   node set-recipients.js --item yogurt --add-cc a@x.com,b@x.com
//   node set-recipients.js --item yogurt --remove it.manager@jianchatea.com     (from To and CC)
//   node set-recipients.js --item yogurt --to a@x.com,b@x.com [--cc c@x.com]     (replace)
// --item accepts the group key (sp004…), supplier code, any ingredient name or code (e.g. "Yoghurt", "whipping cream", "Lemon", 030014).
// Same loopback admin-token mechanism as create-account.js; changes apply to new drops immediately.
'use strict';
const fs = require('fs'), http = require('http'), crypto = require('crypto'), path = require('path');

const DATA_DIR = process.env.DATA_DIR || '/opt/jc-round-drop/data';
const DROP = process.env.DROP_URL || 'http://127.0.0.1:8093';
const JCR = process.env.JCR_API || 'http://127.0.0.1:8092';
const ADMIN_ROLES = ['MAIN ADMIN', 'SCM Manager', 'WH ADMIN', 'PCM ADMIN'];

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const m = process.argv[i].match(/^--([a-z-]+)$/);
  if (!m) continue;
  const next = process.argv[i + 1];
  args[m[1]] = next && !next.startsWith('--') ? (i++, next) : true;
}
const list = v => (typeof v === 'string' ? v.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean) : []);
const norm = s => String(s).toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '').replace('yoghurt', 'yogurt');

function req(method, url, body, headers) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(url, { method, headers: { ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}), ...headers } }, res => {
      let t = ''; res.on('data', c => t += c); res.on('end', () => { try { resolve({ status: res.statusCode, json: JSON.parse(t) }); } catch (_) { resolve({ status: res.statusCode, json: null }); } });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
const show = items => items.forEach(i => console.log(`  ${i.key.padEnd(6)} ${String(i.name).padEnd(28)} To: ${(i.to || []).join(', ') || '—'}${(i.cc || []).length ? '   CC: ' + i.cc.join(', ') : ''}`));

(async () => {
  const secret = fs.readFileSync(path.join(DATA_DIR, 'secret.key'), 'utf8').trim();
  const users = ((await req('GET', JCR + '/state')).json || {}).state?.users || [];
  const admin = users.find(u => u.role === 'MAIN ADMIN' && u.active !== false) || users.find(u => ADMIN_ROLES.includes(u.role) && u.active !== false);
  if (!admin) throw new Error('no active admin user found in jc-round state');
  const body = Buffer.from(JSON.stringify({ k: 'adm', uid: admin.id, name: admin.name, exp: Date.now() + 60 * 1000 })).toString('base64url');
  const auth = { Authorization: 'Bearer ' + body + '.' + crypto.createHmac('sha256', secret).update(body).digest('base64url') };

  const ov = await req('GET', DROP + '/admin/overview', null, auth);
  if (ov.status !== 200) throw new Error((ov.json && ov.json.error) || 'HTTP ' + ov.status);
  const items = ov.json.items;
  if (args.list || !args.item) { console.log('Current routing:'); show(items); if (!args.item) return; }

  const q = norm(args.item);
  const it = items.find(i => [i.key, i.name, i.supplier && i.supplier.code, ...(i.ingredients || []).flatMap(g => [g.name, g.code])].some(v => v && norm(v) === q));
  if (!it) throw new Error(`unknown item "${args.item}" — use one of: ${items.map(i => i.key).join(', ')}`);
  let to = [...(it.to || [])], cc = [...(it.cc || [])];
  const has = (arr, e) => arr.some(x => x.toLowerCase() === e.toLowerCase());
  if (args.to) to = list(args.to);
  if (args.cc !== undefined && args.cc !== true) cc = list(args.cc);
  list(args['add-to']).forEach(e => { if (!has(to, e)) to.push(e); });
  list(args['add-cc']).forEach(e => { if (!has(cc, e)) cc.push(e); });
  list(args.remove).forEach(e => { to = to.filter(x => x.toLowerCase() !== e.toLowerCase()); cc = cc.filter(x => x.toLowerCase() !== e.toLowerCase()); });

  const r = await req('POST', DROP + '/admin/items', { items: [{ key: it.key, to, cc }] }, auth);
  if (r.status !== 200) throw new Error((r.json && r.json.error) || 'HTTP ' + r.status);
  console.log(`Updated ${it.label}:`); show(r.json.items.filter(i => i.key === it.key));
})().catch(e => { console.error('error: ' + e.message); process.exit(1); });
