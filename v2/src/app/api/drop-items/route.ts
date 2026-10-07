import { prisma } from '@/lib/db';
import { route, body, json, ApiError, str } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { emailOk, normName, OTHER_KEY } from '@/lib/drop-catalog';
import { itemTypes } from '@/lib/drop';
import { audit } from '@/lib/audit';

const clean = (a: unknown) => (Array.isArray(a) ? a : []).map(e => str(e, 120)).filter(Boolean);

/** Save item-type recipients; optionally add a new item type. 'other' may have no recipients. */
export const PUT = route(async (req: Request) => {
  const me = await requireUser('orderDrop');
  const b = await body<{ items?: { key: string; to: string[]; cc: string[] }[]; add?: { label?: string; labelTh?: string; to?: string[]; cc?: string[] } }>(req);
  const items = await itemTypes();
  for (const it of b.items || []) {
    const cur = items.find(i => i.key === it.key);
    if (!cur) continue;
    const to = clean(it.to), cc = clean(it.cc);
    const bad = [...to, ...cc].find(e => !emailOk(e));
    if (bad) throw new ApiError(400, 'อีเมลไม่ถูกต้อง: ' + bad);
    if (!to.length && cur.key !== OTHER_KEY) throw new ApiError(400, cur.label + ': ต้องมีผู้รับอย่างน้อย 1 คน');
    await prisma.itemType.update({ where: { key: cur.key }, data: { to: JSON.stringify(to), cc: JSON.stringify(cc) } });
  }
  if (b.add && str(b.add.label, 60)) {
    const label = str(b.add.label, 60), labelTh = str(b.add.labelTh, 60), to = clean(b.add.to), cc = clean(b.add.cc);
    const key = normName(label).replace(/[^a-z0-9ก-๙]/g, '').slice(0, 30) || 'i' + Date.now().toString(36);
    if (items.some(i => i.key === key || normName(i.label) === normName(label))) throw new ApiError(409, 'มีประเภทนี้อยู่แล้ว');
    const bad = [...to, ...cc].find(e => !emailOk(e));
    if (bad) throw new ApiError(400, 'อีเมลไม่ถูกต้อง: ' + bad);
    if (!to.length) throw new ApiError(400, label + ': ต้องมีผู้รับอย่างน้อย 1 คน');
    const maxSort = Math.max(0, ...items.filter(i => i.key !== OTHER_KEY).map(i => i.sort));
    await prisma.itemType.create({ data: { key, label, labelTh, to: JSON.stringify(to), cc: JSON.stringify(cc), sort: maxSort + 1 } });
  }
  await audit('dropitems.updated', { actor: me, meta: b });
  return json({ ok: true, items: await itemTypes() });
});
