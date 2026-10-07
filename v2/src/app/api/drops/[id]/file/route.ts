import fs from 'fs';
import { prisma } from '@/lib/db';
import { route, ApiError } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { dropFile } from '@/lib/drop';

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req: Request, { params }: Ctx) => {
  await requireUser('orderDrop');
  const d = await prisma.drop.findUnique({ where: { id: (await params).id } });
  if (!d || !fs.existsSync(dropFile(d.id))) throw new ApiError(404, 'file missing');
  return new Response(new Uint8Array(fs.readFileSync(dropFile(d.id))), { headers: {
    'Content-Type': 'application/pdf', 'Cache-Control': 'private, no-store',
    'Content-Disposition': `inline; filename="${d.ref}.pdf"; filename*=UTF-8''${encodeURIComponent(d.fileName)}`,
  } });
});
