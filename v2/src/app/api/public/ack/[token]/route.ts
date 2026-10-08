import { prisma } from '@/lib/db';
import { route, json, ApiError, clientIp, str } from '@/lib/http';
import { hit } from '@/lib/ratelimit';
import { audit } from '@/lib/audit';

type Ctx = { params: Promise<{ token: string }> };

// "Confirm order received" from the supplier email. POST only (the email link opens a page first),
// so mail scanners that prefetch links cannot confirm an order by themselves. First confirmation wins.
export const POST = route(async (req: Request, { params }: Ctx) => {
  const token = (await params).token;
  const ip = await clientIp();
  if (!(await hit(`ack:ip:${ip}`, 30, 60 * 60_000))) throw new ApiError(429, 'ทำรายการบ่อยเกินไป กรุณารอสักครู่');
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(token)) throw new ApiError(404, 'ลิงก์ไม่ถูกต้อง');
  const d = await prisma.drop.findUnique({ where: { ackToken: token }, select: { id: true, ref: true, ackAt: true, ackName: true } });
  if (!d) throw new ApiError(404, 'ลิงก์ไม่ถูกต้อง');
  if (d.ackAt) return json({ ok: true, ackAt: d.ackAt.toISOString(), ackName: d.ackName, already: true });
  const body = await req.json().catch(() => ({})) as { name?: unknown };
  const name = str(body.name, 80);
  const now = new Date();
  const r = await prisma.drop.updateMany({ where: { id: d.id, ackAt: null }, data: { ackAt: now, ackName: name, ackIp: ip } });
  if (r.count) await audit('drop.acknowledged', { target: d.ref, meta: { name, ip } });
  const cur = await prisma.drop.findUniqueOrThrow({ where: { id: d.id }, select: { ackAt: true, ackName: true } });
  return json({ ok: true, ackAt: cur.ackAt!.toISOString(), ackName: cur.ackName });
});
