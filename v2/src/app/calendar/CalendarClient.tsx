'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, toast, Modal, DateField } from '@/components/client';
import { DOW_TH, lines, lineMatch, slotForOrderDay, type RoundLike } from '@/lib/domain';
import { addDays, monIndex, fmtDate } from '@/lib/dates';
import { FRESH_TYPES } from '@/lib/domain';

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
  // schedule view: product filter, optional single-branch month view, selected day
  const [prod, setProd] = useState<string>('fresh'); // 'fresh' | 'dry' | 'all' | line key
  const [branch, setBranch] = useState('');
  const [day, setDay] = useState(p.today);

  const [y, m] = month.split('-').map(Number);
  const monthLabel = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('th-TH', { timeZone: 'UTC', month: 'long', year: 'numeric' });
  const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = monIndex(month);
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => addDays(month, i))];
  const holMap = new Map(hol.map(h => [h.date, h.name]));
  const monthHol = hol.filter(h => h.date.slice(0, 7) === month.slice(0, 7)).sort((a, b) => a.date.localeCompare(b.date));
  const shift = (n: number) => { const d = new Date(Date.UTC(y, m - 1 + n, 1)); setMonth(d.toISOString().slice(0, 10)); };

  const LINES = lines();
  const lineOf = (r: RoundLike) => LINES.find(l => lineMatch(r, l));
  const prodOk = (r: RoundLike) => prod === 'all' || (prod === 'fresh' ? r.category === 'fresh' : prod === 'dry' ? r.category === 'dry' : lineOf(r)?.key === prod);
  const shortName = (r: RoundLike) => r.category === 'dry' ? r.warehouse : r.product.replace('วิปปิ้งครีม / ครีมชีส', 'วิป/ครีมชีส').replace('นมเมจิ (ทำไอติม)', 'นมเมจิ');
  const scope = useMemo(() => p.branches.filter(b => !branch || b.code === branch), [p.branches, branch]);
  type Ev = { b: B; r: RoundLike; other: string }; // other = delivery date (for orders) / order date (for receipts)
  /** Who must order / who receives on a date — weekly rounds, cut-off per slot, Sunday-safe date math. */
  const eventsOn = (iso: string) => {
    const w = monIndex(iso), ord: Ev[] = [], rec: Ev[] = [];
    for (const b of scope) for (const r of b.rounds) {
      if (!prodOk(r)) continue;
      for (const sl of r.slots) {
        if (sl.order === w) ord.push({ b, r, other: addDays(iso, (sl.deliver - sl.order + 7) % 7 || 7) });
        if (sl.deliver === w) rec.push({ b, r, other: addDays(iso, -((sl.deliver - sl.order + 7) % 7 || 7)) });
      }
    }
    return { ord, rec };
  };
  const counts = useMemo(() => {
    const m = new Map<number, { o: number; r: number; po: Set<string>; pr: Set<string> }>();
    for (let w = 0; w < 7; w++) m.set(w, { o: 0, r: 0, po: new Set(), pr: new Set() });
    for (const b of scope) for (const r of b.rounds) if (prodOk(r)) for (const sl of r.slots) {
      const a = m.get(sl.order)!, c = m.get(sl.deliver)!;
      a.po.add(b.code + '|' + shortName(r)); c.pr.add(b.code + '|' + shortName(r));
    }
    for (const v of m.values()) { v.o = new Set([...v.po].map(x => x.split('|')[0])).size; v.r = new Set([...v.pr].map(x => x.split('|')[0])).size; }
    return m;
  }, [scope, prod]); // eslint-disable-line react-hooks/exhaustive-deps
  const chips = (w: number) => { const c = counts.get(w)!; return { o: [...new Set([...c.po].map(x => x.split('|')[1]))], r: [...new Set([...c.pr].map(x => x.split('|')[1]))] }; };
  const today = eventsOn(day);
  const group = (evs: Ev[]) => { const g = new Map<string, Ev[]>(); for (const e of evs) { const k = shortName(e.r); g.set(k, [...(g.get(k) || []), e]); } return [...g].sort((a, b) => a[0].localeCompare(b[0], 'th')); };
  const special = (date: string, b: B, r: RoundLike) => sp.find(x => x.date === date && x.branchCode === b.code && x.line === lineOf(r)?.key);

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
    <div className="callayout">
      <div>
        <div className="pagehead"><div><div className="kicker">ปฏิทินการดำเนินงาน</div><h1 className="th">วันหยุด &amp; รอบจัดส่งเฉพาะกิจ</h1></div>
          <div className="row"><button className="btn sm ghost" onClick={() => shift(-1)}>‹ เดือนก่อน</button><span className="pill2 th">{monthLabel}</span><button className="btn sm ghost" onClick={() => shift(1)}>เดือนถัดไป ›</button></div></div>
        <div className="card" style={{ marginBottom: '.8rem', padding: '.8rem 1rem' }}>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div className="field" style={{ margin: 0 }}><label>สินค้า</label>
              <select value={prod} onChange={e => setProd(e.target.value)}>
                <option value="fresh">ของสดทั้งหมด</option>{FRESH_TYPES.map(f => <option key={f} value={f}>{f}</option>)}
                <option value="dry">ของแห้ง / Frozen ทั้งหมด</option>{LINES.filter(l => l.cat === 'dry').map(l => <option key={l.key} value={l.key}>{l.key}</option>)}
                <option value="all">ทุกสินค้า</option>
              </select></div>
            <div className="field" style={{ margin: 0, minWidth: 220 }}><label>สาขา (ปฏิทินรายสาขา)</label>
              <select value={branch} onChange={e => setBranch(e.target.value)}><option value="">ทุกสาขา (จำนวนสาขาที่สั่ง/รับ)</option>{p.branches.map(b => <option key={b.code} value={b.code}>{b.code} {b.nameEn}</option>)}</select></div>
            <div className="small muted th" style={{ flex: 1, minWidth: 200 }}>ตัดรอบสั่ง <b>12:00 น.</b> ทุกรายการ · อาทิตย์ปิด · คลิกวันที่เพื่อดูรายชื่อสาขาที่ต้องสั่ง / รับของ</div>
          </div>
        </div>
        <div className="card">
          <div className="calgrid">
            {DOW_TH.map(d => <div key={d} className="dow">{d}</div>)}
            {cells.map((d, i) => d === null ? <div key={'e' + i} /> : (() => {
              const w = monIndex(d), c = counts.get(w)!, ch = chips(w);
              return (
                <div key={d} className={'cell' + (holMap.has(d) ? ' holiday' : '') + (d === p.today ? ' today' : '') + (d === day ? ' sel' : '')}
                  onClick={() => setDay(d)} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') setDay(d); }} aria-label={`${fmtDate(d)} สั่ง ${c.o} รับ ${c.r}`}>
                  <div className="dnum">{Number(d.slice(8))}</div>
                  {holMap.has(d) && <><div className="hbadge">●</div><div className="hname">{holMap.get(d)}</div></>}
                  {branch ? (
                    <div className="cellchips">
                      {ch.o.length > 0 && <div><span className="cc-o">สั่ง</span> {ch.o.join(' · ')}</div>}
                      {ch.r.length > 0 && <div><span className="cc-r">รับ</span> {ch.r.join(' · ')}</div>}
                    </div>
                  ) : (c.o || c.r) ? <div className="cellcount"><span className="cc-o">สั่ง {c.o}</span><span className="cc-r">รับ {c.r}</span></div> : null}
                </div>
              );
            })())}
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
        <div className="card dayplan" style={{ marginBottom: '1rem' }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div><div className="kicker">แผนสั่ง–รับของ</div><h2 className="th" style={{ margin: '.2rem 0 0' }}>วัน{DOW_TH[monIndex(day)]} {fmtDate(day)}</h2>
              <div className="small muted th">{branch ? `${branch} ${p.branches.find(b => b.code === branch)?.nameEn || ''}` : 'ทุกสาขา'} · {prod === 'fresh' ? 'ของสดทั้งหมด' : prod === 'dry' ? 'ของแห้ง / Frozen' : prod === 'all' ? 'ทุกสินค้า' : prod}</div></div>
            {p.canManage && <button className="btn sm ghost" onClick={() => setEdit({ date: day, name: holMap.get(day) || '', exists: holMap.has(day) })}>{holMap.has(day) ? 'แก้วันหยุด' : 'ตั้งเป็นวันหยุด'}</button>}
          </div>
          {holMap.has(day) && <div className="th small" style={{ background: 'var(--badbg)', color: 'var(--bad)', padding: '.5rem .7rem', margin: '.6rem 0 0' }}>วันหยุด: <b>{holMap.get(day)}</b> — ตรวจรอบที่ตรงวันนี้และกำหนดวันเลื่อนในรายการ “วันหยุดเดือนนี้” ด้านล่าง</div>}
          {monIndex(day) === 6 && <div className="small muted th" style={{ marginTop: '.6rem' }}>วันอาทิตย์ — ปิด ไม่มีรอบสั่ง/ส่ง</div>}
          {([['ต้องสั่งวันนี้ (ก่อน 12:00 น.)', today.ord, 'รับ'], ['รับของวันนี้', today.rec, 'สั่งเมื่อ']] as const).map(([title, evs, verb]) => (
            <div key={title} style={{ marginTop: '.9rem' }}>
              <div className="row" style={{ justifyContent: 'space-between' }}><b className="th small">{title}</b><span className="pill2">{new Set(evs.map(e => e.b.code)).size} สาขา</span></div>
              {!evs.length ? <div className="small muted th" style={{ padding: '.3rem 0' }}>—</div> : group(evs).map(([name, list]) => (
                <details key={name} className="linegroup" open={!!branch || group(evs).length === 1}>
                  <summary className="th small"><b>{name}</b> · {list.length} สาขา</summary>
                  <div className="tblwrap"><table><tbody>{list.map((e, i) => {
                    const target = verb === 'รับ' ? e.other : day, hit = holMap.has(target), spc = hit ? special(target, e.b, e.r) : undefined;
                    return (
                      <tr key={e.b.code + i}><td style={{ whiteSpace: 'nowrap' }}>{e.b.code}</td><td className="th">{p.canBranches ? <Link href={`/branches/${e.b.code}`}>{e.b.nameEn}</Link> : e.b.nameEn}</td>
                        <td className="small th" style={{ whiteSpace: 'nowrap' }}>{verb} {DOW_TH[monIndex(e.other)]} {fmtDate(e.other)}
                          {hit && <div style={{ color: 'var(--bad)' }}>ส่งตรงวันหยุด{spc?.newDate ? ` → เลื่อน ${fmtDate(spc.newDate)}` : ''}</div>}</td></tr>
                    );
                  })}</tbody></table></div>
                </details>
              ))}
            </div>
          ))}
        </div>

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
