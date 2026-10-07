import { prisma } from '@/lib/db';
import { route, body, json, ApiError } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { checkSupplier } from '@/lib/suppliers';
import { audit } from '@/lib/audit';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const me = await requireUser('orderDrop');
  const id = (await params).id;
  if (!(await prisma.supplier.findUnique({ where: { id } }))) throw new ApiError(404, 'not found');
  const s = checkSupplier(await body(req));
  const clash = await prisma.supplier.findUnique({ where: { nameKey: s.nameKey } });
  if (clash && clash.id !== id) throw new ApiError(409, 'มี supplier ชื่อนี้แล้ว');
  await prisma.supplier.update({ where: { id }, data: { name: s.name, nameKey: s.nameKey, to: JSON.stringify(s.to), cc: JSON.stringify(s.cc) } });
  await audit('supplier.updated', { actor: me, target: s.name, meta: { to: s.to, cc: s.cc } });
  return json({ ok: true });
});

/** Removes the supplier from every product code that used it. */
export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const me = await requireUser('orderDrop');
  const s = await prisma.supplier.delete({ where: { id: (await params).id } });
  await audit('supplier.deleted', { actor: me, target: s.name });
  return json({ ok: true });
});
