import { prisma } from '@/lib/db';
import { route, body, json, ApiError } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { roundFields } from '@/lib/validate';
import { audit } from '@/lib/audit';

type Ctx = { params: Promise<{ code: string }> };

/** Replace the whole round set of a branch (same behaviour as v1's ตั้งค่ารอบ modal). */
export const PUT = route(async (req: Request, { params }: Ctx) => {
  const me = await requireUser('editRounds');
  const code = (await params).code;
  if (!(await prisma.branch.findUnique({ where: { code } }))) throw new ApiError(404, 'ไม่พบสาขา');
  const b = await body<{ rounds?: Record<string, unknown>[] }>(req);
  if (!Array.isArray(b.rounds) || b.rounds.length > 40) throw new ApiError(400, 'rounds required');
  const rows = b.rounds.map((r, i) => ({ ...roundFields(r), branchCode: code, sort: i }));
  await prisma.$transaction([prisma.round.deleteMany({ where: { branchCode: code } }), prisma.round.createMany({ data: rows })]);
  await audit('rounds.updated', { actor: me, target: code, meta: { count: rows.length } });
  return json({ ok: true });
});
