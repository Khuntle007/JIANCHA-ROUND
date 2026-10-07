import { prisma } from '@/lib/db';
import { route, json, str } from '@/lib/http';
import { requireUser } from '@/lib/auth';

/** No q: products that have suppliers or appeared in a PO. With q: search the whole catalogue (incl. BC). */
export const GET = route(async (req: Request) => {
  await requireUser('orderDrop');
  const q = str(new URL(req.url).searchParams.get('q'), 80);
  const where = q ? { OR: [{ code: { contains: q } }, { name: { contains: q } }] } : { OR: [{ seen: true }, { suppliers: { some: {} } }] };
  const [rows, total, all] = await Promise.all([
    prisma.product.findMany({ where, orderBy: { code: 'asc' }, take: 100, include: { suppliers: { include: { supplier: true } } } }),
    prisma.product.count({ where }), prisma.product.count(),
  ]);
  return json({ total, all, products: rows.map(p => ({ code: p.code, name: p.name, source: p.source, seen: p.seen, bc: p.bc, blocked: p.blocked, suppliers: p.suppliers.map(x => ({ id: x.supplier.id, name: x.supplier.name })) })) });
});
