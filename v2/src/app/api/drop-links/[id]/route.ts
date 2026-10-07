import { prisma } from '@/lib/db';
import { route, body, json, ApiError, str } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { randomToken } from '@/lib/crypto';
import { audit } from '@/lib/audit';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const me = await requireUser('orderDrop');
  const id = (await params).id;
  const cur = await prisma.dropLink.findUnique({ where: { id } });
  if (!cur) throw new ApiError(404, 'not found');
  const b = await body<{ name?: string; active?: boolean; rotate?: boolean }>(req);
  const data: Record<string, unknown> = {};
  if (b.name !== undefined) data.name = str(b.name, 120) || cur.name;
  if (typeof b.active === 'boolean') data.active = b.active;
  if (b.rotate) data.token = randomToken(18); // old URL stops working immediately
  const link = await prisma.dropLink.update({ where: { id }, data });
  await audit(b.rotate ? 'droplink.rotated' : 'droplink.updated', { actor: me, target: link.name, meta: { ...data, token: undefined } });
  return json({ ok: true, link });
});

export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const me = await requireUser('orderDrop');
  const l = await prisma.dropLink.delete({ where: { id: (await params).id } }); // drops keep sourceName
  await audit('droplink.deleted', { actor: me, target: l.name });
  return json({ ok: true });
});
