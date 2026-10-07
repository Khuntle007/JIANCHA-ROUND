import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requirePage } from '@/lib/auth';
import { branchesWithRounds } from '@/lib/load';
import { Shell } from '@/components/Shell';
import { addDays, todayISO } from '@/lib/dates';
import { BranchDetail } from './BranchDetail';

export const dynamic = 'force-dynamic';

export default async function BranchPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const u = await requirePage('branches', `/branches/${code}`);
  const [b] = await branchesWithRounds({ code });
  if (!b) notFound();
  const since = addDays(todayISO(), -365);
  const orders = u.perms.orders
    ? await prisma.order.findMany({ where: { branchCode: code, orderDate: { gte: since } }, orderBy: { orderDate: 'desc' } })
    : [];
  return (
    <Shell user={u} active="/branches">
      <BranchDetail branch={b} today={todayISO()} perms={u.perms}
        orders={orders.map(o => ({ id: o.id, orderDate: o.orderDate, docType: o.docType, docNo: o.docNo, category: o.category, warehouse: o.warehouse, freshType: o.freshType, product: o.product, deliveryDate: o.deliveryDate, status: o.status, note: o.note }))} />
    </Shell>
  );
}
