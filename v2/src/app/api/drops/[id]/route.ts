import fs from 'fs';
import { prisma } from '@/lib/db';
import { route, json, ApiError } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { dropFile } from '@/lib/drop';
import { audit } from '@/lib/audit';

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const me = await requireUser('orderDrop');
  if (me.role.key !== 'MAIN_ADMIN') throw new ApiError(403, 'เฉพาะ MAIN ADMIN เท่านั้นที่ลบใบสั่งได้');
  const d = await prisma.drop.delete({ where: { id: (await params).id } });
  fs.rmSync(dropFile(d.id), { force: true });
  await audit('drop.deleted', { actor: me, target: d.ref });
  return json({ ok: true });
});
