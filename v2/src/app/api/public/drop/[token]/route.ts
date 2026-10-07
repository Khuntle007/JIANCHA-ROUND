import { prisma } from '@/lib/db';
import { route, json, ApiError, clientIp, str } from '@/lib/http';
import { env } from '@/lib/env';
import { hit } from '@/lib/ratelimit';
import { pdfText, parsePo, PoError } from '@/lib/po';
import { createDropsFromPo, deliverDrop, notifyScm, itemTypes } from '@/lib/drop';

type Ctx = { params: Promise<{ token: string }> };

// Public franchise upload link — no login, upload only (nothing about past orders is ever returned).
// The token is the only credential: unguessable, revocable / rotatable, rate-limited, strict PDF + PO validation.
async function link(token: string) {
  const l = await prisma.dropLink.findUnique({ where: { token } });
  if (!l || !l.active) throw new ApiError(404, 'ลิงก์ไม่ถูกต้องหรือถูกปิดใช้งาน');
  return l;
}

export const GET = route(async (_req: Request, { params }: Ctx) => {
  const l = await link((await params).token);
  return json({ name: l.name, maxBytes: env.maxPdfBytes });
});

/** Raw PDF body, ?filename=… — branch, items and issuer are read from the PO itself. */
export const POST = route(async (req: Request, { params }: Ctx) => {
  const l = await link((await params).token);
  const ip = await clientIp();
  if (!(await hit(`drop:ip:${ip}`, 20, 60 * 60_000)) || !(await hit(`drop:link:${l.id}`, 60, 60 * 60_000)))
    throw new ApiError(429, 'ส่งหลายครั้งเกินไป กรุณารอสักครู่');
  let fileName = str(new URL(req.url).searchParams.get('filename'), 150).replace(/[\\/:*?"<>|]/g, '_') || 'order.pdf';
  if (!/\.pdf$/i.test(fileName)) fileName += '.pdf';
  if (Number(req.headers.get('content-length') || 0) > env.maxPdfBytes) throw new ApiError(413, 'ไฟล์ใหญ่เกินกำหนด');
  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length > env.maxPdfBytes) throw new ApiError(413, 'ไฟล์ใหญ่เกินกำหนด');
  if (buf.length < 8 || buf.subarray(0, 5).toString('latin1') !== '%PDF-') throw new ApiError(400, 'ไฟล์ต้องเป็น PDF');
  let po;
  try { po = parsePo(await pdfText(buf)); }
  catch (e) { throw e instanceof PoError && e.code === 'NOTOOL' ? new ApiError(503, 'ระบบอ่าน PDF ยังไม่พร้อม แจ้งทีม SCM') : new ApiError(422, 'อ่านไฟล์ PDF ไม่ได้'); }
  if (!po.number || !po.lines.length) throw new ApiError(422, 'ไม่พบข้อมูล PO ในไฟล์นี้ — ต้องเป็นใบ PO (PURCHASE ORDER) จากระบบ PO เท่านั้น');
  const drops = await createDropsFromPo({ po, buf, fileName, link: l, ip });
  await prisma.dropLink.update({ where: { id: l.id }, data: { lastUsedAt: new Date() } });
  drops.filter(d => !d.pending).forEach(d => void deliverDrop(d.id)); // async — the franchise gets the refs immediately
  void notifyScm(drops.filter(d => d.pending).map(d => d.id));
  const items = await itemTypes();
  return json({ ok: true, poNumber: po.number, buyer: po.buyer, drops: drops.map(d => ({ ref: d.ref, item: items.find(i => i.key === d.item)?.label || d.item })) }, 201);
});
