import fs from 'fs';
import { prisma } from '@/lib/db';
import { route, json, ApiError, clientIp, str } from '@/lib/http';
import { env } from '@/lib/env';
import { sha256 } from '@/lib/crypto';
import { hit } from '@/lib/ratelimit';
import { CATALOG } from '@/lib/drop-catalog';
import { nextRef, dropFile, deliverDrop } from '@/lib/drop';

type Ctx = { params: Promise<{ token: string }> };

// Public franchise upload link — no login. The token is the only credential, so: unguessable token,
// revocable / rotatable by admin, per-IP + per-link upload limits, strict PDF validation.
async function link(token: string) {
  const l = await prisma.dropLink.findUnique({ where: { token } });
  if (!l || !l.active) throw new ApiError(404, 'ลิงก์ไม่ถูกต้องหรือถูกปิดใช้งาน');
  return l;
}
async function allowedBranches(l: { branches: string }) {
  const codes = JSON.parse(l.branches) as string[];
  const all = await prisma.branch.findMany({ where: { active: true }, orderBy: { code: 'asc' }, select: { code: true, nameEn: true, nameTh: true } });
  return all.filter(b => !codes.length || codes.includes(b.code)).map(b => ({ code: b.code, name: b.nameEn || b.nameTh || b.code }));
}

export const GET = route(async (_req: Request, { params }: Ctx) => {
  const l = await link((await params).token);
  const drops = await prisma.drop.findMany({ where: { linkId: l.id }, orderBy: { createdAt: 'desc' }, take: 50,
    select: { ref: true, branchName: true, issuerName: true, item: true, createdAt: true, emailStatus: true } });
  return json({
    name: l.name, branches: await allowedBranches(l), maxBytes: env.maxPdfBytes,
    items: CATALOG.map(c => ({ key: c.key, label: c.label, name: c.name })), // no supplier / codes
    drops: drops.map(d => ({ ...d, itemName: CATALOG.find(c => c.key === d.item)?.name || d.item, received: true, emailStatus: undefined, forwarded: d.emailStatus === 'sent' || d.emailStatus === 'dry-run' })),
  });
});

/** Raw PDF body; metadata in the query string (branch, item, issuer, filename). */
export const POST = route(async (req: Request, { params }: Ctx) => {
  const l = await link((await params).token);
  const ip = await clientIp();
  if (!(await hit(`drop:ip:${ip}`, 20, 60 * 60_000)) || !(await hit(`drop:link:${l.id}`, 60, 60 * 60_000)))
    throw new ApiError(429, 'ส่งหลายครั้งเกินไป กรุณารอสักครู่');
  const q = new URL(req.url).searchParams;
  const branchCode = str(q.get('branch'), 12), itemKey = str(q.get('item'), 20), issuerName = str(q.get('issuer'), 120);
  let fileName = str(q.get('filename'), 150).replace(/[\\/:*?"<>|]/g, '_') || 'order.pdf';
  if (!/\.pdf$/i.test(fileName)) fileName += '.pdf';
  if (!issuerName) throw new ApiError(400, 'กรอกชื่อผู้ออกใบสั่ง');
  const item = CATALOG.find(c => c.key === itemKey);
  if (!item) throw new ApiError(400, 'เลือกรายการ');
  const br = (await allowedBranches(l)).find(b => b.code === branchCode);
  if (!br) throw new ApiError(400, 'สาขาไม่ถูกต้อง');
  const len = Number(req.headers.get('content-length') || 0);
  if (len > env.maxPdfBytes) throw new ApiError(413, 'ไฟล์ใหญ่เกินกำหนด');
  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length > env.maxPdfBytes) throw new ApiError(413, 'ไฟล์ใหญ่เกินกำหนด');
  if (buf.length < 8 || buf.subarray(0, 5).toString('latin1') !== '%PDF-') throw new ApiError(400, 'ไฟล์ต้องเป็น PDF');
  const d = await prisma.drop.create({ data: {
    ref: await nextRef(), linkId: l.id, sourceName: l.name, branchCode: br.code, branchName: br.name, issuerName, item: item.key,
    fileName, size: buf.length, sha256: sha256(buf), ip,
  } });
  fs.writeFileSync(dropFile(d.id), buf, { mode: 0o600 });
  await prisma.dropLink.update({ where: { id: l.id }, data: { lastUsedAt: new Date() } });
  void deliverDrop(d.id); // async — the franchise gets the reference immediately
  return json({ ok: true, ref: d.ref, itemName: item.name, branchName: br.name }, 201);
});
