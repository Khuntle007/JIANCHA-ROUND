import { prisma } from '@/lib/db';
import { route, body, json, ApiError, str } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { isISODate } from '@/lib/dates';
import { audit } from '@/lib/audit';

type Ctx = { params: Promise<{ date: string }> };

export const PUT = route(async (req: Request, { params }: Ctx) => {
  const me = await requireUser('manageHolidays');
  const date = (await params).date;
  if (!isISODate(date)) throw new ApiError(400, 'วันที่ไม่ถูกต้อง');
  const name = str((await body(req)).name, 120) || 'วันหยุด';
  await prisma.holiday.upsert({ where: { date }, create: { date, name }, update: { name } });
  await audit('holiday.set', { actor: me, target: date, meta: { name } });
  return json({ ok: true });
});

/** Removing a holiday also removes its rescheduled-delivery records (v1 behaviour). */
export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const me = await requireUser('manageHolidays');
  const date = (await params).date;
  await prisma.$transaction([prisma.special.deleteMany({ where: { date } }), prisma.holiday.deleteMany({ where: { date } })]);
  await audit('holiday.removed', { actor: me, target: date });
  return json({ ok: true });
});
