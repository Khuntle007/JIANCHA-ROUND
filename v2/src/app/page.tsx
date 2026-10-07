import { redirect } from 'next/navigation';
import { requirePage } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const u = await requirePage(undefined, '/');
  const first = ([['calendar', '/calendar'], ['branches', '/branches'], ['orderDrop', '/drops'], ['manageUsers', '/admin/users']] as const).find(([p]) => u.perms[p]);
  redirect(first ? first[1] : '/denied');
}
