import ExcelJS from 'exceljs';
import { route } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { selectedDrops, exportRows, STATUS_TH, dl, stamp } from '@/lib/drop-export';
import { audit } from '@/lib/audit';

const bkk = (d: Date | null) => (d ? d.toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok' }).slice(0, 16) : '');

/** Excel: sheet 1 = one row per order, sheet 2 = one row per PO line. */
export const POST = route(async (req: Request) => {
  const me = await requireUser('orderDrop');
  const rows = await exportRows(await selectedDrops(req));
  const wb = new ExcelJS.Workbook();
  wb.creator = 'JIAN CHA Rounds System';
  const head = (ws: ExcelJS.Worksheet) => {
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF181818' } };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
  };
  const a = wb.addWorksheet('Orders');
  a.columns = [
    { header: 'วันที่ส่ง', key: 'at', width: 17 }, { header: 'Ref', key: 'ref', width: 18 }, { header: 'PO', key: 'po', width: 15 },
    { header: 'รหัสสาขา', key: 'bc', width: 10 }, { header: 'สาขา (จาก PO)', key: 'bn', width: 24 }, { header: 'ประเภท', key: 'item', width: 24 },
    { header: 'Supplier', key: 'sup', width: 34 }, { header: 'ผู้ออก PO', key: 'iss', width: 22 }, { header: 'ลิงก์', key: 'src', width: 24 },
    { header: 'จำนวนรายการ', key: 'n', width: 10 }, { header: 'ยอดรวม', key: 'total', width: 12 }, { header: 'สถานะอีเมล', key: 'st', width: 20 },
    { header: 'ส่งถึง', key: 'to', width: 40 }, { header: 'CC', key: 'cc', width: 40 }, { header: 'เปิดอีเมลครั้งแรก', key: 'open', width: 17 },
    { header: 'ไฟล์', key: 'file', width: 30 },
  ];
  head(a);
  const b = wb.addWorksheet('PO lines');
  b.columns = [
    { header: 'Ref', key: 'ref', width: 18 }, { header: 'PO', key: 'po', width: 15 }, { header: 'รหัสสาขา', key: 'bc', width: 10 }, { header: 'สาขา', key: 'bn', width: 24 },
    { header: 'ลำดับ', key: 'no', width: 6 }, { header: 'รายการสินค้า', key: 'name', width: 48 }, { header: 'จำนวน', key: 'qty', width: 9 }, { header: 'หน่วย', key: 'unit', width: 8 },
    { header: 'VAT', key: 'vat', width: 5 }, { header: 'ราคา', key: 'price', width: 12 }, { header: 'รวม', key: 'total', width: 12 }, { header: 'Supplier', key: 'sup', width: 34 },
  ];
  head(b);
  for (const r of rows) {
    const { d, po } = r;
    a.addRow({ at: bkk(d.createdAt), ref: d.ref, po: d.poNumber, bc: d.branchCode, bn: d.branchName, item: r.item, sup: r.supplier, iss: d.issuerName, src: d.sourceName,
      n: po?.lines.length ?? '', total: po?.total ?? '', st: STATUS_TH[d.emailStatus] || d.emailStatus, to: r.to, cc: r.cc, open: bkk(d.openedAt), file: d.fileName });
    for (const l of po?.lines || []) b.addRow({ ref: d.ref, po: d.poNumber, bc: d.branchCode, bn: d.branchName, no: l.no, name: l.name, qty: l.qty, unit: l.unit, vat: l.vat, price: l.price, total: l.total, sup: r.supplier });
  }
  for (const ws of [a, b]) ws.getColumn('total').numFmt = '#,##0.00';
  b.getColumn('price').numFmt = '#,##0.00';
  await audit('drops.export_xlsx', { actor: me, meta: { count: rows.length } });
  return dl(Buffer.from(await wb.xlsx.writeBuffer()), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', `order-drop-${stamp()}.xlsx`);
});
