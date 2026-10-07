// Import v1 data into v2.  Users are NOT imported (fresh start, invite-only).
//   npm run import:legacy -- --state /opt/jc-round-api/data/state.json --drop /opt/jc-round-drop/data [--replace]
// --replace wipes v2 branches/rounds/orders/holidays/specials/drops first (users, roles, links untouched).
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/lib/db';
import { env } from '../src/lib/env';
import { cleanSlots } from '../src/lib/domain';
import { isISODate } from '../src/lib/dates';
import { DEFAULT_ITEMS, OTHER_KEY, normName } from '../src/lib/drop-catalog';
import { saveDropSettings, saveBcStatus } from '../src/lib/settings';
import { ensureRoles } from './seed-admin';

const arg = (k: string) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : undefined; };
const s = (v: unknown, n = 300) => String(v ?? '').slice(0, n);
type V1 = { branches?: any[]; orders?: any[]; holidays?: any[]; specials?: any[] };

async function main() {
  const statePath = arg('state'), dropDir = arg('drop'), replace = process.argv.includes('--replace');
  if (!statePath) throw new Error('--state <state.json> required');
  const raw = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const st: V1 = raw.state || raw; // accepts the file or a GET /api/state response
  await ensureRoles();
  if (await prisma.branch.count()) {
    if (!replace) throw new Error('v2 already has branches — re-run with --replace to overwrite domain data');
    await prisma.$transaction([prisma.special.deleteMany(), prisma.holiday.deleteMany(), prisma.order.deleteMany(), prisma.round.deleteMany(), prisma.shareLink.deleteMany(), prisma.branch.deleteMany(), prisma.drop.deleteMany()]);
  }
  const branches = st.branches || [];
  let rounds = 0, orders = 0, skipped = 0;
  for (const b of branches) {
    await prisma.branch.create({ data: {
      code: s(b.code, 12), nameEn: s(b.nameEn, 200) || s(b.code), nameTh: s(b.nameTh, 200), address: s(b.address, 400), phone: s(b.phone, 200), am: s(b.am, 200),
      company: s(b.company, 200) || 'บริษัท เจี้ยนชา จำกัด', type: ['MT', 'FC'].includes(b.type) ? b.type : '', openDate: isISODate(b.openDate) ? b.openDate : '',
      mallCondition: s(b.mallCondition, 200), mapUrl: /^https?:\/\//.test(b.mapUrl || '') ? s(b.mapUrl, 300) : '', active: b.active !== false,
    } });
    const rs = (b.rounds || []).filter((r: any) => r && r.product);
    if (rs.length) await prisma.round.createMany({ data: rs.map((r: any, i: number) => ({
      branchCode: b.code, category: r.category === 'dry' ? 'dry' : 'fresh', warehouse: s(r.warehouse, 10), freshType: s(r.freshType, 40), product: s(r.product, 120), slots: JSON.stringify(cleanSlots(r.slots)), sort: i,
    })) });
    rounds += rs.length;
  }
  const codes = new Set(branches.map(b => b.code));
  for (const o of st.orders || []) {
    if (!codes.has(o.branch) || !isISODate(o.orderDate)) { skipped++; continue; }
    await prisma.order.create({ data: {
      branchCode: o.branch, orderDate: o.orderDate, docType: o.docType === 'TR' ? 'TR' : 'PO', docNo: s(o.docNo, 120), category: o.category === 'fresh' ? 'fresh' : 'dry',
      warehouse: s(o.warehouse, 10), freshType: s(o.freshType, 40), product: s(o.product, 120), deliveryDate: isISODate(o.deliveryDate) ? o.deliveryDate : '',
      status: ['complete', 'cut', 'hold'].includes(o.status) ? o.status : 'hold', note: s(o.note, 500),
    } });
    orders++;
  }
  for (const h of st.holidays || []) if (isISODate(h.date)) await prisma.holiday.upsert({ where: { date: h.date }, create: { date: h.date, name: s(h.name, 120) || 'วันหยุด' }, update: {} });
  for (const x of st.specials || []) if (isISODate(x.date) && codes.has(x.branch) && x.line)
    await prisma.special.upsert({ where: { date_branchCode_line: { date: x.date, branchCode: x.branch, line: s(x.line, 40) } }, create: { date: x.date, branchCode: x.branch, line: s(x.line, 40), newDate: isISODate(x.newDate) ? x.newDate : '', note: s(x.note, 300) }, update: {} });
  console.log(`branches ${branches.length} · rounds ${rounds} · orders ${orders} (skipped ${skipped}) · holidays ${(st.holidays || []).length} · specials ${(st.specials || []).length}`);

  if (dropDir) await importDrops(dropDir, replace);
}

