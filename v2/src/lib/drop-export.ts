import fs from 'fs';
import { prisma } from './db';
import { ApiError, body } from './http';
import { dropFile, itemTypes, parsePoJson, parseRoute } from './drop';

export async function selectedDrops(req: Request) {
  const b = await body<{ ids?: string[] }>(req);
  const ids = [...new Set((b.ids || []).map(String))].slice(0, 2000);
  if (!ids.length) throw new ApiError(400, 'เลือกรายการก่อน');
  const rows = await prisma.drop.findMany({ where: { id: { in: ids } } });
  const order = new Map(ids.map((id, i) => [id, i]));
  return rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)); // keep the on-screen order
}

/** Original PO files, de-duplicated (a PO split across suppliers shares one PDF). */
export function uniqueFiles(rows: Awaited<ReturnType<typeof selectedDrops>>) {
  const seen = new Set<string>();
  return rows.filter(d => { if (seen.has(d.sha256) || !fs.existsSync(dropFile(d.id))) return false; seen.add(d.sha256); return true; });
}

export const STATUS_TH: Record<string, string> = {
  sent: 'ส่งอีเมลแล้ว', 'dry-run': 'ทดสอบ (ไม่ส่งจริง)', failed: 'ส่งไม่สำเร็จ', pending: 'รอเลือก supplier', blocked: 'ไม่ส่งต่อ (บันทึกเท่านั้น)', queued: 'กำลังส่ง', sending: 'กำลังส่ง',
};

export async function exportRows(rows: Awaited<ReturnType<typeof selectedDrops>>) {
  const items = await itemTypes();
  const lab = (k: string) => items.find(i => i.key === k)?.label || k;
  const J = (s: string) => { try { return (JSON.parse(s) as string[]).join(', '); } catch { return ''; } };
  return rows.map(d => {
    const po = parsePoJson(d.po), r = parseRoute(d.route);
    return { d, po, item: lab(d.item), supplier: r?.kind === 'supplier' ? r.supplierName : '', to: J(d.emailTo), cc: J(d.emailCc) };
  });
}

export const dl = (buf: Uint8Array | Buffer, type: string, name: string) =>
  new Response(new Uint8Array(buf), { headers: { 'Content-Type': type, 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'private, no-store' } });
export const stamp = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok' }).slice(0, 16).replace(/[-: ]/g, '');
