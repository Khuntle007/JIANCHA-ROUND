import ExcelJS from 'exceljs';
import { prisma } from '@/lib/db';
import { route, body, ApiError } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { env } from '@/lib/env';
import { dl, stamp } from '@/lib/drop-export';
import { audit } from '@/lib/audit';

const bkk = (d: Date | null) => (d ? d.toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok' }).slice(0, 16) : '');

/** Excel of franchise upload links (secret URLs — audited). Keeps the on-screen order. */
export const POST = route(async (req: Request) => {
  const me = await requireUser('orderDrop');
  const ids = [...new Set(((await body<{ ids?: string[] }>(req)).ids || []).map(String))].slice(0, 2000);
  if (!ids.length) throw new ApiError(400, 'เลือกลิงก์ก่อน');
  const order = new Map(ids.map((id, i) => [id, i]));
  const links = (await prisma.dropLink.findMany({ where: { id: { in: ids } } })).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  const branches = new Map((await prisma.branch.findMany({ select: { code: true, nameEn: true } })).map(b => [b.code, b.nameEn]));
  const wb = new ExcelJS.Workbook();
  wb.creator = 'JIAN CHA Rounds System';
  const ws = wb.addWorksheet('Franchise links');
  ws.columns = [
    { header: 'ลำดับ', key: 'n', width: 7 }, { header: 'รหัสสาขา', key: 'code', width: 11 }, { header: 'ชื่อสาขา', key: 'bname', width: 30 },
    { header: 'ชื่อลิงก์', key: 'name', width: 32 }, { header: 'ลิงก์ส่งใบ PO', key: 'url', width: 62 }, { header: 'สถานะ', key: 'st', width: 10 },
    { header: 'ใช้ล่าสุด', key: 'last', width: 17 },
  ];
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF181818' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  links.forEach((l, i) => {
    const url = `${env.appUrl}/d/${l.token}`;
    const row = ws.addRow({ n: i + 1, code: l.branchCode || '', bname: l.branchCode ? branches.get(l.branchCode) || '' : '', name: l.name, url, st: l.active ? 'ใช้งาน' : 'ปิด', last: bkk(l.lastUsedAt) });
    row.getCell('url').value = { text: url, hyperlink: url };
    row.getCell('url').font = { color: { argb: 'FF181818' }, underline: true };
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 7 } };
  await audit('droplinks.export_xlsx', { actor: me, meta: { count: links.length } });
  return dl(Buffer.from(await wb.xlsx.writeBuffer()), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', `franchise-links-${stamp()}.xlsx`);
});
