import { prisma } from '@/lib/db';
import { route, body, json, ApiError, str } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { randomToken } from '@/lib/crypto';
import { audit } from '@/lib/audit';

export const POST = route(async (req: Request) => {
  const me = await requireUser('orderDrop');
  const name = str((await body(req)).name, 120);
  if (!name) throw new ApiError(400, 'กรอกชื่อลิงก์ / ร้าน');
  const link = await prisma.dropLink.create({ data: { token: randomToken(18), name, createdById: me.id, createdBy: me.name } });
  await audit('droplink.created', { actor: me, target: name });
  return json({ ok: true, link });
});
