import { prisma } from '@/lib/db';
import { route, body, json, ApiError, str } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { audit } from '@/lib/audit';

type Ctx = { params: Promise<{ code: string }> };

/** Create (manual) or update a product code and REPLACE its supplier links.
 *  suppliers: [{ id, branches: [] }] — branches empty = default for every branch without a specific supplier. */
export const PUT = route(async (req: Request, { params }: Ctx) => {
  const me = await requireUser('orderDrop');
  const code = decodeURIComponent((await params).code);
  if (!/^[A-Za-z0-9._-]{1,40}$/.test(code)) throw new ApiError(400, 'รหัสสินค้าไม่ถูกต้อง');
  const b = await body<{ name?: string; supplierIds?: string[]; suppliers?: { id: string; branches?: string[] }[] }>(req);
  const links = (b.suppliers || (b.supplierIds || []).map(id => ({ id, branches: [] as string[] })))
    .map(x => ({ id: str(x.id, 40), branches: [...new Set((x.branches || []).map(c => str(c, 12)).filter(Boolean))] }))
    .filter((x, i, a) => x.id && a.findIndex(y => y.id === x.id) === i);
  if (links.length && (await prisma.supplier.count({ where: { id: { in: links.map(l => l.id) } } })) !== links.length) throw new ApiError(400, 'ไม่พบ supplier บางราย');
  const codes = [...new Set(links.flatMap(l => l.branches))];
  if (codes.length && (await prisma.branch.count({ where: { code: { in: codes } } })) !== codes.length) throw new ApiError(400, 'ไม่พบสาขาบางสาขา');
  const name = b.name !== undefined ? str(b.name, 200) : undefined;
  await prisma.$transaction([
    prisma.product.upsert({ where: { code }, create: { code, name: name || '', source: 'manual' }, update: name !== undefined ? { name } : {} }),
    prisma.productSupplier.deleteMany({ where: { productCode: code } }),
    prisma.productSupplier.createMany({ data: links.map(l => ({ productCode: code, supplierId: l.id, branches: JSON.stringify(l.branches) })) }),
  ]);
  await audit('product.suppliers', { actor: me, target: code, meta: links });
  return json({ ok: true });
});
