import { prisma } from '@/lib/db';
import { route, body, json, ApiError, str } from '@/lib/http';
import { requireUser, revokeAllSessions, type CurrentUser } from '@/lib/auth';
import { assertMayManageRole, assertNotLastMainAdmin } from '@/lib/admin';
import { parsePerms } from '@/lib/perms';
import { audit } from '@/lib/audit';

type Ctx = { params: Promise<{ id: string }> };

async function target(id: string, me: CurrentUser) {
  const u = await prisma.user.findUnique({ where: { id }, include: { role: true } });
  if (!u) throw new ApiError(404, 'not found');
  assertMayManageRole(me, u.role.key);
  return u;
}

export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const me = await requireUser('manageUsers');
  const u = await target((await params).id, me);
  const b = await body<{ name?: string; roleId?: number; status?: string; permOverrides?: Record<string, boolean> }>(req);
  const data: { name?: string; roleId?: number; status?: string; permOverrides?: string } = {};
  let revoke = false;
  if (b.name !== undefined) data.name = str(b.name, 80) || u.name;
  if (b.roleId !== undefined && Number(b.roleId) !== u.roleId) {
    const role = await prisma.role.findUnique({ where: { id: Number(b.roleId) } });
    if (!role) throw new ApiError(400, 'role not found');
    assertMayManageRole(me, role.key);
    if (u.role.key === 'MAIN_ADMIN') await assertNotLastMainAdmin(u.id);
    data.roleId = role.id;
  }
  if (b.status !== undefined && b.status !== u.status) {
    if (!['active', 'disabled'].includes(b.status)) throw new ApiError(400, 'bad status');
    if (b.status === 'disabled') {
      if (u.id === me.id) throw new ApiError(400, 'ปิดบัญชีตัวเองไม่ได้');
      await assertNotLastMainAdmin(u.id);
      revoke = true;
    }
    data.status = b.status;
  }
  if (b.permOverrides !== undefined) data.permOverrides = JSON.stringify(parsePerms(JSON.stringify(b.permOverrides)));
  const updated = await prisma.user.update({ where: { id: u.id }, data });
  if (revoke) await revokeAllSessions(u.id);
  await audit('user.updated', { actor: me, target: u.email, meta: { ...data, permOverrides: data.permOverrides ? JSON.parse(data.permOverrides) : undefined } });
  return json({ ok: true, user: { id: updated.id, name: updated.name, roleId: updated.roleId, status: updated.status, permOverrides: updated.permOverrides } });
});

export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const me = await requireUser('manageUsers');
  const u = await target((await params).id, me);
  if (u.id === me.id) throw new ApiError(400, 'ลบบัญชีตัวเองไม่ได้');
  await assertNotLastMainAdmin(u.id);
  await prisma.user.delete({ where: { id: u.id } });
  await audit('user.deleted', { actor: me, target: u.email });
  return json({ ok: true });
});
