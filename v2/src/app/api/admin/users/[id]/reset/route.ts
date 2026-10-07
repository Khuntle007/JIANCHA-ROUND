import { prisma } from '@/lib/db';
import { route, json, ApiError } from '@/lib/http';
import { requireUser, revokeAllSessions } from '@/lib/auth';
import { randomToken, hashToken } from '@/lib/crypto';
import { sendMail, layout, button, escHtml } from '@/lib/mail';
import { assertMayManageRole } from '@/lib/admin';
import { env } from '@/lib/env';
import { audit } from '@/lib/audit';

type Ctx = { params: Promise<{ id: string }> };

/** Admin-triggered reset: signs the user out everywhere and emails them a reset link (admin never sees a password). */
export const POST = route(async (_req: Request, { params }: Ctx) => {
  const me = await requireUser('manageUsers');
  const u = await prisma.user.findUnique({ where: { id: (await params).id }, include: { role: true } });
  if (!u) throw new ApiError(404, 'not found');
  assertMayManageRole(me, u.role.key);
  const token = randomToken();
  await prisma.authToken.updateMany({ where: { userId: u.id, kind: 'reset', usedAt: null }, data: { revokedAt: new Date() } });
  await prisma.authToken.create({ data: { kind: 'reset', tokenHash: hashToken(token), email: u.email, userId: u.id, createdById: me.id, expiresAt: new Date(Date.now() + 24 * 3600_000) } });
  await prisma.user.update({ where: { id: u.id }, data: { failedLogins: 0, lockedUntil: null } });
  await revokeAllSessions(u.id);
  const link = `${env.appUrl}/reset?token=${token}`;
  const r = await sendMail({
    to: [u.email], subject: 'JC-ROUND · ตั้งรหัสผ่านใหม่ / Reset your password',
    html: layout('RESET PASSWORD', `<p>สวัสดี ${escHtml(u.name)},</p><p>ผู้ดูแลระบบได้รีเซ็ตรหัสผ่านของคุณ กดปุ่มเพื่อตั้งรหัสใหม่ (ลิงก์ใช้ได้ 24 ชั่วโมง)</p>${button(link, 'ตั้งรหัสผ่านใหม่')}`),
  });
  await audit('user.reset_password', { actor: me, target: u.email });
  return json({ ok: true, devLink: r.dryRun ? link : undefined });
});
