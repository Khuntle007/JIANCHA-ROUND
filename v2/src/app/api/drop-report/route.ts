import { prisma } from '@/lib/db';
import { route, json, str } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { itemTypes, parsePoJson, parseRoute } from '@/lib/drop';
import { isISODate } from '@/lib/dates';

const bkkDay = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });

/** One row per PO line, back office only. Filters: from/to (submitted day, BKK), branch[], item[], link[], q. */
export const GET = route(async (req: Request) => {
  await requireUser('orderDrop');
  const p = new URL(req.url).searchParams;
  const from = str(p.get('from'), 10), to = str(p.get('to'), 10), q = str(p.get('q'), 80).toLowerCase();
  const many = (k: string) => p.getAll(k).map(v => str(v, 120)).filter(Boolean).slice(0, 200);
  const branch = many('branch'), item = many('item'), link = many('link');
  const where: Record<string, unknown> = {};
  if (isISODate(from) || isISODate(to)) where.createdAt = { ...(isISODate(from) ? { gte: new Date(from + 'T00:00:00+07:00') } : {}), ...(isISODate(to) ? { lt: new Date(new Date(to + 'T00:00:00+07:00').getTime() + 864e5) } : {}) };
  if (branch.length) where.branchName = { in: branch };
  if (item.length) where.item = { in: item };
  if (link.length) where.sourceName = { in: link };
  const [drops, items, allBranches, allSources] = await Promise.all([
    prisma.drop.findMany({ where, orderBy: { createdAt: 'desc' }, take: 5000 }), itemTypes(),
    prisma.drop.findMany({ distinct: ['branchName'], select: { branchName: true }, orderBy: { branchName: 'asc' } }),
    prisma.drop.findMany({ distinct: ['sourceName'], select: { sourceName: true }, orderBy: { sourceName: 'asc' } }),
  ]);
  const lab = (k: string) => items.find(i => i.key === k)?.label || k;
  const rows = [];
  for (const d of drops) {
    const po = parsePoJson(d.po), r = parseRoute(d.route);
    for (const l of po?.lines?.length ? po.lines : [null]) {
      const row = {
        dropId: d.id, createdAt: d.createdAt.toISOString(), day: bkkDay(d.createdAt), ref: d.ref, poNumber: po?.number || '', branch: d.branchName,
        itemKey: d.item, itemLabel: lab(d.item), issuedDate: po?.issuedDate || '', issuer: d.issuerName, source: d.sourceName, emailStatus: d.emailStatus,
        supplier: r?.kind === 'supplier' ? r.supplierName : '', pending: d.emailStatus === 'pending', hasDetail: !!l,
        no: l?.no ?? '', product: l?.name || '', qty: l?.qty ?? null, unit: l?.unit || '', vat: l?.vat || '', price: l?.price ?? null, total: l?.total ?? null,
      };
      if (q && ![row.poNumber, row.ref, row.product, row.branch].some(x => String(x).toLowerCase().includes(q))) continue;
      rows.push(row);
    }
  }
  return json({
    rows: rows.slice(0, 5000), truncated: rows.length > 5000,
    branches: allBranches.map(b => b.branchName).filter(Boolean), sources: allSources.map(s => s.sourceName).filter(Boolean),
    items: items.map(i => ({ key: i.key, label: i.label })),
  });
});
