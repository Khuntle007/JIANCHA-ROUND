import { prisma } from '@/lib/db';
import { route, json, ApiError } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { sendInvite, assertMayManageRole } from '@/lib/admin';
import { audit } from '@/lib/audit';

type Ctx = { params: Promise<{ id: string }> };

/** resend = revoke + new link to the same email */
export const POST = route(async (_req: Request, { params }: Ctx) => {
  const me = await requireUser('manageUsers');
  const inv = await prisma.authToken.findUnique({ where: { id: (await params).id }, include: { role: true } });
  if (!inv || inv.kind !== 'invite' || !inv.roleId || !inv.role) throw new ApiError(404, 'not found');
  assertMayManageRole(me, inv.role.key);
  const r = await sendInvite({ email: inv.email, name: inv.name || '', roleId: inv.roleId, actor: me });
  await audit('invite.resent', { actor: me, target: inv.email });
  return json({ ok: true, devLink: r.dryRun ? r.link : undefined });
});

export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const me = await requireUser('manageUsers');
  const inv = await prisma.authToken.findUnique({ where: { id: (await params).id } });
  if (!inv || inv.kind !== 'invite') throw new ApiError(404, 'not found');
  await prisma.authToken.update({ where: { id: inv.id }, data: { revokedAt: new Date() } });
  await audit('invite.revoked', { actor: me, target: inv.email });
  return json({ ok: true });
});