/** Live drop-service db.json (itjianchacenter-ai format): items, suppliers, products, settings, drops (+PO data). Accounts → not migrated (links). */
async function importDrops(dropDir: string, replace: boolean) {
  const db = JSON.parse(fs.readFileSync(path.join(dropDir, 'db.json'), 'utf8'));
  if (replace) await prisma.$transaction([prisma.productSupplier.deleteMany(), prisma.product.deleteMany(), prisma.supplier.deleteMany(), prisma.itemType.deleteMany()]);
  // item types (live keys kept so old drops still resolve); 'other' last
  const items: any[] = (db.items && db.items.length ? db.items : DEFAULT_ITEMS).filter((i: any) => i && i.key);
  if (!items.some(i => i.key === OTHER_KEY)) items.push({ key: OTHER_KEY, label: 'Other', labelTh: 'อื่นๆ / ไม่ระบุประเภท', to: [], cc: [] });
  for (const [n, i] of items.entries())
    await prisma.itemType.upsert({ where: { key: s(i.key, 40) }, create: { key: s(i.key, 40), label: s(i.label, 60) || i.key, labelTh: s(i.labelTh, 60), to: JSON.stringify(i.to || []), cc: JSON.stringify(i.cc || []), sort: i.key === OTHER_KEY ? 9999 : n },
      update: { label: s(i.label, 60) || i.key, labelTh: s(i.labelTh, 60), to: JSON.stringify(i.to || []), cc: JSON.stringify(i.cc || []) } });
  // supplier directory (+ inline suppliers from older product format, deduped on name+emails like the live migrateSuppliers)
  const supKey = (x: any) => normName(x.name) + '|' + (x.to || []).map((e: string) => e.toLowerCase()).sort().join(',');
  const sups: any[] = [...(db.suppliers || [])];
  const idMap = new Map<string, string>();
  for (const p of db.products || []) for (const x of p.suppliers || []) if (typeof x === 'object' && x) {
    let t = sups.find(y => supKey(y) === supKey(x));
    if (!t) { t = { id: x.id || 's' + Math.random().toString(36).slice(2, 10), name: x.name, to: x.to || [], cc: x.cc || [] }; sups.push(t); }
    idMap.set(JSON.stringify(x), t.id);
  }
  const nameKeys = new Set<string>();
  for (const x of sups) {
    let key = normName(x.name) || x.id; while (nameKeys.has(key)) key += '-';
    nameKeys.add(key);
    await prisma.supplier.upsert({ where: { id: x.id }, create: { id: x.id, name: s(x.name, 80), nameKey: key, to: JSON.stringify(x.to || []), cc: JSON.stringify(x.cc || []) }, update: { name: s(x.name, 80), to: JSON.stringify(x.to || []), cc: JSON.stringify(x.cc || []) } });
  }
  let links = 0;
  for (const p of db.products || []) {
    const code = s(p.code, 40); if (!code) continue;
    await prisma.product.upsert({ where: { code }, create: { code, name: s(p.name, 200), source: ['po', 'bc', 'manual'].includes(p.source) ? p.source : 'po', seen: !!p.seen, bc: !!p.bc, blocked: !!p.blocked },
      update: { name: s(p.name, 200), seen: !!p.seen, bc: !!p.bc, blocked: !!p.blocked } });
    const ids = (p.suppliers || []).map((x: any) => (typeof x === 'string' ? x : idMap.get(JSON.stringify(x)))).filter((x: any) => sups.some(y => y.id === x));
    await prisma.productSupplier.deleteMany({ where: { productCode: code } });
    if (ids.length) { await prisma.productSupplier.createMany({ data: [...new Set<string>(ids)].map(supplierId => ({ productCode: code, supplierId })) }); links += ids.length; }
  }
  // settings — the live default 'xxx@gmail.com' is a placeholder, never import it
  const st = db.settings || {};
  await saveDropSettings({ scmEmails: (st.scmEmails || []).filter((e: string) => e && e !== 'xxx@gmail.com'), reminderHours: Number(st.reminderHours) || 0 });
  if (st.bc) await saveBcStatus(st.bc);
  // drops
  const filesOut = path.join(env.dataDir, 'files'); fs.mkdirSync(filesOut, { recursive: true });
  let n = 0, missing = 0;
  for (const d of db.drops || []) {
    if (await prisma.drop.findUnique({ where: { ref: d.ref } })) continue;
    const e = d.email || {};
    const row = await prisma.drop.create({ data: {
      ref: d.ref, sourceName: s(d.accountName || d.username, 120), branchCode: s(d.branchCode, 12), branchName: s(d.branchName, 200) || '-', issuerName: s(d.issuerName, 120),
      item: s(d.item, 40) || OTHER_KEY, fileName: s(d.fileName, 150), size: Number(d.size) || 0, sha256: s(d.sha256, 64),
      po: d.po ? JSON.stringify(d.po) : null, poNumber: s(d.po?.number, 40), route: d.route ? JSON.stringify(d.route) : null,
      emailStatus: ['queued', 'sending'].includes(e.status) ? 'failed' : e.status || 'sent', emailTo: JSON.stringify(e.to || []), emailCc: JSON.stringify(e.cc || []),
      emailAttempts: e.attempts || 0, emailSentAt: e.sentAt ? new Date(e.sentAt) : null, emailError: s(e.error, 400) || (['queued', 'sending'].includes(e.status) ? 'interrupted during migration — resend' : ''),
      notifiedAt: d.notifiedAt ? new Date(d.notifiedAt) : null, notifyError: s(d.notifyError, 300), createdAt: new Date(d.createdAt),
    } });
    const src = path.join(dropDir, 'files', d.id + '.pdf');
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(filesOut, row.id + '.pdf')); else missing++;
    n++;
  }
  const seq = Number(db.seq) || 0;
  const cur = await prisma.counter.findUnique({ where: { key: 'drop' } });
  await prisma.counter.upsert({ where: { key: 'drop' }, create: { key: 'drop', value: seq }, update: { value: Math.max(seq, cur?.value || 0) } });
  console.log(`order-drop: ${n} drops (${missing} files missing) · ${items.length} item types · ${sups.length} suppliers · ${(db.products || []).length} products (${links} supplier links) · ref counter ${seq} · ${(db.accounts || []).length} franchise accounts NOT migrated (create links)`);
}

main().then(() => prisma.$disconnect()).catch(e => { console.error(e); process.exit(1); });
