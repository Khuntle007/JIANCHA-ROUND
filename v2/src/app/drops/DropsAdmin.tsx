'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, toast, Modal, copyText, useConfirm } from '@/components/client';
import { fmtDateTime } from '@/lib/dates';

type Drop = { id: string; ref: string; branchCode: string; branchName: string; issuerName: string; item: string; fileName: string; size: number; sourceName: string; createdAt: string; emailStatus: string; emailError: string; emailTo: string };
type Link = { id: string; token: string; name: string; branches: string[]; active: boolean; createdBy: string | null; lastUsedAt: string | null; createdAt: string };
type Item = { key: string; name: string; label: string; supplier: { code: string; name: string }; to: string[]; cc: string[] };
const fmtSize = (n: number) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

function EmailChip({ s, err, to }: { s: string; err: string; to: string }) {
  if (s === 'sent') return <span className="estat sent" title={(JSON.parse(to || '[]') as string[]).join(', ')}>ส่งอีเมลแล้ว</span>;
  if (s === 'dry-run') return <span className="estat wait" title="โหมดทดสอบ — ยังไม่ได้ส่งจริง">ทดสอบ (ไม่ส่งจริง)</span>;
  if (s === 'failed') return <span className="estat failed" title={err}>ส่งไม่สำเร็จ</span>;
  return <span className="estat wait">กำลังส่ง…</span>;
}

