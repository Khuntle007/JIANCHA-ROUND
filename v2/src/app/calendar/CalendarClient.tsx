'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, toast, Modal, DateField } from '@/components/client';
import { DOW_TH, lines, lineMatch, slotForOrderDay, type RoundLike } from '@/lib/domain';
import { addDays, monIndex, fmtDate } from '@/lib/dates';

type B = { code: string; nameEn: string; rounds: RoundLike[] };
type H = { date: string; name: string };
type Sp = { date: string; branchCode: string; line: string; newDate: string; note: string };

export function CalendarClient(p: { today: string; canManage: boolean; canBranches: boolean; branches: B[]; holidays: H[]; specials: Sp[] }) {
  const router = useRouter();
  const [month, setMonth] = useState(p.today.slice(0, 7) + '-01');
  const [hol, setHol] = useState<H[]>(p.holidays);
  const [sp, setSp] = useState<Sp[]>(p.specials);
  const [edit, setEdit] = useState<{ date: string; name: string; exists: boolean } | null>(null);
  const [boardLine, setBoardLine] = useState(lines()[0].key);
  const [boardDay, setBoardDay] = useState(monIndex(p.today));

  const [y, m] = month.split('-').map(Number);
  const monthLabel = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('th-TH', { timeZone: 'UTC', month: 'long', year: 'numeric' });
  const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = monIndex(month);
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => addDays(month, i))];
  const holMap = new Map(hol.map(h => [h.date, h.name]));
  const monthHol = hol.filter(h => h.date.slice(0, 7) === month.slice(0, 7)).sort((a, b) => a.date.localeCompare(b.date));
  const shift = (n: number) => { const d = new Date(Date.UTC(y, m - 1 + n, 1)); setMonth(d.toISOString().slice(0, 10)); };

  async function saveHoliday(date: string, name: string) {
    await api(`/api/holidays/${date}`, { method: 'PUT', body: { name } });
    setHol(h => [...h.filter(x => x.date !== date), { date, name: name || 'วันหยุด' }]);
    setEdit(null); toast('บันทึกวันหยุดแล้ว'); router.refresh();
  }
  async function removeHoliday(date: string) {
    await api(`/api/holidays/${date}`, { method: 'DELETE' });
    setHol(h => h.filter(x => x.date !== date)); setSp(s => s.filter(x => x.date !== date));
    setEdit(null); toast('ยกเลิกวันหยุดแล้ว'); router.refresh();
  }
  async function saveSpecial(rec: Sp) {
    try {
      await api('/api/specials', { method: 'PUT', body: rec });
      setSp(s => [...s.filter(x => !(x.date === rec.date && x.branchCode === rec.branchCode && x.line === rec.line)), rec]);
      toast('บันทึกรอบเฉพาะกิจแล้ว');
    } catch (e) { toast((e as Error).message); }
  }

  const boardRows = useMemo(() => {
    const line = lines().find(l => l.key === boardLine)!;
    return p.branches.flatMap(b => {
      const r = b.rounds.find(x => lineMatch(x, line)); // v1: first matching round only
      const s = r && slotForOrderDay(r, boardDay);
      return s ? [{ b, s }] : [];
    });
  }, [p.branches, boardLine, boardDay]);

  return (
    <div className="grid2" style={{ gridTemplateColumns: 'minmax(0,1.25fr) minmax(0,1fr)', gap: '1rem', alignItems: 'start' }}>
      <div>
        <div className="pagehead"><div><div className="kicker">ปฏิทินการดำเนินงาน</div><h1 className="th">วันหยุด &amp; รอบจัดส่งเฉพาะกิจ</h1></div>
          <div className="row"><button className="btn sm ghost" onClick={() => shift(-1)}>‹ เดือนก่อน</button><span className="pill2 th">{monthLabel}</span><button className="btn sm ghost" onClick={() => shift(1)}>เดือนถัดไป ›</button></div></div>
        {p.canManage && <div className="card th small" style={{ background: 'var(--warnbg)', marginBottom: '.8rem' }}>คลิกที่ช่องวันเพื่อ<b>ตั้ง/ยกเลิกวันหยุด</b> — สาขาที่ได้รับผลกระทบจะแสดงทางด้านขวา</div>}
        <div className="card">
          <div className="calgrid">
            {DOW_TH.map(d => <div key={d} className="dow">{d}</div>)}
            {cells.map((d, i) => d === null ? <div key={'e' + i} /> : (
              <div key={d} className={'cell' + (holMap.has(d) ? ' holiday' : '') + (d === p.today ? ' today' : '')}
                style={{ cursor: p.canManage ? 'pointer' : 'default' }}
                onClick={() => p.canManage && setEdit({ date: d, name: holMap.get(d) || '', exists: holMap.has(d) })}>
                <div className="dnum">{Number(d.slice(8))}</div>
                {holMap.has(d) && <><div className="hbadge">●</div><div className="hname">{holMap.get(d)}</div></>}
              </div>
            ))}
          </div>
        </div>

        <div style={{ height: '1.2rem' }} />
        <div className="kicker">ภาพรวมรอบสั่ง</div><h2 className="th" style={{ margin: '.2rem 0 .7rem' }}>บอร์ดรอบสั่ง–รับของ</h2>
        <div className="card">
          <div className="row" style={{ marginBottom: '.6rem' }}>
            {lines().map(l => <button key={l.key} className={'btn sm ' + (boardLine === l.key ? '' : 'ghost')} onClick={() => setBoardLine(l.key)}>{l.label}</button>)}
          </div>
          <div className="row" style={{ marginBottom: '.7rem' }}>
            {DOW_TH.map((d, i) => <button key={d} className={'btn sm ' + (boardDay === i ? '' : 'ghost')} onClick={() => setBoardDay(i)}>{d}</button>)}
          </div>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: '.4rem' }}>
            <div className="th small"><b>{boardLine}</b> · รอบสั่งของวัน{DOW_TH[boardDay]}</div><span className="pill2">{boardRows.length} สาขา</span>
          </div>
          <div className="tblwrap"><table><thead><tr><th>รหัส</th><th>สาขา</th><th>สั่งภายใน</th><th>วันรับของ</th></tr></thead>
            <tbody>{boardRows.length ? boardRows.map(({ b, s }) => (
              <tr key={b.code}><td>{b.code}</td><td className="th">{p.canBranches ? <Link href={`/branches/${b.code}`}>{b.nameEn}</Link> : b.nameEn}</td>
                <td>{s.cutoff ? `≤ ${s.cutoff} น.` : 'ตามรอบ'}</td><td className="th">{DOW_TH[s.deliver]}</td></tr>
            )) : <tr><td colSpan={4}><div className="empty th">ไม่มีรอบสั่งในวันนี้</div></td></tr>}</tbody></table></div>
        </div>
      </div>

      <div>
        <div className="kicker">สาขาที่ได้รับผลกระทบ</div><h2 className="th" style={{ margin: '.2rem 0 .7rem' }}>วันหยุดเดือนนี้</h2>
        {!monthHol.length && <div className="card"><div className="empty th">ไม่มีวันหยุดในเดือนนี้</div></div>}
        {monthHol.map(h => {
          const w = monIndex(h.date);
          const affected = p.branches.filter(b => b.rounds.some(r => r.slots.some(s => s.deliver === w)));
          const groups = lines().map(l => ({ l, list: p.branches.filter(b => b.rounds.some(r => lineMatch(r, l) && r.slots.some(s => s.deliver === w))) }));
          const firstOpen = groups.findIndex(g => g.list.length);
          return (
            <div key={h.date} className="card" style={{ marginBottom: '.8rem' }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div><b className="th">{h.name}</b><div className="muted small th">{fmtDate(h.date)} · วัน{DOW_TH[w]}</div></div>
                <span className="pill2">{affected.length} สาขา</span>
              </div>
              {groups.map((g, gi) => g.list.length ? (
                <details key={g.l.key} className="linegroup" open={gi === firstOpen}>
                  <summary className="th small"><b>{g.l.label}</b> · {g.list.length} สาขา</summary>
                  <div className="tblwrap"><table><thead><tr><th>รหัส</th><th>สาขา</th><th>เลื่อนเป็น</th><th>หมายเหตุ</th></tr></thead><tbody>
                    {g.list.map(b => {
                      const cur = sp.find(x => x.date === h.date && x.branchCode === b.code && x.line === g.l.key) || { date: h.date, branchCode: b.code, line: g.l.key, newDate: '', note: '' };
                      return (
                        <tr key={b.code}><td>{b.code}</td><td className="th">{p.canBranches ? <Link href={`/branches/${b.code}`}>{b.nameEn}</Link> : b.nameEn}</td>
                          <td style={{ minWidth: 120 }}><DateField value={cur.newDate} disabled={!p.canManage} onChange={iso => saveSpecial({ ...cur, newDate: iso })} /></td>
                          <td><input defaultValue={cur.note} disabled={!p.canManage} style={{ width: '100%' }} onBlur={e => e.target.value !== cur.note && saveSpecial({ ...cur, note: e.target.value })} /></td></tr>
                      );
                    })}
                  </tbody></table></div>
                </details>
              ) : null)}
            </div>
          );
        })}
      </div>

      {edit && (
        <Modal title={`วันหยุด · ${fmtDate(edit.date)} (วัน${DOW_TH[monIndex(edit.date)]})`} onClose={() => setEdit(null)} width={440}>
          <div className="field"><label>ชื่อวันหยุด</label>
            <input autoFocus value={edit.name} placeholder="เช่น วันปิยมหาราช" onChange={e => setEdit({ ...edit, name: e.target.value })}
              onKeyDown={e => { if (e.key === 'Enter') saveHoliday(edit.date, edit.name.trim()); }} /></div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            {edit.exists ? <button className="btn danger" onClick={() => removeHoliday(edit.date)}>ลบวันหยุด</button> : <span />}
            <div className="row"><button className="btn ghost" onClick={() => setEdit(null)}>ยกเลิก</button><button className="btn gold" onClick={() => saveHoliday(edit.date, edit.name.trim())}>บันทึก</button></div>
          </div>
        </Modal>
      )}
    </div>
  );
}
