import { route, json, ApiError } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { bcSync } from '@/lib/bc';
import { audit } from '@/lib/audit';

export const POST = route(async () => {
  const me = await requireUser('orderDrop');
  try {
    const st = await bcSync();
    await audit('bc.synced', { actor: me, meta: st });
    return json({ ok: true, bc: st });
  } catch (e) { throw new ApiError(502, (e as Error).message); }
});
