'use client';
import { Fragment, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RoundsTable } from '@/components/RoundsTable';
import { RoundsEditor, BranchEditor } from './editors';
import type { RoundLike } from '@/lib/domain';

type B = { code: string; nameEn: string; nameTh: string; type: string; am: string; active: boolean; rounds: RoundLike[] };

export function BranchList({ branches, canEditBranch, canEditRounds }: { branches: B[]; canEditBranch: boolean; canEditRounds: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState(''), [open, setOpen] = useState<string | null>(null);
  const [editRounds, setEditRounds] = useState<B | null>(null), [adding, setAdding] = useState(false);
  const ql = q.trim().toLowerCase();
  const list = branches.filter(b => !ql || [b.code, b.nameEn, b.nameTh].join(' ').toLowerCase().includes(ql));
  return (
    <>
      <div className="pagehead"><div><div className="kicker">ทะเบียนสาขา</div><h1 className="th">สาขาทั้งหมด ({branches.length})</h1></div>
        {canEditBranch && <button className="btn gold" onClick={() => setAdding(true)}>+ เพิ่มสาขาใหม่</button>}</div>
      <div className="field" style={{ maxWidth: 360 }}><input placeholder="ค้นหารหัส / ชื่อสาขา…" value={q} onChange={e => setQ(e.target.value)} aria-label="ค้นหาสาขา" /></div>
      <div className="card" style={{ padding: 0 }}><div className="tblwrap"><table>
        <thead><tr><th>รหัส</th><th>สาขา</th><th className="hide-sm">ประเภท</th><th className="hide-sm">AM</th><th /></tr></thead>
        <tbody>{list.map(b => (
          <Fragment key={b.code}>
            <tr style={b.active ? undefined : { opacity: .5 }}>
              <td>{b.code}</td>
              <td className="th"><Link href={`/branches/${b.code}`}><b>{b.nameEn}</b></Link>{b.nameTh && <div className="small muted">{b.nameTh}</div>}</td>
              <td className="hide-sm">{b.type && <span className={'tag ' + (b.type === 'MT' ? 'mt' : 'fc')}>{b.type}</span>}</td>
              <td className="hide-sm small th">{b.am}</td>
              <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                {canEditRounds && <button className="btn sm ghost" title="ตั้งค่ารอบ" onClick={() => setEditRounds(b)}>ตั้งค่ารอบ</button>}{' '}
                <button className="btn sm ghost" aria-expanded={open === b.code} onClick={() => setOpen(open === b.code ? null : b.code)}>{open === b.code ? '▴' : '▾'}</button>
              </td>
            </tr>
            {open === b.code && <tr><td colSpan={5} style={{ background: '#faf9f6' }}><RoundsTable rounds={b.rounds} /><div className="small" style={{ marginTop: '.4rem' }}><Link href={`/branches/${b.code}`}>เปิดหน้าสาขา ›</Link></div></td></tr>}
          </Fragment>
        ))}</tbody>
      </table></div></div>
      {editRounds && <RoundsEditor code={editRounds.code} name={editRounds.nameEn} rounds={editRounds.rounds} onClose={() => setEditRounds(null)} onSaved={() => { setEditRounds(null); router.refresh(); }} />}
      {adding && <BranchEditor onClose={() => setAdding(false)} onSaved={code => { setAdding(false); router.push(`/branches/${code}`); }} />}
    </>
  );
}
