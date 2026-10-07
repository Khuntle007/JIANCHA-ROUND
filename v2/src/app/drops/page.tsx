import { prisma } from '@/lib/db';
import { requirePage } from '@/lib/auth';
import { Shell } from '@/components/Shell';
import { itemTypes, parsePoJson, parseRoute } from '@/lib/drop';
import { dropSettings, bcStatus } from '@/lib/settings';
import { bcConfigured } from '@/lib/bc';
import { env } from '@/lib/env';
import { DropsAdmin } from './DropsAdmin';

export const dynamic = 'force-dynamic';

export default async function DropsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const u = await requirePage('orderDrop', '/drops');
  const [drops, links, items, settings, bc] = await Promise.all([
    prisma.drop.findMany({ orderBy: { createdAt: 'desc' }, take: 1000 }),
    prisma.dropLink.findMany({ orderBy: { createdAt: 'asc' } }),
    itemTypes(), dropSettings(), bcStatus(),
  ]);
  return (
    <Shell user={u} active="/drops">
      <DropsAdmin initialTab={(await searchParams).tab} isMain={u.role.key === 'MAIN_ADMIN'} appUrl={env.appUrl} mailFrom={env.mailSender} dryRun={env.mailDryRun}
        settings={settings} bc={{ ...bc, configured: bcConfigured() }} items={items}
        drops={drops.map(d => {
          const po = parsePoJson(d.po), r = parseRoute(d.route);
          return { id: d.id, ref: d.ref, poNumber: d.poNumber, branchName: d.branchName, issuerName: d.issuerName, item: d.item, fileName: d.fileName, size: d.size, sourceName: d.sourceName,
            createdAt: d.createdAt.toISOString(), emailStatus: d.emailStatus, emailError: d.emailError, emailTo: d.emailTo, notifiedAt: d.notifiedAt?.toISOString() || null,
            supplierName: r?.kind === 'supplier' ? r.supplierName : '', chosenBy: r?.kind === 'supplier' ? r.chosenBy || '' : '',
            pendingCode: r?.kind === 'pending' ? r.code : '', options: r?.kind === 'pending' ? r.options.map(o => ({ id: o.id, name: o.name })) : [],
            lines: po?.lines.map(l => ({ name: l.name, qty: l.qty, unit: l.unit })) || [] };
        })}
        links={links.map(l => ({ id: l.id, token: l.token, name: l.name, active: l.active, createdBy: l.createdBy, lastUsedAt: l.lastUsedAt?.toISOString() || null }))} />
    </Shell>
  );
}
