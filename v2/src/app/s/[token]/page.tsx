import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { branchesWithRounds } from '@/lib/load';
import { BrandBar } from '@/components/Emblem';
import { RoundsTable } from '@/components/RoundsTable';
import { OrdersTable } from '@/components/OrdersTable';
import { todayISO, fmtDate } from '@/lib/dates';

export const dynamic = 'force-dynamic';

/** Public read-only branch view. Only this branch's data is ever queried (v1 downloaded the whole DB). */
export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const link = await prisma.shareLink.findUnique({ where: { token: (await params).token } });
  if (!link || link.revokedAt) notFound();
  const [b] = await branchesWithRounds({ code: link.branchCode });
  if (!b) notFound();
  const month = todayISO().slice(0, 7);
  const orders = await prisma.order.findMany({ where: { branchCode: b.code, orderDate: { startsWith: month } }, orderBy: { orderDate: 'desc' } });
  return (
    <>
      <div className="topbar"><div className="brand"><BrandBar sub="Rounds · Branch view" /></div><div className="spacer" /><div className="who"><span className="th">มุมมองสำหรับสาขา</span></div></div>
      <div className="wrap">
        <div className="pagehead"><div><div className="kicker">{b.code} · ลิงก์เฉพาะสาขา</div><h1 className="th">{b.nameEn}</h1>{b.nameTh && <div className="muted th">{b.nameTh}</div>}</div></div>
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="small th">{b.address || '—'}{b.phone && ` · โทร ${b.phone}`}{b.am && ` · AM ${b.am}`}{b.openDate && ` · เปิด ${fmtDate(b.openDate)}`}</div>
        </div>
        <div className="card" style={{ marginBottom: '1rem' }}><div className="kicker" style={{ marginBottom: '.6rem' }}>รอบสั่ง–รับของ</div><RoundsTable rounds={b.rounds} /></div>
        <div className="card"><div className="kicker" style={{ marginBottom: '.4rem' }}>ออเดอร์เดือนนี้</div>
          <OrdersTable orders={orders.map(o => ({ id: o.id, orderDate: o.orderDate, docType: o.docType, docNo: o.docNo, category: o.category, warehouse: o.warehouse, freshType: o.freshType, product: o.product, deliveryDate: o.deliveryDate, status: o.status, note: o.note }))} /></div>
        <div className="foot">JIAN CHA · ลิงก์นี้แสดงเฉพาะข้อมูลสาขา {b.code} และออเดอร์เดือนปัจจุบันเท่านั้น</div>
      </div>
    </>
  );
}
