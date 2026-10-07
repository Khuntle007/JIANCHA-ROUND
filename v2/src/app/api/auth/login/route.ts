import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { route, body, json, ApiError, clientIp, str } from '@/lib/http';
import { createSession, verifyPassword, LOCK_AFTER, LOCK_MS } from '@/lib/auth';
import { hit } from '@/lib/ratelimit';
import { audit } from '@/lib/audit';

const GENERIC = 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
// burn comparable time when the user doesn't exist (no account enumeration via timing)
let DUMMY: string | null = null;
const dummy = async () => (DUMMY ??= await bcrypt.hash('jc-round-dummy', 12));

export const POST = route(async (req: Request) => {
  const b = await body<{ email?: string; password?: string }>(req);
  const email = str(b.email, 200).toLowerCase(), password = String(b.password ?? '');
  if (!email || !password) throw new ApiError(400, 'กรอกอีเมลและรหัสผ่าน');
  const ip = await clientIp();
  if (!(await hit(`login:ip:${ip}`, 30, 15 * 60_000)) || !(await hit(`login:em:${email}`, 10, 15 * 60_000)))
    throw new ApiError(429, 'พยายามหลายครั้งเกินไป กรุณารอ 15 นาที');

  const u = await prisma.user.findUnique({ where: { email } });
  if (!u || !u.passwordHash) { await verifyPassword(password, await dummy()); throw new ApiError(401, GENERIC); }
  if (u.lockedUntil && u.lockedUntil > new Date()) throw new ApiError(423, 'บัญชีถูกล็อกชั่วคราว 15 นาที เนื่องจากใส่รหัสผิดหลายครั้ง');
  if (!(await verifyPassword(password, u.passwordHash))) {
    const n = u.failedLogins + 1;
    await prisma.user.update({ where: { id: u.id }, data: n >= LOCK_AFTER ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MS) } : { failedLogins: n } });
    await audit('login.failed', { target: u.email, meta: { attempt: n } });
    throw new ApiError(401, GENERIC);
  }
  if (u.status !== 'active') throw new ApiError(403, 'บัญชีนี้ถูกปิดใช้งาน — ติดต่อผู้ดูแลระบบ');
  if (!u.emailVerifiedAt) throw new ApiError(403, 'ยังไม่ได้ยืนยันอีเมล — ใช้ลิงก์ในอีเมลเชิญ');
  await prisma.user.update({ where: { id: u.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await createSession(u.id);
  await audit('login', { actor: { id: u.id, name: u.name } });
  return json({ ok: true });
});
