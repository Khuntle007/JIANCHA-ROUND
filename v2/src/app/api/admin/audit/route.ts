import { prisma } from '@/lib/db';
import { route, json } from '@/lib/http';
import { requireUser } from '@/lib/auth';

export const GET = route(async () => {
  await requireUser('manageUsers');
  return json({ logs: await prisma.auditLog.findMany({ orderBy: { id: 'desc' }, take: 300 }) });
});
