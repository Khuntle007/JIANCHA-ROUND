import { route, json } from '@/lib/http';
import { destroySession, getCurrentUser } from '@/lib/auth';
import { audit } from '@/lib/audit';

export const POST = route(async () => {
  const u = await getCurrentUser();
  await destroySession();
  if (u) await audit('logout', { actor: u });
  return json({ ok: true });
});
