import { prisma } from '@/lib/db';
import { route, body, json, ApiError } from '@/lib/http';
import { requireUser, verifyPassword, hashPassword, passwordProblem, revokeAllSessions, createSession } from '@/lib/auth';
import { audit } from '@/lib/audit';

export const POST = route(async (req: Request) => {
  const me = await requireUser();
  const b = await body<{ current?: string; password?: string }>(req);
  const u = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
  if (!u.passwordHash || !(await verifyPassword(String(b.current ?? ''), u.passwordHash))) throw new ApiError(400, 'รหัสผ่านปัจจุบันไม่ถูกต้อง');
  const problem = passwordProblem(String(b.password ?? ''), u.email, u.name);
  if (problem) throw new ApiError(400, problem);
  await prisma.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(String(b.password)) } });
  await revokeAllSessions(u.id); // sign out other devices
  await createSession(u.id);
  await audit('password.changed', { actor: me });
  return json({ ok: true });
});
