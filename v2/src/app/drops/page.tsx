import { prisma } from '@/lib/db';
import { requirePage } from '@/lib/auth';
import { Shell } from '@/components/Shell';
import { routes } from '@/lib/drop';
import { env } from '@/lib/env';
import { DropsAdmin } from './DropsAdmin';

export const dynamic = 'force-dynamic';

export default async function DropsPage() {
  const u = await requirePage('orderDrop', '/drops');
  const [drops, links, items, branches] = await Promise.all([
    prisma.drop.findMany({ orderBy: { createdAt: 'desc' }, take: 1000 }),
    prisma.dropLink.findMany({ orderBy: { createdAt: 'asc' } }),
    routes(),
    prisma.branch.findMany({ where: { active: true }, orderBy: { code: 'asc' }, select: { code: true, nameEn: true } }),
  ]);
  return (
    <Shell user={u} active="/drops">
      <DropsAdmin isMain={u.role.key === 'MAIN_ADMIN'} appUrl={env.appUrl} mailFrom={env.mailSender} dryRun={env.mailDryRun} branches={branches}
        drops={drops.map(d => ({ id: d.id, ref: d.ref, branchCode: d.branchCode, branchName: d.branchName, issuerName: d.issuerName, item: d.item, fileName: d.fileName, size: d.size, sourceName: d.sourceName, createdAt: d.createdAt.toISOString(), emailStatus: d.emailStatus, emailError: d.emailError, emailTo: d.emailTo }))}
        links={links.map(l => ({ id: l.id, token: l.token, name: l.name, branches: JSON.parse(l.branches) as string[], active: l.active, createdBy: l.createdBy, lastUsedAt: l.lastUsedAt?.toISOString() || null, createdAt: l.createdAt.toISOString() }))}
        items={items} />
    </Shell>
  );
}
