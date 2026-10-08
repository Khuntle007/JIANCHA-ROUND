import { prisma } from '@/lib/db';
import { route, body, json, ApiError, str } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { randomToken } from '@/lib/crypto';
import { audit } from '@/lib/audit';

export const POST = route(async (req: Request) => {
  const me = await requireUser('orderDrop');
  const b = await body<{ name?: string; branchCode?: string }>(req);
  const name = str(b.name, 120), branchCode = str(b.branchCode, 12) || null;
  if (!name) throw new ApiError(400, 'กรอกชื่อลิงก์ / ร้าน');
  if (branchCode) {
    if (!(await prisma.branch.findUnique({ where: { code: branchCode } }))) throw new ApiError(400, 'ไม่พบสาขา ' + branchCode);
    if (await prisma.dropLink.findUnique({ where: { branchCode } })) throw new ApiError(409, 'สาขานี้มีลิงก์แล้ว — ใช้ “เปลี่ยนลิงก์” แทน');
  }
  const link = await prisma.dropLink.create({ data: { token: randomToken(18), name, branchCode, createdById: me.id, createdBy: me.name } });
  await audit('droplink.created', { actor: me, target: name });
  return json({ ok: true, link });
});
