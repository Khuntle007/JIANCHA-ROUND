import { prisma } from '@/lib/db';
import { route, body, json, ApiError } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { checkSupplier } from '@/lib/suppliers';
import { audit } from '@/lib/audit';

export const GET = route(async () => {
  await requireUser('orderDrop');
  const rows = await prisma.supplier.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { products: true } } } });
  return json({ suppliers: rows.map(s => ({ id: s.id, name: s.name, to: JSON.parse(s.to), cc: JSON.parse(s.cc), products: s._count.products })) });
});

export const POST = route(async (req: Request) => {
  const me = await requireUser('orderDrop');
  const s = checkSupplier(await body(req));
  if (await prisma.supplier.findUnique({ where: { nameKey: s.nameKey } })) throw new ApiError(409, 'มี supplier ชื่อนี้แล้ว');
  const row = await prisma.supplier.create({ data: { name: s.name, nameKey: s.nameKey, to: JSON.stringify(s.to), cc: JSON.stringify(s.cc) } });
  await audit('supplier.created', { actor: me, target: s.name });
  return json({ ok: true, supplier: { id: row.id, name: row.name, to: s.to, cc: s.cc, products: 0 } });
});