export function DropsAdmin(p: { isMain: boolean; appUrl: string; mailFrom: string; dryRun: boolean; drops: Drop[]; links: Link[]; items: Item[]; branches: { code: string; nameEn: string }[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<'drops' | 'links' | 'routing'>('drops');
  const [q, setQ] = useState(''), [itemF, setItemF] = useState('');
  const [editLink, setEditLink] = useState<Link | 'new' | null>(null);
  const [routing, setRouting] = useState(() => p.items.map(i => ({ key: i.key, to: i.to.join(', '), cc: i.cc.join(', ') })));
  const { ask, node } = useConfirm();
  const itemName = (k: string) => p.items.find(i => i.key === k)?.name || k;
  const linkUrl = (l: Link) => `${p.appUrl}/d/${l.token}`;
  const ql = q.toLowerCase();
  const rows = p.drops.filter(d => (!itemF || d.item === itemF) && (!ql || [d.ref, d.branchName, d.branchCode, d.issuerName, d.sourceName, d.fileName].join(' ').toLowerCase().includes(ql)));
  const split = (v: string) => v.split(/[,;\s]+/).map(x => x.trim()).filter(Boolean);

  return (
    <>
      <div className="pagehead"><div><div className="kicker">SCM · Franchise</div><h1>External Order Drop</h1><div className="muted th small">ใบสั่งซื้อ PDF จากสาขาแฟรนไชส์ · ส่งอีเมลอัตโนมัติจาก <b>{p.mailFrom}</b>{p.dryRun && <span style={{ color: 'var(--bad)' }}> · โหมดทดสอบ: ยังไม่ส่งอีเมลจริง</span>}</div></div></div>
      <div className="tabs">
        {([['drops', `ใบสั่งที่ได้รับ (${p.drops.length})`], ['links', `ลิงก์แฟรนไชส์ (${p.links.length})`], ['routing', 'ผู้รับอีเมล']] as const).map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {tab === 'drops' && <>
        <div className="row" style={{ marginBottom: '.7rem' }}>
          <div className="field" style={{ flex: 1, minWidth: 200, margin: 0 }}><input placeholder="ค้นหา ref / สาขา / ผู้สั่ง…" value={q} onChange={e => setQ(e.target.value)} /></div>
          <div className="field" style={{ margin: 0 }}><select value={itemF} onChange={e => setItemF(e.target.value)}><option value="">ทุกรายการ</option>{p.items.map(i => <option key={i.key} value={i.key}>{i.name}</option>)}</select></div>
        </div>
        <div className="card" style={{ padding: 0 }}><div className="tblwrap"><table>
          <thead><tr><th>วันที่</th><th>Ref</th><th>สาขา</th><th>รายการ</th><th>ผู้สั่ง</th><th>ไฟล์</th><th>อีเมล</th><th /></tr></thead>
          <tbody>{rows.length ? rows.map(d => (
            <tr key={d.id}>
              <td className="small" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(d.createdAt)}</td>
              <td style={{ whiteSpace: 'nowrap' }}><b>{d.ref}</b></td>
              <td className="th">{d.branchName}<div className="small muted">{d.branchCode}</div></td>
              <td><span className="tag fc">{itemName(d.item)}</span></td>
              <td className="th">{d.issuerName}<div className="small muted">{d.sourceName}</div></td>
              <td className="small"><a href={`/api/drops/${d.id}/file`} target="_blank" rel="noopener">{d.fileName}</a><div className="muted">{fmtSize(d.size)}</div></td>
              <td><EmailChip s={d.emailStatus} err={d.emailError} to={d.emailTo} /></td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button className="btn sm ghost" onClick={async () => { try { const r = await api<{ emailStatus: string; emailError: string }>(`/api/drops/${d.id}/resend`, { method: 'POST' }); toast(r.emailStatus === 'failed' ? 'ส่งไม่สำเร็จ: ' + r.emailError : 'ส่งอีเมลแล้ว'); router.refresh(); } catch (e) { toast((e as Error).message); } }}>ส่งอีเมลซ้ำ</button>
                {p.isMain && <> <button className="btn sm ghost" onClick={() => ask('ลบใบสั่งนี้และไฟล์ PDF ถาวร?', async () => { await api(`/api/drops/${d.id}`, { method: 'DELETE' }); toast('ลบแล้ว'); router.refresh(); }, { danger: true, yes: 'ลบ' })}>ลบ</button></>}
              </td>
            </tr>
          )) : <tr><td colSpan={8}><div className="empty th">ยังไม่มีใบสั่ง</div></td></tr>}</tbody></table></div></div>
      </>}

      {tab === 'links' && <>
        <div className="card th small" style={{ marginBottom: '.8rem', background: 'var(--warnbg)' }}>แต่ละลิงก์เปิดหน้าส่งใบสั่งได้<b>โดยไม่ต้องล็อกอิน</b> — ใครมีลิงก์ก็ส่งได้ จึงควรสร้าง 1 ลิงก์ต่อร้าน/แฟรนไชส์ และกด “เปลี่ยนลิงก์” หรือ “ปิด” ทันทีถ้าลิงก์หลุด</div>
        <div className="row" style={{ justifyContent: 'flex-end', marginBottom: '.7rem' }}><button className="btn gold" onClick={() => setEditLink('new')}>+ สร้างลิงก์แฟรนไชส์</button></div>
        <div className="card" style={{ padding: 0 }}><div className="tblwrap"><table>
          <thead><tr><th>ชื่อ</th><th>ลิงก์</th><th>สาขาที่ส่งได้</th><th>ใช้ล่าสุด</th><th /></tr></thead>
          <tbody>{p.links.length ? p.links.map(l => (
            <tr key={l.id} style={l.active ? undefined : { opacity: .5 }}>
              <td className="th"><b>{l.name}</b><div className="small muted">{l.active ? 'ใช้งาน' : 'ปิดอยู่'} · สร้างโดย {l.createdBy || '—'}</div></td>
              <td className="small" style={{ maxWidth: 260, wordBreak: 'break-all' }}><code>{linkUrl(l)}</code></td>
              <td className="small th">{l.branches.length ? l.branches.map(c => <span key={c} className="chip">{p.branches.find(b => b.code === c)?.nameEn || c}</span>) : <span className="muted">ทุกสาขา</span>}</td>
              <td className="small">{l.lastUsedAt ? fmtDateTime(l.lastUsedAt) : '—'}</td>
              <td><div className="rowx">
                <button className="btn sm" onClick={() => copyText(linkUrl(l))}>คัดลอก</button>
                <button className="btn sm ghost" onClick={() => setEditLink(l)}>แก้</button>
                <button className="btn sm ghost" onClick={() => ask(`เปลี่ยนลิงก์ของ ${l.name}? ลิงก์เดิมจะใช้ไม่ได้ทันที ต้องส่งลิงก์ใหม่ให้แฟรนไชส์`, async () => { await api(`/api/drop-links/${l.id}`, { method: 'PATCH', body: { rotate: true } }); toast('เปลี่ยนลิงก์แล้ว'); router.refresh(); })}>เปลี่ยนลิงก์</button>
                <button className="btn sm ghost" onClick={() => ask(`ลบลิงก์ ${l.name}? (ใบสั่งเดิมยังเก็บไว้)`, async () => { await api(`/api/drop-links/${l.id}`, { method: 'DELETE' }); router.refresh(); }, { danger: true, yes: 'ลบ' })}>ลบ</button>
              </div></td>
            </tr>
          )) : <tr><td colSpan={5}><div className="empty th">ยังไม่มีลิงก์ — กด “สร้างลิงก์แฟรนไชส์”</div></td></tr>}</tbody></table></div></div>
      </>}

      {tab === 'routing' && <>
        <div className="card" style={{ padding: 0 }}><div className="tblwrap"><table>
          <thead><tr><th>รายการ · ซัพพลายเออร์</th><th>ส่งถึง (To)</th><th>สำเนา (CC)</th></tr></thead>
          <tbody>{p.items.map((i, n) => (
            <tr key={i.key}><td><b>{i.label}</b><div className="small muted th">{i.supplier.name} · {i.supplier.code}</div></td>
              <td style={{ minWidth: 220 }}><input style={{ width: '100%' }} value={routing[n].to} onChange={e => setRouting(r => r.map((x, j) => (j === n ? { ...x, to: e.target.value } : x)))} /></td>
              <td style={{ minWidth: 180 }}><input style={{ width: '100%' }} placeholder="ไม่บังคับ" value={routing[n].cc} onChange={e => setRouting(r => r.map((x, j) => (j === n ? { ...x, cc: e.target.value } : x)))} /></td></tr>
          ))}</tbody></table></div></div>
        <div className="row" style={{ justifyContent: 'space-between', marginTop: '.7rem' }}><div className="small muted th">คั่นหลายอีเมลด้วย , · มีผลกับใบสั่งใหม่ทันที</div>
          <button className="btn gold" onClick={async () => { try { await api('/api/drop-routes', { method: 'PUT', body: { items: routing.map(r => ({ key: r.key, to: split(r.to), cc: split(r.cc) })) } }); toast('บันทึกผู้รับอีเมลแล้ว'); router.refresh(); } catch (e) { toast((e as Error).message); } }}>บันทึกผู้รับอีเมล</button></div>
      </>}

      {editLink && <LinkModal link={editLink === 'new' ? null : editLink} branches={p.branches} onClose={() => setEditLink(null)} onSaved={url => { setEditLink(null); router.refresh(); if (url) copyText(url); }} appUrl={p.appUrl} />}
      {node}
    </>
  );
}

function LinkModal({ link, branches, appUrl, onClose, onSaved }: { link: Link | null; branches: { code: string; nameEn: string }[]; appUrl: string; onClose: () => void; onSaved: (url?: string) => void }) {
  const [name, setName] = useState(link?.name || ''), [sel, setSel] = useState<Set<string>>(new Set(link?.branches || [])), [active, setActive] = useState(link?.active ?? true), [bq, setBq] = useState('');
  return (
    <Modal title={link ? 'แก้ไขลิงก์แฟรนไชส์' : 'สร้างลิงก์แฟรนไชส์'} onClose={onClose}>
      <div className="field"><label>ชื่อร้าน / แฟรนไชส์</label><input value={name} placeholder="เช่น แฟรนไชส์ พัทยา" onChange={e => setName(e.target.value)} /></div>
      {link && <div className="field"><label style={{ display: 'flex', gap: '.5rem', alignItems: 'center', textTransform: 'none', letterSpacing: 0 }}><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> เปิดใช้งานลิงก์</label></div>}
      <div className="field"><label>สาขาที่ส่งใบสั่งได้ <span className="muted" style={{ textTransform: 'none', letterSpacing: 0 }}>(ไม่เลือก = ทุกสาขา)</span></label>
        <input placeholder="ค้นหาสาขา…" value={bq} onChange={e => setBq(e.target.value)} style={{ marginBottom: '.4rem' }} />
        <div className="scopebox">{branches.filter(b => !bq || (b.code + ' ' + b.nameEn).toLowerCase().includes(bq.toLowerCase())).map(b => (
          <label key={b.code}><input type="checkbox" checked={sel.has(b.code)} onChange={e => setSel(s => { const n = new Set(s); if (e.target.checked) n.add(b.code); else n.delete(b.code); return n; })} /> {b.nameEn} <span className="muted small">{b.code}</span></label>
        ))}</div></div>
      <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn ghost" onClick={onClose}>ยกเลิก</button>
        <button className="btn gold" onClick={async () => {
          if (!name.trim()) { toast('กรอกชื่อ'); return; }
          try {
            if (link) { await api(`/api/drop-links/${link.id}`, { method: 'PATCH', body: { name, branches: [...sel], active } }); toast('บันทึกแล้ว'); onSaved(); }
            else { const r = await api<{ link: Link }>('/api/drop-links', { body: { name, branches: [...sel] } }); toast('สร้างลิงก์แล้ว · คัดลอกให้แล้ว'); onSaved(`${appUrl}/d/${r.link.token}`); }
          } catch (e) { toast((e as Error).message); }
        }}>{link ? 'บันทึก' : 'สร้างลิงก์'}</button></div>
    </Modal>
  );
}
