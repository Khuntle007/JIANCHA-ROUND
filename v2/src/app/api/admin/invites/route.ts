import { prisma } from '@/lib/db';
import { route, body, json, ApiError, str } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { sendInvite, assertMayManageRole } from '@/lib/admin';
import { emailOk } from '@/lib/drop-catalog';
import { audit } from '@/lib/audit';

export const POST = route(async (req: Request) => {
  const me = await requireUser('manageUsers');
  const b = await body<{ email?: string; name?: string; roleId?: number }>(req);
  const email = str(b.email, 200).toLowerCase(), name = str(b.name, 80);
  if (!emailOk(email)) throw new ApiError(400, 'อีเมลไม่ถูกต้อง');
  const role = await prisma.role.findUnique({ where: { id: Number(b.roleId) } });
  if (!role) throw new ApiError(400, 'เลือกบทบาท');
  assertMayManageRole(me, role.key);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing?.passwordHash && existing.status === 'active') throw new ApiError(409, 'อีเมลนี้มีบัญชีที่ใช้งานอยู่แล้ว');
  const r = await sendInvite({ email, name, roleId: role.id, actor: me });
  await audit('invite.sent', { actor: me, target: email, meta: { role: role.key } });
  // the raw link is returned only in dry-run mode so local testing works without email
  return json({ ok: true, id: r.id, devLink: r.dryRun ? r.link : undefined });
});
