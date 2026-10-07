import fs from 'fs';
import { PDFDocument } from 'pdf-lib';
import { route, ApiError } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { dropFile } from '@/lib/drop';
import { selectedDrops, uniqueFiles, dl, stamp } from '@/lib/drop-export';
import { audit } from '@/lib/audit';

/** One PDF containing every selected original PO (same file once, in list order). */
export const POST = route(async (req: Request) => {
  const me = await requireUser('orderDrop');
  const files = uniqueFiles(await selectedDrops(req));
  if (!files.length) throw new ApiError(404, 'ไม่พบไฟล์ PDF');
  const out = await PDFDocument.create();
  let skipped = 0;
  for (const d of files) {
    try {
      const src = await PDFDocument.load(fs.readFileSync(dropFile(d.id)), { ignoreEncryption: true });
      (await out.copyPages(src, src.getPageIndices())).forEach(p => out.addPage(p));
    } catch { skipped++; }
  }
  if (!out.getPageCount()) throw new ApiError(422, 'อ่านไฟล์ PDF ไม่ได้');
  await audit('drops.export_pdf', { actor: me, meta: { files: files.length, skipped } });
  return dl(await out.save(), 'application/pdf', `order-drop-POs-${stamp()}.pdf`);
});
