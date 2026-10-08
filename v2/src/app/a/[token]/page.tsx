import { prisma } from '@/lib/db';
import { parsePoJson, itemTypes } from '@/lib/drop';
import { BrandBar } from '@/components/Emblem';
import { AckForm } from './AckForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'JIAN CHA · Confirm order', robots: { index: false, follow: false } };

/** Public page behind the "Confirm order received" button — shows only this one order, nothing else. */
export default async function AckPage({ params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token;
  const d = /^[A-Za-z0-9_-]{16,40}$/.test(token) ? await prisma.drop.findUnique({ where: { ackToken: token } }) : null;
  const po = d ? parsePoJson(d.po) : null;
  const item = d ? (await itemTypes()).find(i => i.key === d.item) : undefined;
  return (
    <>
      <div className="topbar"><div className="brand"><BrandBar sub="Order Drop · Supplier" /></div></div>
      <div className="wrap" style={{ maxWidth: 680 }}>
        {!d ? <div className="card"><div className="empty th">ลิงก์ไม่ถูกต้อง / Invalid link</div></div> : <>
          <div className="pagehead"><div><div className="kicker">Order Drop</div><h1 className="th">รับทราบคำสั่งซื้อ · Confirm order received</h1></div></div>
          <div className="card">
            <table><tbody>
              <tr><td className="small muted">PO No.</td><td><b>{d.poNumber || '—'}</b> <span className="small muted">{d.ref}</span></td></tr>
              <tr><td className="small muted">Buyer / Ship to</td><td className="th"><b>{po?.buyer || d.branchName}</b></td></tr>
              <tr><td className="small muted">Item</td><td className="th">{item ? item.label + (item.labelTh ? ' · ' + item.labelTh : '') : d.item}</td></tr>
              {po?.dueDate && po.dueDate !== '-' && <tr><td className="small muted">Due date</td><td>{po.dueDate}</td></tr>}
            </tbody></table>
            {!!po?.lines.length && <div className="tblwrap" style={{ marginTop: '.8rem' }}><table>
              <thead><tr><th>No.</th><th>Ingredient</th><th style={{ textAlign: 'right' }}>Qty</th><th>Unit</th></tr></thead>
              <tbody>{po.lines.map((l, i) => <tr key={i}><td>{i + 1}</td><td className="th">{l.name}</td><td style={{ textAlign: 'right' }}>{l.qty}</td><td>{l.unit}</td></tr>)}</tbody>
            </table></div>}
            <AckForm token={token} ackAt={d.ackAt?.toISOString() || null} ackName={d.ackName} />
          </div>
        </>}
        <div className="foot">JIAN CHA · Order Drop</div>
      </div>
    </>
  );
}
