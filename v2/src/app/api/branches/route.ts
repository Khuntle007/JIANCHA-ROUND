import { prisma } from '@/lib/db';
import { route, body, json, ApiError, str } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { branchFields } from '@/lib/validate';
import { audit } from '@/lib/audit';

async function nextCode() {
  const codes = (await prisma.branch.findMany({ select: { code: true } })).map(b => Number(b.code.replace(/\D/g, '')) || 0);
  return 'JC' + String(Math.max(0, ...codes) + 1).padStart(3, '0');
}

export const POST = route(async (req: Request) => {
  const me = await requireUser('editBranch');
  const b = await body(req);
  const f = branchFields(b);
  if (!f.nameEn) throw new ApiError(400, 'กรอกชื่อสาขา');
  const code = str(b.code, 12).toUpperCase() || (await nextCode());
  if (!/^[A-Z]{1,4}\d{2,5}$/.test(code)) throw new ApiError(400, 'รหัสสาขาไม่ถูกต้อง');
  if (await prisma.branch.findUnique({ where: { code } })) throw new ApiError(409, 'รหัสสาขาซ้ำ: ' + code);
  const branch = await prisma.branch.create({ data: { code, nameEn: f.nameEn, ...f } });
  await audit('branch.created', { actor: me, target: code });
  return json({ ok: true, branch });
});
