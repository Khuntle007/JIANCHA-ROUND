// Apply the official JF franchise branch list and give every store its own Order Drop link (idempotent).
//   npx tsx scripts/apply-franchise.ts [scripts/data/franchise-branches.csv] [--links-out links.csv]
import fs from 'fs';
import { prisma } from '../src/lib/db';
import { env } from '../src/lib/env';
import { readFranchiseCsv, applyFranchise } from '../src/lib/franchise';

const args = process.argv.slice(2);
const file = args.find(a => a.endsWith('.csv') && args[args.indexOf(a) - 1] !== '--links-out') || 'scripts/data/franchise-branches.csv';
const out = args.includes('--links-out') ? args[args.indexOf('--links-out') + 1] : '';

(async () => {
  const rows = readFranchiseCsv(file);
  const log = await applyFranchise(rows);
  log.forEach(l => console.log(l));
  const links = await prisma.dropLink.findMany({ where: { branchCode: { in: rows.map(r => r.code) } } });
  const byCode = new Map(links.map(l => [l.branchCode, l]));
  console.log(`branches ${rows.length} · links ${links.length} · recoded ${log.filter(l => l.startsWith('recoded')).length} · created ${log.filter(l => l.startsWith('created')).length}`);
  if (out) {
    const q = (v: unknown) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const lines = [['ลำดับ', 'รหัสสาขา', 'ชื่อสาขา', 'ลิงก์ส่งใบ PO'].map(q).join(','),
      ...rows.map(r => [r.seq, r.code, r.name, `${env.appUrl}/d/${byCode.get(r.code)?.token}`].map(q).join(','))];
    fs.writeFileSync(out, '﻿' + lines.join('\r\n'), { mode: 0o600 });
    console.log('links written to ' + out + ' (secret — share each link only with its store)');
  }
  await prisma.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
