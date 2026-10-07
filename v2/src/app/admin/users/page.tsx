import { requirePage } from '@/lib/auth';
import { Shell } from '@/components/Shell';
import { UsersAdmin } from './UsersAdmin';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const u = await requirePage('manageUsers', '/admin/users');
  return <Shell user={u} active="/admin/users"><UsersAdmin me={{ id: u.id, isMain: u.role.key === 'MAIN_ADMIN' }} /></Shell>;
}
