import { prisma } from '@/lib/db';
import { route, body, json, ApiError, str } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { deliverDrop, parseRoute } from '@/lib/drop';
import { audit } from '@/lib/audit';

type Ctx = { params: Promise<{ id: string }> };

/** SCM picks one supplier for a product code that has several; the drop is then emailed. */
export const POST = route(async (req: Request, { params }: Ctx) => {
  const me = await requireUser('orderDrop');
  const id = (await params).id;
  const supplierId = str((await body(req)).supplierId, 40);
  const d = await prisma.drop.findUnique({ where: { id } });
  const r = d && parseRoute(d.route);
  if (!d || !r || r.kind !== 'pending' || d.emailStatus !== 'pending') throw new ApiError(400, 'รายการนี้ไม่ได้รอเลือก supplier');
  if (!r.options.some(o => o.id === supplierId)) throw new ApiError(400, 'supplier ไม่อยู่ในตัวเลือก');
  const s = await prisma.supplier.findUnique({ where: { id: supplierId } }); // current emails (may have been edited while waiting)
  if (!s) throw new ApiError(400, 'ไม่พบ supplier');
  const route2 = { kind: 'supplier', supplierId: s.id, supplierName: s.name, to: JSON.parse(s.to), cc: JSON.parse(s.cc), chosenBy: me.name, chosenAt: new Date().toISOString() };
  await prisma.drop.update({ where: { id }, data: { route: JSON.stringify(route2), emailStatus: 'queued', emailAttempts: 0 } });
  await deliverDrop(id);
  const after = await prisma.drop.findUniqueOrThrow({ where: { id } });
  await audit('drop.supplier_chosen', { actor: me, target: d.ref, meta: { supplier: s.name, code: r.code } });
  return json({ ok: true, emailStatus: after.emailStatus, emailError: after.emailError });
});
