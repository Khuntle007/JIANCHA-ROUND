import { prisma } from '@/lib/db';
import { route, body, json, ApiError, str } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { parsePerms } from '@/lib/perms';
import { audit } from '@/lib/audit';

/** Create a custom role (MAIN ADMIN only). */
export const POST = route(async (req: Request) => {
  const me = await requireUser('manageUsers');
  if (me.role.key !== 'MAIN_ADMIN') throw new ApiError(403, 'เฉพาะ MAIN ADMIN');
  const b = await body<{ name?: string; perms?: Record<string, boolean> }>(req);
  const name = str(b.name, 60);
  if (!name) throw new ApiError(400, 'กรอกชื่อบทบาท');
  const role = await prisma.role.create({ data: { key: 'custom-' + Date.now().toString(36), name, perms: JSON.stringify(parsePerms(JSON.stringify(b.perms || {}))) } });
  await audit('role.created', { actor: me, target: name });
  return json({ ok: true, role });
});
