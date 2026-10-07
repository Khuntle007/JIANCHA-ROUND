import { prisma } from '@/lib/db';
import { route, body, json, ApiError, str } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { randomToken } from '@/lib/crypto';
import { audit } from '@/lib/audit';

export const POST = route(async (req: Request) => {
  const me = await requireUser('orderDrop');
  const b = await body<{ name?: string; branches?: string[] }>(req);
  const name = str(b.name, 120);
  if (!name) throw new ApiError(400, 'กรอกชื่อลิงก์ / ร้าน');
  const branches = Array.isArray(b.branches) ? b.branches.map(c => str(c, 12)).filter(Boolean) : [];
  const link = await prisma.dropLink.create({ data: { token: randomToken(18), name, branches: JSON.stringify(branches), createdById: me.id, createdBy: me.name } });
  await audit('droplink.created', { actor: me, target: name });
  return json({ ok: true, link });
});
