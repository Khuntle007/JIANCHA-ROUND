import fs from 'fs';
import { prisma } from '@/lib/db';
import { route, ApiError } from '@/lib/http';
import { dropFile, verifyFileSig } from '@/lib/drop';

type Ctx = { params: Promise<{ id: string }> };

/** Signed 14-day download link sent to suppliers when the PDF is too big to attach. */
export const GET = route(async (req: Request, { params }: Ctx) => {
  const id = (await params).id, q = new URL(req.url).searchParams;
  if (!verifyFileSig(id, Number(q.get('exp')), q.get('sig') || '')) throw new ApiError(403, 'ลิงก์หมดอายุหรือไม่ถูกต้อง');
  const d = await prisma.drop.findUnique({ where: { id } });
  if (!d || !fs.existsSync(dropFile(id))) throw new ApiError(404, 'not found');
  return new Response(new Uint8Array(fs.readFileSync(dropFile(id))), { headers: {
    'Content-Type': 'application/pdf', 'Cache-Control': 'private, no-store',
    'Content-Disposition': `inline; filename="${d.ref}.pdf"; filename*=UTF-8''${encodeURIComponent(d.fileName)}`,
  } });
});
