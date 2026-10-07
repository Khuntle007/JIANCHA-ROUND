import { prisma } from '@/lib/db';
import { route, body, json, ApiError, str } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { parsePerms } from '@/lib/perms';
import { audit } from '@/lib/audit';

type Ctx = { params: Promise<{ id: string }> };

async function editable(id: string) {
  const me = await requireUser('manageUsers');
  if (me.role.key !== 'MAIN_ADMIN') throw new ApiError(403, 'เฉพาะ MAIN ADMIN เท่านั้นที่แก้บทบาทได้');
  const role = await prisma.role.findUnique({ where: { id: Number(id) } });
  if (!role) throw new ApiError(404, 'not found');
  if (role.isProtected) throw new ApiError(400, 'MAIN ADMIN มีสิทธิ์ครบเสมอ แก้ไม่ได้');
  return { me, role };
}

export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const { me, role } = await editable((await params).id);
  const b = await body<{ name?: string; perms?: Record<string, boolean> }>(req);
  const data: { name?: string; perms?: string } = {};
  if (b.name !== undefined) data.name = str(b.name, 60) || role.name;
  if (b.perms !== undefined) data.perms = JSON.stringify(parsePerms(JSON.stringify(b.perms)));
  const r = await prisma.role.update({ where: { id: role.id }, data });
  await audit('role.updated', { actor: me, target: role.name, meta: { perms: b.perms } });
  return json({ ok: true, role: r });
});

export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const { me, role } = await editable((await params).id);
  if (!role.key.startsWith('custom-')) throw new ApiError(400, 'ลบได้เฉพาะบทบาทที่สร้างเอง');
  if (await prisma.user.count({ where: { roleId: role.id } })) throw new ApiError(400, 'ยังมีผู้ใช้ในบทบาทนี้');
  await prisma.role.delete({ where: { id: role.id } });
  await audit('role.deleted', { actor: me, target: role.name });
  return json({ ok: true });
});
