'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, toast, Modal, copyText, useConfirm } from '@/components/client';
import { fmtDateTime } from '@/lib/dates';
import { Report } from './Report';
import { Products } from './Products';

type Drop = { id: string; ref: string; poNumber: string; branchName: string; issuerName: string; item: string; fileName: string; size: number; sourceName: string; createdAt: string;
  emailStatus: string; emailError: string; emailTo: string; notifiedAt: string | null; supplierName: string; chosenBy: string; pendingCode: string; options: { id: string; name: string }[]; lines: { name: string; qty: number; unit: string }[] };
type Link = { id: string; token: string; name: string; active: boolean; createdBy: string | null; lastUsedAt: string | null };
type Item = { key: string; label: string; labelTh: string; to: string[]; cc: string[] };
type Bc = { configured: boolean; lastSyncAt?: string; count?: number; company?: string; error?: string; failedAt?: string };
const fmtSize = (n: number) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
const split = (v: string) => v.split(/[,;\s]+/).map(x => x.trim()).filter(Boolean);

function EmailChip({ d }: { d: Drop }) {
  if (d.emailStatus === 'sent') return <span className="estat sent" title={(JSON.parse(d.emailTo || '[]') as string[]).join(', ')}>ส่งอีเมลแล้ว</span>;
  if (d.emailStatus === 'dry-run') return <span className="estat wait" title="โหมดทดสอบ — ยังไม่ได้ส่งจริง">ทดสอบ (ไม่ส่งจริง)</span>;
  if (d.emailStatus === 'failed') return <span className="estat failed" title={d.emailError}>ส่งไม่สำเร็จ</span>;
  if (d.emailStatus === 'pending') return <span className="estat wait">รอเลือก supplier</span>;
  return <span className="estat wait">กำลังส่ง…</span>;
}

type Tab = 'drops' | 'pending' | 'report' | 'products' | 'routing' | 'links';

