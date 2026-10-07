import { prisma } from './db';
import { env } from './env';
import { randomToken, hashToken } from './crypto';
import { sendMail, layout, button, escHtml } from './mail';
import { ApiError } from './http';
import type { CurrentUser } from './auth';

export const INVITE_TTL_MS = 7 * 24 * 3600 * 1000;

/** Granting / touching MAIN_ADMIN is reserved to MAIN_ADMIN users. */
export function assertMayManageRole(actor: CurrentUser, roleKey: string) {
  if (roleKey === 'MAIN_ADMIN' && actor.role.key !== 'MAIN_ADMIN') throw new ApiError(403, 'เฉพาะ MAIN ADMIN เท่านั้นที่จัดการบทบาท MAIN ADMIN ได้');
}

/** Never leave the system without an active MAIN_ADMIN. */
export async function assertNotLastMainAdmin(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, include: { role: true } });
  if (!u || u.role.key !== 'MAIN_ADMIN' || u.status !== 'active') return;
  const n = await prisma.user.count({ where: { status: 'active', role: { key: 'MAIN_ADMIN' } } });
  if (n <= 1) throw new ApiError(400, 'ต้องมี MAIN ADMIN ที่ใช้งานอยู่อย่างน้อย 1 คน');
}

export async function sendInvite(opts: { email: string; name: string; roleId: number; actor: { id: string; name: string } | null }) {
  const role = await prisma.role.findUniqueOrThrow({ where: { id: opts.roleId } });
  await prisma.authToken.updateMany({ where: { email: opts.email, kind: 'invite', usedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
  const token = randomToken();
  const inv = await prisma.authToken.create({
    data: { kind: 'invite', tokenHash: hashToken(token), email: opts.email, name: opts.name, roleId: role.id, createdById: opts.actor?.id, expiresAt: new Date(Date.now() + INVITE_TTL_MS) },
  });
  const link = `${env.appUrl}/invite?token=${token}`;
  const r = await sendMail({
    to: [opts.email], subject: 'JC-ROUND · คำเชิญเข้าใช้งาน / You are invited',
    html: layout('INVITATION', `<p>สวัสดี ${escHtml(opts.name || opts.email)},</p>
      <p>${escHtml(opts.actor?.name || 'ผู้ดูแลระบบ')} เชิญคุณเข้าใช้ระบบรอบสั่ง–รอบส่ง JIAN CHA (JC-ROUND) ในบทบาท <b>${escHtml(role.name)}</b></p>
      <p>กดปุ่มด้านล่างเพื่อตั้งรหัสผ่าน (ลิงก์ใช้ได้ 7 วัน)</p>${button(link, 'ตั้งรหัสผ่าน & เข้าใช้งาน')}`),
  });
  return { id: inv.id, link, dryRun: r.dryRun };
}
