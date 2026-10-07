import { prisma } from '@/lib/db';
import { route, body, json, ApiError } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { orderFields } from '@/lib/validate';
import { audit } from '@/lib/audit';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const me = await requireUser('editOrders');
  const id = (await params).id;
  const cur = await prisma.order.findUnique({ where: { id } });
  if (!cur) throw new ApiError(404, 'ไม่พบออเดอร์');
  const f = orderFields(await body(req), true);
  const order = await prisma.order.update({ where: { id }, data: f });
  await audit('order.updated', { actor: me, target: `${cur.branchCode} ${cur.docNo}`, meta: f });
  return json({ ok: true, order });
});

export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const me = await requireUser('editOrders');
  const o = await prisma.order.delete({ where: { id: (await params).id } });
  await audit('order.deleted', { actor: me, target: `${o.branchCode} ${o.docNo}` });
  return json({ ok: true });
});
