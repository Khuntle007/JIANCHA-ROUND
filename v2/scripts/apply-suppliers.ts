// Load suppliers + product-code links (optionally per branch) from a JSON file kept OUTSIDE the repo (emails are private).
//   npx tsx scripts/apply-suppliers.ts /opt/jc-round-web/data/import/suppliers.json
// JSON: { suppliers: [{ name, to: [], cc?: [] }], links: [{ codes: ["030013"], supplier: "<name>", branches?: ["JF023"] }] }
// Products listed in `links` get their supplier list REPLACED; other products are untouched. Idempotent.
import fs from 'fs';
import { prisma } from '../src/lib/db';
import { checkSupplier } from '../src/lib/suppliers';
import { normName } from '../src/lib/drop-catalog';

type In = { suppliers: { name: string; to: string[]; cc?: string[] }[]; links: { codes: string[]; supplier: string; branches?: string[] }[]; names?: Record<string, string> };

(async () => {
  const file = process.argv[2];
  if (!file) throw new Error('usage: apply-suppliers.ts <file.json>');
  const d = JSON.parse(fs.readFileSync(file, 'utf8')) as In;
  const ids = new Map<string, string>();
  for (const s0 of d.suppliers) {
    const s = checkSupplier({ ...s0, to: s0.to.map(e => e.replace(/[​-⁯\s]/g, '')), cc: (s0.cc || []).map(e => e.replace(/[​-⁯\s]/g, '')) });
    const row = await prisma.supplier.upsert({ where: { nameKey: s.nameKey }, create: { name: s.name, nameKey: s.nameKey, to: JSON.stringify(s.to), cc: JSON.stringify(s.cc) }, update: { name: s.name, to: JSON.stringify(s.to), cc: JSON.stringify(s.cc) } });
    ids.set(normName(s.name), row.id);
    console.log(`supplier ${s.name} → ${s.to.join(', ')}${s.cc.length ? ' cc ' + s.cc.join(', ') : ''}`);
  }
  const byCode = new Map<string, { supplierId: string; branches: string[] }[]>();
  for (const l of d.links) {
    const sid = ids.get(normName(l.supplier)) || (await prisma.supplier.findUnique({ where: { nameKey: normName(l.supplier) } }))?.id;
    if (!sid) throw new Error('unknown supplier in links: ' + l.supplier);
    const branches = l.branches || [];
    for (const c of branches) if (!(await prisma.branch.findUnique({ where: { code: c } }))) throw new Error('unknown branch ' + c + ' (run apply-franchise first)');
    for (const code of l.codes) byCode.set(code, [...(byCode.get(code) || []), { supplierId: sid, branches }]);
  }
  for (const [code, links] of byCode) {
    await prisma.$transaction([
      prisma.product.upsert({ where: { code }, create: { code, source: 'manual' }, update: {} }),
      prisma.productSupplier.deleteMany({ where: { productCode: code } }),
      prisma.productSupplier.createMany({ data: links.map(l => ({ productCode: code, supplierId: l.supplierId, branches: JSON.stringify(l.branches) })) }),
    ]);
    console.log(`product ${code}: ` + links.map(l => `${[...ids].find(([, v]) => v === l.supplierId)?.[0] || l.supplierId}${l.branches.length ? ' [' + l.branches.join(',') + ']' : ' [default]'}`).join(' · '));
  }
  for (const [code, name] of Object.entries(d.names || {})) // product names fill in only where still empty
    await prisma.product.upsert({ where: { code }, create: { code, name, source: 'manual' }, update: {} }).then(p => (p.name ? null : prisma.product.update({ where: { code }, data: { name } })));
  await prisma.auditLog.create({ data: { action: 'suppliers.imported', actorName: 'apply-suppliers', meta: JSON.stringify({ suppliers: d.suppliers.length, products: byCode.size }) } });
  await prisma.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
