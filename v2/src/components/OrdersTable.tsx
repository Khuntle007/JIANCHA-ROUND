import { FRESH_TYPES, statusMeta } from '@/lib/domain';
import { fmtDate } from '@/lib/dates';

export type OrderRow = { id: string; orderDate: string; docType: string; docNo: string; category: string; warehouse: string; freshType: string; product: string; deliveryDate: string; status: string; note: string };

/** Grouped orders (dry, then each fresh type), newest first. Editing controls are injected by the caller. */
export function OrdersTable({ orders, actions, onStatus }: { orders: OrderRow[]; actions?: (o: OrderRow) => React.ReactNode; onStatus?: (o: OrderRow) => void }) {
  const groups = [{ key: 'dry', label: 'ของแห้ง', f: (o: OrderRow) => o.category === 'dry' }, ...FRESH_TYPES.map(t => ({ key: t, label: t, f: (o: OrderRow) => o.category === 'fresh' && o.freshType === t }))];
  const sorted = [...orders].sort((a, b) => b.orderDate.localeCompare(a.orderDate));
  const shown = groups.map(g => ({ ...g, list: sorted.filter(g.f) })).filter(g => g.list.length);
  const other = sorted.filter(o => !groups.some(g => g.f(o)));
  if (other.length) shown.push({ key: 'other', label: 'อื่น ๆ', f: () => true, list: other });
  if (!shown.length) return <div className="empty th">ยังไม่มีออเดอร์</div>;
  return (<>{shown.map(g => (
    <div key={g.key} style={{ marginBottom: '.8rem' }}>
      <div className="kicker" style={{ margin: '.4rem 0' }}>{g.label} · {g.list.length}</div>
      <div className="tblwrap"><table><thead><tr><th>วันที่สั่ง</th><th>เอกสาร</th><th>สินค้า</th><th>วันส่ง</th><th>สถานะ</th><th>หมายเหตุ</th>{actions && <th />}</tr></thead>
        <tbody>{g.list.map(o => { const st = statusMeta(o.status); return (
          <tr key={o.id}>
            <td className="small" style={{ whiteSpace: 'nowrap' }}>{fmtDate(o.orderDate)}</td>
            <td className="small" style={{ whiteSpace: 'nowrap' }}><b>{o.docType}</b> {o.docNo}{o.warehouse ? <div className="muted">{o.warehouse}</div> : null}</td>
            <td className="th small">{o.product}</td>
            <td className="small" style={{ whiteSpace: 'nowrap' }}>{o.deliveryDate ? fmtDate(o.deliveryDate) : '—'}</td>
            <td>{onStatus ? <button className={'status ' + st.cls} title="คลิกเพื่อเปลี่ยนสถานะ" onClick={() => onStatus(o)}>{st.label}</button> : <span className={'status ' + st.cls}>{st.label}</span>}</td>
            <td className="th small">{o.note}</td>
            {actions && <td style={{ whiteSpace: 'nowrap' }}>{actions(o)}</td>}
          </tr>); })}</tbody></table></div>
    </div>
  ))}</>);
}
