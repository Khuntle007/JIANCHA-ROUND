import { DOW_TH, DOW_SHORT, sortRounds, roundLabel, type RoundLike } from '@/lib/domain';

/** Weekly table: one row per round, one column per order day (v1 roundsWeekTable). Server- and client-safe. */
export function RoundsTable({ rounds }: { rounds: RoundLike[] }) {
  const list = sortRounds(rounds);
  if (!list.length) return <div className="empty th">ยังไม่มีรอบสั่ง</div>;
  return (
    <div className="tblwrap"><table>
      <thead><tr><th>สินค้า / คลัง</th>{DOW_TH.map(d => <th key={d} style={{ textAlign: 'center' }}>{d}</th>)}</tr></thead>
      <tbody>{list.map((r, i) => (
        <tr key={r.id || i}>
          <td><span className={'tag ' + (r.category === 'dry' ? 'mt' : 'fc')}>{roundLabel(r)}</span> <span className="th small">{r.product}</span></td>
          {DOW_TH.map((_, d) => {
            const s = r.slots.find(x => x.order === d);
            return <td key={d} style={{ textAlign: 'center' }} className="small th">{s ? <>{s.cutoff ? `≤${s.cutoff}` : 'สั่ง'}<div className="muted">รับ {DOW_SHORT[s.deliver]}</div></> : ''}</td>;
          })}
        </tr>
      ))}</tbody>
    </table></div>
  );
}
