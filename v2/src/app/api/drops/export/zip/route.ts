import fs from 'fs';
import JSZip from 'jszip';
import { route, ApiError } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { dropFile } from '@/lib/drop';
import { selectedDrops, uniqueFiles, dl, stamp } from '@/lib/drop-export';
import { audit } from '@/lib/audit';

/** ZIP of the original PO PDFs, named <PO>_<branch>_<ref>.pdf */
export const POST = route(async (req: Request) => {
  const me = await requireUser('orderDrop');
  const files = uniqueFiles(await selectedDrops(req));
  if (!files.length) throw new ApiError(404, 'ไม่พบไฟล์ PDF');
  const zip = new JSZip();
  const safe = (s: string) => s.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60);
  for (const d of files) zip.file(`${safe(d.poNumber || 'PO')}_${safe(d.branchCode || d.branchName)}_${d.ref}.pdf`, fs.readFileSync(dropFile(d.id)));
  await audit('drops.export_zip', { actor: me, meta: { files: files.length } });
  return dl(await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }), 'application/zip', `order-drop-POs-${stamp()}.zip`);
});
