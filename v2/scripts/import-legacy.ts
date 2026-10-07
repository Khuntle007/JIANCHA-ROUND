// Import v1 data into v2.  Users are NOT imported (fresh start, invite-only).
//   npm run import:legacy -- --state /opt/jc-round-api/data/state.json --drop /opt/jc-round-drop/data [--replace]
// --replace wipes v2 branches/rounds/orders/holidays/specials/drops first (users, roles, links untouched).
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/lib/db';
import { env } from '../src/lib/env';
import { cleanSlots } from '../src/lib/domain';
import { isISODate } from '../src/lib/dates';
import { LEGACY_ITEM, CATALOG } from '../src/lib/drop-catalog';
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

  if (dropDir) {
    const db = JSON.parse(fs.readFileSync(path.join(dropDir, 'db.json'), 'utf8'));
    const filesOut = path.join(env.dataDir, 'files'); fs.mkdirSync(filesOut, { recursive: true });
    let n = 0, missing = 0;
    for (const d of db.drops || []) {
      const item = LEGACY_ITEM[d.item] || d.item;
      const src = path.join(dropDir, 'files', d.id + '.pdf');
      const row = await prisma.drop.create({ data: {
        ref: d.ref, sourceName: s(d.accountName || d.username, 120), branchCode: s(d.branchCode, 12), branchName: s(d.branchName, 200), issuerName: s(d.issuerName, 120),
        item, itemLegacy: LEGACY_ITEM[d.item] ? d.item : null, fileName: s(d.fileName, 150), size: Number(d.size) || 0, sha256: s(d.sha256, 64),
        emailStatus: d.email?.status || 'sent', emailTo: JSON.stringify(d.email?.to || []), emailCc: JSON.stringify(d.email?.cc || []), emailAttempts: d.email?.attempts || 0,
        emailSentAt: d.email?.sentAt ? new Date(d.email.sentAt) : null, emailError: s(d.email?.error, 400), createdAt: new Date(d.createdAt),
      } });
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(filesOut, row.id + '.pdf')); else missing++;
      n++;
    }
    for (const it of db.items || []) {
      const key = CATALOG.find(c => c.key === it.key) ? it.key : null;
      if (key && Array.isArray(it.to) && it.to.length) await prisma.itemRoute.upsert({ where: { key }, create: { key, to: JSON.stringify(it.to), cc: JSON.stringify(it.cc || []) }, update: { to: JSON.stringify(it.to), cc: JSON.stringify(it.cc || []) } });
    }
    const seq = Number(db.seq) || 0;
    await prisma.counter.upsert({ where: { key: 'drop' }, create: { key: 'drop', value: seq }, update: { value: seq } });
    console.log(`order-drop: ${n} drops (${missing} files missing) · recipients ${(db.items || []).length} · ref counter ${seq} · franchise accounts NOT migrated (use links)`);
  }
}

main().then(() => prisma.$disconnect()).catch(e => { console.error(e); process.exit(1); });
