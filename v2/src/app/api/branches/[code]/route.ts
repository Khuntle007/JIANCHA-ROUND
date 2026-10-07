import { prisma } from '@/lib/db';
import { route, body, json, ApiError } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { branchFields } from '@/lib/validate';
import { audit } from '@/lib/audit';

type Ctx = { params: Promise<{ code: string }> };

export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const me = await requireUser('editBranch');
  const code = (await params).code;
  if (!(await prisma.branch.findUnique({ where: { code } }))) throw new ApiError(404, 'ไม่พบสาขา');
  const b = await body(req);
  const f = branchFields(b);
  if (f.nameEn !== undefined && !f.nameEn) throw new ApiError(400, 'กรอกชื่อสาขา');
  const data: Record<string, unknown> = { ...f };
  if (typeof b.active === 'boolean') data.active = b.active;
  const branch = await prisma.branch.update({ where: { code }, data });
  await audit('branch.updated', { actor: me, target: code, meta: data });
  return json({ ok: true, branch });
});

export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const me = await requireUser('editBranch');
  const code = (await params).code;
  await prisma.$transaction([prisma.special.deleteMany({ where: { branchCode: code } }), prisma.branch.delete({ where: { code } })]);
  await audit('branch.deleted', { actor: me, target: code });
  return json({ ok: true });
});
