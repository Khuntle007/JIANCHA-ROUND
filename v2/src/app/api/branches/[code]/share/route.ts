import { prisma } from '@/lib/db';
import { route, json, ApiError } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { randomToken } from '@/lib/crypto';
import { env } from '@/lib/env';
import { audit } from '@/lib/audit';

type Ctx = { params: Promise<{ code: string }> };

/** Returns the active share link of a branch, creating one if needed. */
export const POST = route(async (_req: Request, { params }: Ctx) => {
  const me = await requireUser('share');
  const code = (await params).code;
  if (!(await prisma.branch.findUnique({ where: { code } }))) throw new ApiError(404, 'ไม่พบสาขา');
  let link = await prisma.shareLink.findFirst({ where: { branchCode: code, revokedAt: null }, orderBy: { createdAt: 'desc' } });
  if (!link) {
    link = await prisma.shareLink.create({ data: { token: randomToken(18), branchCode: code, createdById: me.id } });
    await audit('share.created', { actor: me, target: code });
  }
  return json({ id: link.id, url: `${env.appUrl}/s/${link.token}` });
});

/** Revoke the current link (a new one is created on next share). */
export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const me = await requireUser('share');
  const code = (await params).code;
  await prisma.shareLink.updateMany({ where: { branchCode: code, revokedAt: null }, data: { revokedAt: new Date() } });
  await audit('share.revoked', { actor: me, target: code });
  return json({ ok: true });
});
