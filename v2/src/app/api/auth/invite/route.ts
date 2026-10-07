import { prisma } from '@/lib/db';
import { route, body, json, ApiError, clientIp, str } from '@/lib/http';
import { hashToken } from '@/lib/crypto';
import { hashPassword, passwordProblem, createSession } from '@/lib/auth';
import { hit } from '@/lib/ratelimit';
import { audit } from '@/lib/audit';

async function load(token: string | null) {
  const t = token ? await prisma.authToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { role: true } }) : null;
  if (!t || t.kind !== 'invite' || t.usedAt || t.revokedAt || t.expiresAt < new Date()) throw new ApiError(400, 'ลิงก์เชิญหมดอายุหรือถูกใช้แล้ว — ติดต่อผู้ดูแลเพื่อขอลิงก์ใหม่');
  return t;
}

export const GET = route(async (req: Request) => {
  const t = await load(new URL(req.url).searchParams.get('token'));
  return json({ email: t.email, name: t.name || '', role: t.role?.name || '' });
});

/** Accept invite: the emailed link proves ownership of the address → account is verified on creation. */
export const POST = route(async (req: Request) => {
  if (!(await hit(`invite:ip:${await clientIp()}`, 20, 15 * 60_000))) throw new ApiError(429, 'ลองใหม่ภายหลัง');
  const b = await body<{ token?: string; name?: string; password?: string }>(req);
  const t = await load(String(b.token || ''));
  const name = str(b.name, 80) || t.name || t.email.split('@')[0];
  const problem = passwordProblem(String(b.password ?? ''), t.email, name);
  if (problem) throw new ApiError(400, problem);
  if (!t.roleId) throw new ApiError(400, 'invite has no role');
  const existing = await prisma.user.findUnique({ where: { email: t.email } });
  const data = { name, roleId: t.roleId, passwordHash: await hashPassword(String(b.password)), emailVerifiedAt: new Date(), status: 'active', failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() };
  const user = await prisma.$transaction(async tx => {
    const u = existing ? await tx.user.update({ where: { id: existing.id }, data }) : await tx.user.create({ data: { email: t.email, ...data } });
    await tx.authToken.update({ where: { id: t.id }, data: { usedAt: new Date(), userId: u.id } });
    return u;
  });
  await createSession(user.id);
  await audit('invite.accepted', { actor: { id: user.id, name: user.name }, target: user.email });
  return json({ ok: true });
});
