import { prisma } from '@/lib/db';
import { route, body, json, ApiError, str } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { audit } from '@/lib/audit';

type Ctx = { params: Promise<{ code: string }> };

/** Create (manual) or update a product code and REPLACE its supplier list. */
export const PUT = route(async (req: Request, { params }: Ctx) => {
  const me = await requireUser('orderDrop');
  const code = decodeURIComponent((await params).code);
  if (!/^[A-Za-z0-9._-]{1,40}$/.test(code)) throw new ApiError(400, 'รหัสสินค้าไม่ถูกต้อง');
  const b = await body<{ name?: string; supplierIds?: string[] }>(req);
  const ids = [...new Set((b.supplierIds || []).map(x => str(x, 40)).filter(Boolean))];
  if (ids.length && (await prisma.supplier.count({ where: { id: { in: ids } } })) !== ids.length) throw new ApiError(400, 'ไม่พบ supplier บางราย');
  const name = b.name !== undefined ? str(b.name, 200) : undefined;
  await prisma.$transaction([
    prisma.product.upsert({ where: { code }, create: { code, name: name || '', source: 'manual' }, update: name !== undefined ? { name } : {} }),
    prisma.productSupplier.deleteMany({ where: { productCode: code } }),
    prisma.productSupplier.createMany({ data: ids.map(supplierId => ({ productCode: code, supplierId })) }),
  ]);
  await audit('product.suppliers', { actor: me, target: code, meta: { suppliers: ids.length } });
  return json({ ok: true });
});
