import { prisma } from '@/lib/db';
import { route, body, json, ApiError, clientIp, str } from '@/lib/http';
import { randomToken, hashToken } from '@/lib/crypto';
import { sendMail, layout, button, escHtml } from '@/lib/mail';
import { env } from '@/lib/env';
import { hit } from '@/lib/ratelimit';
import { audit } from '@/lib/audit';

// Always answers the same way whether or not the email exists.
export const POST = route(async (req: Request) => {
  const email = str((await body<{ email?: string }>(req)).email, 200).toLowerCase();
  if (!email) throw new ApiError(400, 'กรอกอีเมล');
  if (!(await hit(`forgot:ip:${await clientIp()}`, 10, 60 * 60_000)) || !(await hit(`forgot:em:${email}`, 3, 60 * 60_000)))
    return json({ ok: true });
  const u = await prisma.user.findUnique({ where: { email } });
  if (u && u.status === 'active' && u.emailVerifiedAt) {
    const token = randomToken();
    await prisma.authToken.updateMany({ where: { userId: u.id, kind: 'reset', usedAt: null }, data: { revokedAt: new Date() } });
    await prisma.authToken.create({ data: { kind: 'reset', tokenHash: hashToken(token), email, userId: u.id, expiresAt: new Date(Date.now() + 30 * 60_000) } });
    await sendMail({
      to: [email], subject: 'JC-ROUND · ตั้งรหัสผ่านใหม่ / Reset your password',
      html: layout('RESET PASSWORD', `<p>สวัสดี ${escHtml(u.name)},</p><p>มีคำขอตั้งรหัสผ่านใหม่สำหรับบัญชี JC-ROUND ของคุณ ลิงก์ใช้ได้ 30 นาที</p>${button(`${env.appUrl}/reset?token=${token}`, 'ตั้งรหัสผ่านใหม่')}<p style="font-size:12px;color:#525252">ถ้าคุณไม่ได้ขอ ไม่ต้องทำอะไร — รหัสเดิมยังใช้ได้</p>`),
    }).catch(e => console.error('[forgot mail]', e));
    await audit('password.reset_requested', { target: email });
  }
  return json({ ok: true });
});
