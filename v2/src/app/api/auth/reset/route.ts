import { prisma } from '@/lib/db';
import { route, body, json, ApiError, clientIp } from '@/lib/http';
import { hashToken } from '@/lib/crypto';
import { hashPassword, passwordProblem, revokeAllSessions } from '@/lib/auth';
import { hit } from '@/lib/ratelimit';
import { audit } from '@/lib/audit';

export const POST = route(async (req: Request) => {
  const b = await body<{ token?: string; password?: string }>(req);
  if (!(await hit(`reset:ip:${await clientIp()}`, 20, 15 * 60_000))) throw new ApiError(429, 'ลองใหม่ภายหลัง');
  const t = b.token ? await prisma.authToken.findUnique({ where: { tokenHash: hashToken(String(b.token)) }, include: { user: true } }) : null;
  if (!t || t.kind !== 'reset' || t.usedAt || t.revokedAt || t.expiresAt < new Date() || !t.user || t.user.status !== 'active')
    throw new ApiError(400, 'ลิงก์หมดอายุหรือใช้ไปแล้ว — ขอลิงก์ใหม่ที่หน้า "ลืมรหัสผ่าน"');
  const problem = passwordProblem(String(b.password ?? ''), t.user.email, t.user.name);
  if (problem) throw new ApiError(400, problem);
  await prisma.$transaction([
    prisma.user.update({ where: { id: t.user.id }, data: { passwordHash: await hashPassword(String(b.password)), failedLogins: 0, lockedUntil: null } }),
    prisma.authToken.update({ where: { id: t.id }, data: { usedAt: new Date() } }),
  ]);
  await revokeAllSessions(t.user.id);
  await audit('password.reset', { actor: { id: t.user.id, name: t.user.name } });
  return json({ ok: true });
});
