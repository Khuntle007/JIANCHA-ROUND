import { prisma } from '@/lib/db';
import { route, body, json, ApiError, str } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { isISODate } from '@/lib/dates';

export const PUT = route(async (req: Request) => {
  await requireUser('manageHolidays');
  const b = await body(req);
  const date = str(b.date, 10), branchCode = str(b.branchCode, 12), line = str(b.line, 40);
  const newDate = str(b.newDate, 10), note = str(b.note, 300);
  if (!isISODate(date) || !branchCode || !line) throw new ApiError(400, 'ข้อมูลไม่ครบ');
  if (newDate && !isISODate(newDate)) throw new ApiError(400, 'วันที่เลื่อนไม่ถูกต้อง');
  await prisma.special.upsert({
    where: { date_branchCode_line: { date, branchCode, line } },
    create: { date, branchCode, line, newDate, note }, update: { newDate, note },
  });
  return json({ ok: true });
});
