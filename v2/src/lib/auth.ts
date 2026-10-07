import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from './db';
import { env } from './env';
import { hashToken, randomToken } from './crypto';
import { ApiError, clientIp, userAgent } from './http';
import { effectivePerms, type Feature } from './perms';
export { passwordProblem } from './auth-rules';

export const SESSION_COOKIE = 'jcr_session';
const SESSION_TTL_MS = 7 * 24 * 3600 * 1000; // absolute lifetime
const IDLE_MS = 24 * 3600 * 1000; // sign out after 24h without activity
export const LOCK_AFTER = 5;
export const LOCK_MS = 15 * 60 * 1000;

export const hashPassword = (pw: string) => bcrypt.hash(pw, 12);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

export async function createSession(userId: string) {
  const token = randomToken(32);
  await prisma.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS), ip: await clientIp(), userAgent: await userAgent() },
  });
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, secure: env.isProd, sameSite: 'lax', path: '/', maxAge: SESSION_TTL_MS / 1000 });
}

export async function destroySession() {
  const c = await cookies();
  const t = c.get(SESSION_COOKIE)?.value;
  if (t) await prisma.session.deleteMany({ where: { tokenHash: hashToken(t) } });
  c.delete(SESSION_COOKIE);
}

/** Ends every session of a user (disable, password reset, role removal). */
export const revokeAllSessions = (userId: string) => prisma.session.deleteMany({ where: { userId } });

export type CurrentUser = {
  id: string; email: string; name: string;
  role: { id: number; key: string; name: string; isProtected: boolean };
  perms: Record<Feature, boolean>;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const t = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!t) return null;
  const s = await prisma.session.findUnique({ where: { tokenHash: hashToken(t) }, include: { user: { include: { role: true } } } });
  const now = Date.now();
  if (!s || s.expiresAt.getTime() < now || now - s.lastSeenAt.getTime() > IDLE_MS || s.user.status !== 'active' || !s.user.emailVerifiedAt) {
    if (s) await prisma.session.delete({ where: { id: s.id } }).catch(() => {});
    return null;
  }
  if (now - s.lastSeenAt.getTime() > 5 * 60 * 1000) await prisma.session.update({ where: { id: s.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  const u = s.user;
  return { id: u.id, email: u.email, name: u.name, role: { id: u.role.id, key: u.role.key, name: u.role.name, isProtected: u.role.isProtected }, perms: effectivePerms(u.role, u.permOverrides) };
}

/** API guard: 401 when signed out, 403 when the permission is missing. */
export async function requireUser(perm?: Feature): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) throw new ApiError(401, 'login required');
  if (perm && !u.perms[perm]) throw new ApiError(403, 'permission denied');
  return u;
}

/** Page guard: redirect to login / no-access page. */
export async function requirePage(perm?: Feature, next = '/'): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect('/login?next=' + encodeURIComponent(next));
  if (perm && !u.perms[perm]) redirect('/denied');
  return u;
}