export function DropsAdmin(p: { initialTab?: string; isMain: boolean; appUrl: string; mailFrom: string; dryRun: boolean; drops: Drop[]; links: Link[]; items: Item[];
  settings: { scmEmails: string[]; reminderHours: number }; bc: Bc }) {
  const router = useRouter();
  const pending = p.drops.filter(d => d.emailStatus === 'pending');
  const [tab, setTab] = useState<Tab>((['drops', 'pending', 'report', 'products', 'routing', 'links'] as Tab[]).includes(p.initialTab as Tab) ? (p.initialTab as Tab) : 'drops');
  const [q, setQ] = useState(''), [itemF, setItemF] = useState('');
  const [editLink, setEditLink] = useState<Link | 'new' | null>(null);
  const [routing, setRouting] = useState(() => p.items.map(i => ({ key: i.key, to: i.to.join(', '), cc: i.cc.join(', ') })));
  const [add, setAdd] = useState({ label: '', labelTh: '', to: '' });
  const { ask, node } = useConfirm();
  const itemLabel = (k: string) => p.items.find(i => i.key === k)?.label || k;
  const linkUrl = (l: Link) => `${p.appUrl}/d/${l.token}`;
  const ql = q.toLowerCase();
  const rows = p.drops.filter(d => (!itemF || d.item === itemF) && (!ql || [d.ref, d.poNumber, d.branchName, d.issuerName, d.sourceName, d.fileName, d.supplierName].join(' ').toLowerCase().includes(ql)));
  const tabs: [Tab, string][] = [['drops', `ใบสั่งที่ได้รับ (${p.drops.length})`], ['pending', `รอเลือก supplier (${pending.length})`], ['report', 'รายงาน PO'], ['products', 'สินค้า & Supplier'], ['routing', 'ผู้รับตามประเภท'], ['links', `ลิงก์แฟรนไชส์ (${p.links.length})`]];

  return (
    <>
      <div className="pagehead"><div><div className="kicker">SCM · Franchise</div><h1>External Order Drop</h1><div className="muted th small">ใบ PO (PDF) จากแฟรนไชส์ → อ่านข้อมูลจาก PDF → ส่งอีเมลถึง supplier อัตโนมัติจาก <b>{p.mailFrom}</b>{p.dryRun && <span style={{ color: 'var(--bad)' }}> · โหมดทดสอบ: ยังไม่ส่งอีเมลจริง</span>}</div></div></div>
      <div className="tabs">{tabs.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>

      {tab === 'drops' && <>
        <div className="row" style={{ marginBottom: '.7rem' }}>
          <div className="field" style={{ flex: 1, minWidth: 200, margin: 0 }}><input placeholder="ค้นหา PO / ref / สาขา / supplier…" value={q} onChange={e => setQ(e.target.value)} /></div>
          <div className="field" style={{ margin: 0 }}><select value={itemF} onChange={e => setItemF(e.target.value)}><option value="">ทุกประเภท</option>{p.items.map(i => <option key={i.key} value={i.key}>{i.label}</option>)}</select></div>
        </div>
        <div className="card" style={{ padding: 0 }}><div className="tblwrap"><table>
          <thead><tr><th>วันที่</th><th>PO / Ref</th><th>สาขา (จาก PO)</th><th>ประเภท → supplier</th><th>ผู้ออก PO</th><th>ไฟล์</th><th>อีเมล</th><th /></tr></thead>
          <tbody>{rows.length ? rows.map(d => (
            <tr key={d.id}>
              <td className="small" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(d.createdAt)}</td>
              <td style={{ whiteSpace: 'nowrap' }}><b>{d.poNumber || '—'}</b><div className="small muted">{d.ref}</div></td>
              <td className="th">{d.branchName}</td>
              <td><span className="tag fc">{itemLabel(d.item)}</span>{d.supplierName && <div className="small">→ {d.supplierName}{d.chosenBy && <span className="muted"> (เลือกโดย {d.chosenBy})</span>}</div>}</td>
              <td className="th small">{d.issuerName}<div className="muted">{d.sourceName}</div></td>
              <td className="small"><a href={`/api/drops/${d.id}/file`} target="_blank" rel="noopener">{d.fileName}</a><div className="muted">{fmtSize(d.size)}</div></td>
              <td><EmailChip d={d} /></td>
              <td style={{ whiteSpace: 'nowrap' }}>
                {d.emailStatus === 'pending' ? <button className="btn sm gold" onClick={() => setTab('pending')}>เลือก supplier</button>
                  : <button className="btn sm ghost" onClick={async () => { try { const r = await api<{ emailStatus: string; emailError: string }>(`/api/drops/${d.id}/resend`, { method: 'POST' }); toast(r.emailStatus === 'failed' ? 'ส่งไม่สำเร็จ: ' + r.emailError : 'ส่งอีเมลแล้ว'); router.refresh(); } catch (e) { toast((e as Error).message); } }}>ส่งอีเมลซ้ำ</button>}
                {p.isMain && <> <button className="btn sm ghost" onClick={() => ask('ลบใบสั่งนี้และไฟล์ PDF ถาวร?', async () => { await api(`/api/drops/${d.id}`, { method: 'DELETE' }); toast('ลบแล้ว'); router.refresh(); }, { danger: true, yes: 'ลบ' })}>ลบ</button></>}
              </td>
            </tr>
          )) : <tr><td colSpan={8}><div className="empty th">ยังไม่มีใบสั่ง</div></td></tr>}</tbody></table></div></div>
      </>}

      {tab === 'pending' && <>
        {!pending.length && <div className="card"><div className="empty th">ไม่มีรายการที่รอเลือก supplier</div></div>}
        {pending.map(d => (
          <div key={d.id} className="card" style={{ marginBottom: '.8rem' }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div><b>{d.poNumber}</b> <span className="muted small">· {d.ref} · {fmtDateTime(d.createdAt)}</span><div className="small th">{d.branchName} · ผู้ออก {d.issuerName} · รหัสสินค้า <code>{d.pendingCode}</code></div>
                <div className="small muted">{d.notifiedAt ? `แจ้ง SCM ทางอีเมลแล้ว ${fmtDateTime(d.notifiedAt)}` : 'ยังไม่ได้แจ้ง SCM ทางอีเมล (ตั้งอีเมล SCM ในแท็บ สินค้า & Supplier)'}</div></div>
              <a className="btn sm ghost" href={`/api/drops/${d.id}/file`} target="_blank" rel="noopener">เปิดไฟล์ PO</a>
            </div>
            <div className="tblwrap" style={{ margin: '.6rem 0' }}><table><thead><tr><th>รายการ</th><th>จำนวน</th><th>หน่วย</th></tr></thead>
              <tbody>{d.lines.map((l, i) => <tr key={i}><td className="th small">{l.name}</td><td>{l.qty}</td><td>{l.unit}</td></tr>)}</tbody></table></div>
            <div className="row"><span className="small th">ส่งให้:</span>{d.options.map(o => (
              <button key={o.id} className="btn sm gold" onClick={() => ask(`ส่ง ${d.poNumber} (${d.pendingCode}) ให้ ${o.name}?`, async () => {
                try { const r = await api<{ emailStatus: string; emailError: string }>(`/api/drops/${d.id}/choose`, { body: { supplierId: o.id } }); toast(r.emailStatus === 'failed' ? 'ส่งไม่สำเร็จ: ' + r.emailError : `ส่งให้ ${o.name} แล้ว`); router.refresh(); } catch (e) { toast((e as Error).message); }
              })}>{o.name}</button>))}</div>
          </div>
        ))}
      </>}

      {tab === 'report' && <Report />}
      {tab === 'products' && <Products settings={p.settings} bc={p.bc} />}

      {tab === 'routing' && <>
        <div className="card th small" style={{ marginBottom: '.8rem' }}>ใช้เมื่อ<b>รหัสสินค้าใน PO ยังไม่ได้ผูก supplier</b> — ระบบจับประเภทจากชื่อสินค้าแล้วส่งตามตารางนี้ (ถ้าผูก supplier แล้ว จะส่งตาม supplier ในแท็บ สินค้า & Supplier แทน) · “Other” เว้นว่างได้ = บันทึกไว้แต่ไม่ส่ง</div>
        <div className="card" style={{ padding: 0 }}><div className="tblwrap"><table>
          <thead><tr><th>ประเภท</th><th>ส่งถึง (To)</th><th>สำเนา (CC)</th></tr></thead>
          <tbody>{p.items.map((i, n) => (
            <tr key={i.key}><td><b>{i.label}</b><div className="small muted th">{i.labelTh}</div></td>
              <td style={{ minWidth: 220 }}><input style={{ width: '100%' }} value={routing[n]?.to || ''} placeholder={i.key === 'other' ? 'ไม่บังคับ' : ''} onChange={e => setRouting(r => r.map((x, j) => (j === n ? { ...x, to: e.target.value } : x)))} /></td>
              <td style={{ minWidth: 180 }}><input style={{ width: '100%' }} placeholder="ไม่บังคับ" value={routing[n]?.cc || ''} onChange={e => setRouting(r => r.map((x, j) => (j === n ? { ...x, cc: e.target.value } : x)))} /></td></tr>
          ))}</tbody></table></div></div>
        <div className="card" style={{ marginTop: '.8rem' }}><div className="kicker" style={{ marginBottom: '.5rem' }}>+ เพิ่มประเภทสินค้า</div>
          <div className="row"><input placeholder="ชื่อ (EN) เช่น Ice hot creamer" value={add.label} onChange={e => setAdd({ ...add, label: e.target.value })} />
            <input placeholder="ชื่อ (TH)" value={add.labelTh} onChange={e => setAdd({ ...add, labelTh: e.target.value })} />
            <input placeholder="อีเมลผู้รับ" value={add.to} onChange={e => setAdd({ ...add, to: e.target.value })} style={{ minWidth: 220 }} /></div></div>
        <div className="row" style={{ justifyContent: 'space-between', marginTop: '.7rem' }}><div className="small muted th">คั่นหลายอีเมลด้วย , · มีผลกับใบสั่งใหม่ทันที</div>
          <button className="btn gold" onClick={async () => { try {
            await api('/api/drop-items', { method: 'PUT', body: { items: routing.map(r => ({ key: r.key, to: split(r.to), cc: split(r.cc) })), ...(add.label.trim() ? { add: { label: add.label, labelTh: add.labelTh, to: split(add.to) } } : {}) } });
            toast('บันทึกแล้ว'); setAdd({ label: '', labelTh: '', to: '' }); router.refresh(); location.reload();
          } catch (e) { toast((e as Error).message); } }}>บันทึก</button></div>
      </>}

      {tab === 'links' && <>
        <div className="card th small" style={{ marginBottom: '.8rem', background: 'var(--warnbg)' }}>แต่ละลิงก์ใช้<b>ส่งใบ PO ได้อย่างเดียว ไม่ต้องล็อกอิน และไม่เห็นข้อมูลใด ๆ</b> — ควรสร้าง 1 ลิงก์ต่อร้าน/แฟรนไชส์ (ชื่อลิงก์จะแสดงในรายงาน) · ถ้าลิงก์หลุดให้กด “เปลี่ยนลิงก์” หรือ “ปิด”</div>
        <div className="row" style={{ justifyContent: 'flex-end', marginBottom: '.7rem' }}><button className="btn gold" onClick={() => setEditLink('new')}>+ สร้างลิงก์แฟรนไชส์</button></div>
        <div className="card" style={{ padding: 0 }}><div className="tblwrap"><table>
          <thead><tr><th>ชื่อ</th><th>ลิงก์</th><th>ใช้ล่าสุด</th><th /></tr></thead>
          <tbody>{p.links.length ? p.links.map(l => (
            <tr key={l.id} style={l.active ? undefined : { opacity: .5 }}>
              <td className="th"><b>{l.name}</b><div className="small muted">{l.active ? 'ใช้งาน' : 'ปิดอยู่'} · สร้างโดย {l.createdBy || '—'}</div></td>
              <td className="small" style={{ maxWidth: 280, wordBreak: 'break-all' }}><code>{linkUrl(l)}</code></td>
              <td className="small">{l.lastUsedAt ? fmtDateTime(l.lastUsedAt) : '—'}</td>
              <td><div className="rowx">
                <button className="btn sm" onClick={() => copyText(linkUrl(l))}>คัดลอก</button>
                <button className="btn sm ghost" onClick={() => setEditLink(l)}>แก้</button>
                <button className="btn sm ghost" onClick={() => ask(`เปลี่ยนลิงก์ของ ${l.name}? ลิงก์เดิมจะใช้ไม่ได้ทันที`, async () => { await api(`/api/drop-links/${l.id}`, { method: 'PATCH', body: { rotate: true } }); toast('เปลี่ยนลิงก์แล้ว'); router.refresh(); })}>เปลี่ยนลิงก์</button>
                <button className="btn sm ghost" onClick={() => ask(`ลบลิงก์ ${l.name}? (ใบสั่งเดิมยังเก็บไว้)`, async () => { await api(`/api/drop-links/${l.id}`, { method: 'DELETE' }); router.refresh(); }, { danger: true, yes: 'ลบ' })}>ลบ</button>
              </div></td>
            </tr>
          )) : <tr><td colSpan={4}><div className="empty th">ยังไม่มีลิงก์ — กด “สร้างลิงก์แฟรนไชส์”</div></td></tr>}</tbody></table></div></div>
      </>}

      {editLink && <LinkModal link={editLink === 'new' ? null : editLink} appUrl={p.appUrl} onClose={() => setEditLink(null)} onSaved={url => { setEditLink(null); router.refresh(); if (url) copyText(url); }} />}
      {node}
    </>
  );
}

function LinkModal({ link, appUrl, onClose, onSaved }: { link: Link | null; appUrl: string; onClose: () => void; onSaved: (url?: string) => void }) {
  const [name, setName] = useState(link?.name || ''), [active, setActive] = useState(link?.active ?? true);
  return (
    <Modal title={link ? 'แก้ไขลิงก์แฟรนไชส์' : 'สร้างลิงก์แฟรนไชส์'} onClose={onClose} width={460}>
      <div className="field"><label>ชื่อร้าน / แฟรนไชส์</label><input value={name} placeholder="เช่น แฟรนไชส์ พัทยา" onChange={e => setName(e.target.value)} /></div>
      {link && <div className="field"><label style={{ display: 'flex', gap: '.5rem', alignItems: 'center', textTransform: 'none', letterSpacing: 0 }}><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> เปิดใช้งานลิงก์</label></div>}
      <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn ghost" onClick={onClose}>ยกเลิก</button>
        <button className="btn gold" onClick={async () => {
          if (!name.trim()) { toast('กรอกชื่อ'); return; }
          try {
            if (link) { await api(`/api/drop-links/${link.id}`, { method: 'PATCH', body: { name, active } }); toast('บันทึกแล้ว'); onSaved(); }
            else { const r = await api<{ link: Link }>('/api/drop-links', { body: { name } }); toast('สร้างลิงก์แล้ว · คัดลอกให้แล้ว'); onSaved(`${appUrl}/d/${r.link.token}`); }
          } catch (e) { toast((e as Error).message); }
        }}>{link ? 'บันทึก' : 'สร้างลิงก์'}</button></div>
    </Modal>
  );
}
