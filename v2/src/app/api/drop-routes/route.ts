import { prisma } from '@/lib/db';
import { route, body, json, ApiError, str } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { CATALOG, emailOk } from '@/lib/drop-catalog';
import { audit } from '@/lib/audit';

export const PUT = route(async (req: Request) => {
  const me = await requireUser('orderDrop');
  const b = await body<{ items?: { key: string; to: string[]; cc: string[] }[] }>(req);
  if (!Array.isArray(b.items)) throw new ApiError(400, 'items required');
  for (const it of b.items) {
    const c = CATALOG.find(x => x.key === it.key);
    if (!c) continue;
    const to = (it.to || []).map(e => str(e, 120)).filter(Boolean), cc = (it.cc || []).map(e => str(e, 120)).filter(Boolean);
    const bad = [...to, ...cc].find(e => !emailOk(e));
    if (bad) throw new ApiError(400, 'อีเมลไม่ถูกต้อง: ' + bad);
    if (!to.length) throw new ApiError(400, c.name + ': ต้องมีผู้รับอย่างน้อย 1 คน');
    await prisma.itemRoute.upsert({ where: { key: c.key }, create: { key: c.key, to: JSON.stringify(to), cc: JSON.stringify(cc) }, update: { to: JSON.stringify(to), cc: JSON.stringify(cc) } });
  }
  await audit('droproutes.updated', { actor: me, meta: b.items });
  return json({ ok: true });
});
