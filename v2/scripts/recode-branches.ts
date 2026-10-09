// Re-code branches from a CSV (from,to,type,note) — chain-safe, idempotent (already-moved rows are skipped).
//   npx tsx scripts/recode-branches.ts scripts/data/company-recode.csv
import fs from 'fs';
import { prisma } from '../src/lib/db';
import { recodeMany } from '../src/lib/franchise';
import { randomToken } from '../src/lib/crypto';

(async () => {
  const file = process.argv[2] || 'scripts/data/company-recode.csv';
  const rows = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).slice(1).map(l => { const [from, to, type] = l.split(','); return { from: from.trim(), to: to.trim(), type: (type || '').trim() }; });
  const log = await recodeMany(rows.map(r => ({ from: r.from, to: r.to, patch: r.type ? { type: r.type === 'none' ? '' : r.type } : {} }))); // type 'none' = company store (no MT/FC tag)
  log.forEach(l => console.log('recoded ' + l));
  // a moved store's Order Drop link keeps its token; only the display name follows the new code
  for (const r of rows) {
    const l = await prisma.dropLink.findUnique({ where: { branchCode: r.to } });
    if (l && l.name.startsWith(r.from + ' ')) await prisma.dropLink.update({ where: { id: l.id }, data: { name: r.to + l.name.slice(r.from.length) } });
  }
  // a re-coded franchise store gets its Order Drop link like the others
  for (const r of rows.filter(r => r.to.startsWith('JF')))
    if (!(await prisma.dropLink.findUnique({ where: { branchCode: r.to } }))) {
      const b = await prisma.branch.findUnique({ where: { code: r.to } });
      if (!b) continue; // moved on again later in the file (e.g. JC054→JF053→JC014)
      await prisma.dropLink.create({ data: { token: randomToken(18), name: `${r.to} ${b.nameEn}`, branchCode: r.to, createdBy: 'recode' } });
      console.log('link ' + r.to);
    }
  console.log(`done · ${log.length} moved · branches ${await prisma.branch.count()}`);
  await prisma.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
