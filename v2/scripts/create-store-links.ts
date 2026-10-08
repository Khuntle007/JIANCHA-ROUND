// Give every active store with a code prefix its own Order Drop link (idempotent; existing links untouched).
//   npx tsx scripts/create-store-links.ts JC [--links-out file.csv]
import fs from 'fs';
import { prisma } from '../src/lib/db';
import { env } from '../src/lib/env';
import { randomToken } from '../src/lib/crypto';

(async () => {
  const prefix = process.argv[2];
  if (!prefix || !/^[A-Z]{1,4}$/.test(prefix)) throw new Error('usage: create-store-links.ts <PREFIX e.g. JC> [--links-out file.csv]');
  const out = process.argv.includes('--links-out') ? process.argv[process.argv.indexOf('--links-out') + 1] : '';
  const branches = await prisma.branch.findMany({ where: { code: { startsWith: prefix }, active: true }, orderBy: { code: 'asc' } });
  let created = 0;
  for (const b of branches) {
    if (await prisma.dropLink.findUnique({ where: { branchCode: b.code } })) continue;
    await prisma.dropLink.create({ data: { token: randomToken(18), name: `${b.code} ${b.nameEn}`, branchCode: b.code, createdBy: 'store-links' } });
    created++; console.log('link ' + b.code + ' ' + b.nameEn);
  }
  const links = await prisma.dropLink.findMany({ where: { branchCode: { in: branches.map(b => b.code) } } });
  console.log(`${prefix}: ${branches.length} stores · ${created} links created · ${links.length} total`);
  if (out) {
    const q = (v: unknown) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const rows = branches.map((b, i) => [i + 1, b.code, b.nameEn, `${env.appUrl}/d/${links.find(l => l.branchCode === b.code)?.token}`].map(q).join(','));
    fs.writeFileSync(out, '﻿' + [['ลำดับ', 'รหัสสาขา', 'ชื่อสาขา', 'ลิงก์ส่งใบ PO'].map(q).join(','), ...rows].join('\r\n'), { mode: 0o600 });
    console.log('links written to ' + out + ' (secret)');
  }
  if (created) await prisma.auditLog.create({ data: { action: 'droplinks.created', actorName: 'store-links', meta: JSON.stringify({ prefix, created }) } });
  await prisma.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
