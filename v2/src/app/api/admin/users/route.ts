import { prisma } from '@/lib/db';
import { route, json } from '@/lib/http';
import { requireUser } from '@/lib/auth';

export const GET = route(async () => {
  await requireUser('manageUsers');
  const [users, roles, invites] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: 'asc' }, select: { id: true, email: true, name: true, roleId: true, status: true, permOverrides: true, emailVerifiedAt: true, lastLoginAt: true, lockedUntil: true, createdAt: true } }),
    prisma.role.findMany({ orderBy: { id: 'asc' } }),
    prisma.authToken.findMany({ where: { kind: 'invite', usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' }, select: { id: true, email: true, name: true, roleId: true, expiresAt: true, createdAt: true } }),
  ]);
  return json({ users, roles, invites });
});
