import { prisma } from '@/lib/db';
import { route, body, json, ApiError, str } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { orderFields } from '@/lib/validate';
import { audit } from '@/lib/audit';

export const POST = route(async (req: Request) => {
  const me = await requireUser('editOrders');
  const b = await body(req);
  const branchCode = str(b.branchCode, 12);
  if (!(await prisma.branch.findUnique({ where: { code: branchCode } }))) throw new ApiError(404, 'ไม่พบสาขา');
  const f = orderFields(b);
  const order = await prisma.order.create({ data: { branchCode, createdById: me.id, ...(f as { orderDate: string; docType: string; category: string }), ...f } });
  await audit('order.created', { actor: me, target: `${branchCode} ${order.docNo}` });
  return json({ ok: true, order });
});
