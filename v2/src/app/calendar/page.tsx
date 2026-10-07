import { prisma } from '@/lib/db';
import { requirePage } from '@/lib/auth';
import { branchesWithRounds } from '@/lib/load';
import { Shell } from '@/components/Shell';
import { todayISO } from '@/lib/dates';
import { CalendarClient } from './CalendarClient';

export const dynamic = 'force-dynamic';

export default async function CalendarPage() {
  const u = await requirePage('calendar', '/calendar');
  const [branches, holidays, specials] = await Promise.all([
    branchesWithRounds(), prisma.holiday.findMany({ orderBy: { date: 'asc' } }), prisma.special.findMany(),
  ]);
  return (
    <Shell user={u} active="/calendar">
      <CalendarClient today={todayISO()} canManage={u.perms.manageHolidays} canBranches={u.perms.branches}
        branches={branches.filter(b => b.active).map(b => ({ code: b.code, nameEn: b.nameEn, rounds: b.rounds }))}
        holidays={holidays.map(h => ({ date: h.date, name: h.name }))}
        specials={specials.map(s => ({ date: s.date, branchCode: s.branchCode, line: s.line, newDate: s.newDate, note: s.note }))} />
    </Shell>
  );
}
