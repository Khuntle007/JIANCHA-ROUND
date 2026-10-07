import { requirePage } from '@/lib/auth';
import { branchesWithRounds } from '@/lib/load';
import { Shell } from '@/components/Shell';
import { BranchList } from './BranchList';

export const dynamic = 'force-dynamic';

export default async function BranchesPage() {
  const u = await requirePage('branches', '/branches');
  const branches = await branchesWithRounds();
  return (
    <Shell user={u} active="/branches">
      <BranchList branches={branches.map(b => ({ code: b.code, nameEn: b.nameEn, nameTh: b.nameTh, type: b.type, am: b.am, active: b.active, rounds: b.rounds }))}
        canEditBranch={u.perms.editBranch} canEditRounds={u.perms.editRounds} />
    </Shell>
  );
}
