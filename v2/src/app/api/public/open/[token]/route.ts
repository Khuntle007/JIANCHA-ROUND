import { prisma } from '@/lib/db';

// 1×1 transparent GIF loaded by the supplier email → "opened" indication (image-blocking / prefetch make it approximate).
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token;
  if (/^[A-Za-z0-9_-]{10,40}$/.test(token)) {
    const now = new Date();
    const d = await prisma.drop.findUnique({ where: { openToken: token }, select: { id: true, openedAt: true } }).catch(() => null);
    if (d) await prisma.drop.update({ where: { id: d.id }, data: { openedAt: d.openedAt ?? now, lastOpenedAt: now, openCount: { increment: 1 } } }).catch(() => {});
  }
  return new Response(new Uint8Array(GIF), { headers: { 'Content-Type': 'image/gif', 'Content-Length': String(GIF.length), 'Cache-Control': 'no-store, no-cache, must-revalidate, private', Pragma: 'no-cache' } });
}
