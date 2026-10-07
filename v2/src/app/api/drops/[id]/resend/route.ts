import { prisma } from '@/lib/db';
import { route, json, ApiError } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { deliverDrop } from '@/lib/drop';
import { audit } from '@/lib/audit';

type Ctx = { params: Promise<{ id: string }> };

export const POST = route(async (_req: Request, { params }: Ctx) => {
  const me = await requireUser('orderDrop');
  const id = (await params).id;
  const d0 = await prisma.drop.findUnique({ where: { id } });
  if (!d0) throw new ApiError(404, 'not found');
  if (d0.emailStatus === 'pending') throw new ApiError(400, 'รายการนี้รอเลือก supplier ก่อน');
  await deliverDrop(id);
  const d = await prisma.drop.findUniqueOrThrow({ where: { id } });
  await audit('drop.resent', { actor: me, target: d.ref, meta: { status: d.emailStatus } });
  return json({ ok: true, emailStatus: d.emailStatus, emailError: d.emailError });
});
