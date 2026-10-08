'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, toast, Modal, copyText, useConfirm } from '@/components/client';
import { fmtDateTime } from '@/lib/dates';
import { Report } from './Report';
import { Products } from './Products';
import { DropsList, type DropRow } from './DropsList';
import { downloadPost } from '@/components/download';

type Drop = DropRow & { notifiedAt: string | null; pendingCode: string; options: { id: string; name: string }[]; lines: { name: string; qty: number; unit: string }[] };
type Link = { id: string; token: string; name: string; branchCode: string | null; active: boolean; createdBy: string | null; lastUsedAt: string | null };
type Item = { key: string; label: string; labelTh: string; to: string[]; cc: string[]; codes: string[]; blocked: boolean; subjectTag: string; skipGlobalCc: boolean };
type Bc = { configured: boolean; lastSyncAt?: string; count?: number; company?: string; error?: string; failedAt?: string };
const split = (v: string) => v.split(/[,;\s]+/).map(x => x.trim()).filter(Boolean);


const isMaster = (l: { branchCode: string | null }) => !!l.branchCode && l.branchCode.startsWith('JC');
type Tab = 'drops' | 'pending' | 'report' | 'products' | 'routing' | 'links' | 'master';

export function DropsAdmin(p: { initialTab?: string; isMain: boolean; appUrl: string; mailFrom: string; dryRun: boolean; drops: Drop[]; links: Link[]; items: Item[];
  settings: { scmEmails: string[]; reminderHours: number; alwaysCc: string[] }; bc: Bc; branches: { code: string; name: string }[]; routingMap: React.ReactNode }) {
  const router = useRouter();
  const pending = p.drops.filter(d => d.emailStatus === 'pending');
  const [tab, setTab] = useState<Tab>((['drops', 'pending', 'report', 'products', 'routing', 'links', 'master'] as Tab[]).includes(p.initialTab as Tab) ? (p.initialTab as Tab) : 'drops');
  const [editLink, setEditLink] = useState<Link | 'new' | null>(null);
  const [routing, setRouting] = useState(() => p.items.map(i => ({ key: i.key, to: i.to.join(', '), cc: i.cc.join(', '), blocked: i.blocked, subjectTag: i.subjectTag, skipGlobalCc: i.skipGlobalCc })));
  const [add, setAdd] = useState({ label: '', labelTh: '', to: '' });
  const [lq, setLq] = useState(''), [lsel, setLsel] = useState<Set<string>>(new Set());
  const { ask, node } = useConfirm();
  const linkUrl = (l: Link) => `${p.appUrl}/d/${l.token}`;
  const tabs: [Tab, string][] = [['drops', `ใบสั่งที่ได้รับ (${p.drops.length})`], ['pending', `รอเลือก supplier (${pending.length})`], ['report', 'รายงาน PO'], ['products', 'สินค้า & Supplier'], ['routing', 'ผู้รับตามประเภท'], ['links', `ลิงก์แฟรนไชส์ (${p.links.filter(l => !isMaster(l)).length})`], ['master', `ลิงก์สำหรับมาสเตอร์ (${p.links.filter(isMaster).length})`]];

  return (
    <>
      <div className="pagehead"><div><div className="kicker">SCM · Franchise</div><h1>External Order Drop</h1><div className="muted th small">ใบ PO (PDF) จากแฟรนไชส์ → อ่านข้อมูลจาก PDF → ส่งอีเมลถึง supplier อัตโนมัติจาก <b>{p.mailFrom}</b>{p.dryRun && <span style={{ color: 'var(--bad)' }}> · โหมดทดสอบ: ยังไม่ส่งอีเมลจริง</span>}</div></div></div>
      <div className="tabs">{tabs.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => { setTab(k); setLsel(new Set()); setLq(''); }}>{l}</button>)}</div>

      {tab === 'drops' && <DropsList drops={p.drops} items={p.items} isMain={p.isMain} onChoose={() => setTab('pending')} />}

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
      {tab === 'products' && <Products settings={p.settings} bc={p.bc} branches={p.branches} />}

      {tab === 'routing' && <>
        {p.routingMap}
        <div className="card th small" style={{ marginBottom: '.8rem' }}>ผู้รับในตารางนี้ใช้เมื่อ<b>รหัสสินค้าใน PO ยังไม่ได้ผูก supplier</b> (คำนำหน้า Subject และ “ไม่ใส่ CC กลาง” ใช้กับทุกอีเมลของประเภทนั้นเสมอ) — — ระบบจับกลุ่มจาก<b>รหัสสินค้า</b>ก่อน แล้วจึงดูจากชื่อสินค้า แล้วส่งตามตารางนี้ (ถ้าผูก supplier แล้ว จะส่งตาม supplier ในแท็บ สินค้า & Supplier แทน) · “Other” เว้นว่างได้ = บันทึกไว้แต่ไม่ส่ง</div>
        <div className="card" style={{ padding: 0 }}><div className="tblwrap"><table>
          <thead><tr><th>ประเภท</th><th>ไม่รับผ่านระบบ</th><th>ส่งถึง (To)</th><th>สำเนา (CC)</th><th>คำนำหน้า Subject</th><th>ไม่ใส่ CC กลาง</th></tr></thead>
          <tbody>{p.items.map((i, n) => (
            <tr key={i.key}><td><b>{i.label}</b><div className="small muted th">{i.labelTh}</div>{i.codes.length > 0 && <div className="small muted">รหัส {i.codes.join(', ')}</div>}</td>
              <td>{i.key !== 'other' && <label className="small th" style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }} title="ติ๊ก = แฟรนไชส์ส่งไม่ได้ (แจ้งให้ติดต่อ Area Manager) — บันทึกไว้เท่านั้น ไม่ส่งต่อ"><input type="checkbox" checked={!!routing[n]?.blocked} onChange={e => setRouting(r => r.map((x, j) => (j === n ? { ...x, blocked: e.target.checked } : x)))} /> บันทึกอย่างเดียว</label>}</td>
              <td style={{ minWidth: 220 }}><input style={{ width: '100%' }} disabled={!!routing[n]?.blocked} value={routing[n]?.to || ''} placeholder={i.key === 'other' ? 'ไม่บังคับ' : ''} onChange={e => setRouting(r => r.map((x, j) => (j === n ? { ...x, to: e.target.value } : x)))} /></td>
              <td style={{ minWidth: 180 }}><input style={{ width: '100%' }} placeholder="ไม่บังคับ" value={routing[n]?.cc || ''} onChange={e => setRouting(r => r.map((x, j) => (j === n ? { ...x, cc: e.target.value } : x)))} /></td>
              <td style={{ minWidth: 130 }}><input style={{ width: '100%' }} placeholder="เช่น FRUIT ORDER" value={routing[n]?.subjectTag || ''} onChange={e => setRouting(r => r.map((x, j) => (j === n ? { ...x, subjectTag: e.target.value } : x)))} /></td>
              <td style={{ textAlign: 'center' }}><input type="checkbox" aria-label="ไม่ใส่ CC กลาง" checked={!!routing[n]?.skipGlobalCc} onChange={e => setRouting(r => r.map((x, j) => (j === n ? { ...x, skipGlobalCc: e.target.checked } : x)))} /></td></tr>
          ))}</tbody></table></div></div>
        <div className="card" style={{ marginTop: '.8rem' }}><div className="kicker" style={{ marginBottom: '.5rem' }}>+ เพิ่มประเภทสินค้า</div>
          <div className="row"><input placeholder="ชื่อ (EN) เช่น Ice hot creamer" value={add.label} onChange={e => setAdd({ ...add, label: e.target.value })} />
            <input placeholder="ชื่อ (TH)" value={add.labelTh} onChange={e => setAdd({ ...add, labelTh: e.target.value })} />
            <input placeholder="อีเมลผู้รับ" value={add.to} onChange={e => setAdd({ ...add, to: e.target.value })} style={{ minWidth: 220 }} /></div></div>
        <div className="row" style={{ justifyContent: 'space-between', marginTop: '.7rem' }}><div className="small muted th">คั่นหลายอีเมลด้วย , · มีผลกับใบสั่งใหม่ทันที</div>
          <button className="btn gold" onClick={async () => { try {
            await api('/api/drop-items', { method: 'PUT', body: { items: routing.map(r => ({ key: r.key, to: split(r.to), cc: split(r.cc), blocked: r.blocked, subjectTag: r.subjectTag, skipGlobalCc: r.skipGlobalCc })), ...(add.label.trim() ? { add: { label: add.label, labelTh: add.labelTh, to: split(add.to) } } : {}) } });
            toast('บันทึกแล้ว'); setAdd({ label: '', labelTh: '', to: '' }); router.refresh(); location.reload();
          } catch (e) { toast((e as Error).message); } }}>บันทึก</button></div>
      </>}

      {(tab === 'links' || tab === 'master') && <>
        <div className="card th small" style={{ marginBottom: '.8rem', background: 'var(--warnbg)' }}>{tab === 'master'
          ? <>ลิงก์สำหรับ<b>สาขามาสเตอร์ (JC)</b> — ใช้ส่งใบ PO ได้อย่างเดียว ไม่ต้องล็อกอิน และไม่เห็นข้อมูลใด ๆ · 1 ลิงก์ต่อสาขา · supplier เลือกตามสาขาของลิงก์ · ถ้าลิงก์หลุดให้กด “เปลี่ยนลิงก์” หรือ “ปิด”</>
          : <>แต่ละลิงก์ใช้<b>ส่งใบ PO ได้อย่างเดียว ไม่ต้องล็อกอิน และไม่เห็นข้อมูลใด ๆ</b> — ควรสร้าง 1 ลิงก์ต่อร้าน/แฟรนไชส์ (ชื่อลิงก์จะแสดงในรายงาน) · ถ้าลิงก์หลุดให้กด “เปลี่ยนลิงก์” หรือ “ปิด”</>}</div>
        {(() => {
          const shown = p.links.filter(l => (tab === 'master') === isMaster(l)).filter(l => !lq || l.name.toLowerCase().includes(lq.toLowerCase()));
          const target = lsel.size ? shown.filter(l => lsel.has(l.id)) : shown; // nothing ticked = all shown
          const allOn = shown.length > 0 && shown.every(l => lsel.has(l.id));
          const copyAll = () => copyText(['รหัสสาขา\tชื่อ\tลิงก์ส่งใบ PO', ...target.map(l => `${l.branchCode || ''}\t${l.name}\t${linkUrl(l)}`)].join('\n'));
          return <>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: '.7rem' }}>
              <input placeholder="ค้นหาสาขา / ชื่อ…" value={lq} onChange={e => setLq(e.target.value)} style={{ minWidth: 240 }} />
              <div className="row">
                <span className="small muted th">{lsel.size ? <>เลือก <b>{lsel.size}</b> · <a href="#" onClick={e => { e.preventDefault(); setLsel(new Set()); }}>ล้าง</a></> : `ทั้งหมดที่แสดง (${shown.length})`}:</span>
                <button className="btn sm" disabled={!target.length} onClick={copyAll} title="คัดลอกเป็นตาราง (วางใน Excel / LINE / อีเมลได้)">คัดลอก {target.length} ลิงก์</button>
                <button className="btn sm" disabled={!target.length} onClick={() => downloadPost('/api/drop-links/export', { ids: target.map(l => l.id) }, 'franchise-links.xlsx')}>Excel</button>
                <button className="btn gold" onClick={() => setEditLink('new')}>{tab === 'master' ? '+ สร้างลิงก์มาสเตอร์' : '+ สร้างลิงก์แฟรนไชส์'}</button>
              </div>
            </div>
            <div className="card" style={{ padding: 0 }}><div className="tblwrap"><table>
              <thead><tr>
                <th style={{ width: 28 }}><input type="checkbox" aria-label="เลือกทั้งหมดที่แสดง" checked={allOn} onChange={e => setLsel(e.target.checked ? new Set([...lsel, ...shown.map(l => l.id)]) : new Set([...lsel].filter(id => !shown.some(l => l.id === id))))} /></th>
                <th>ชื่อ</th><th>ลิงก์</th><th>ใช้ล่าสุด</th><th />
              </tr></thead>
              <tbody>{shown.length ? shown.map(l => (
                <tr key={l.id} style={{ ...(l.active ? {} : { opacity: .5 }), ...(lsel.has(l.id) ? { background: '#F5F4F2' } : {}) }}>
                  <td><input type="checkbox" aria-label={'เลือก ' + l.name} checked={lsel.has(l.id)} onChange={e => setLsel(x => { const n = new Set(x); if (e.target.checked) n.add(l.id); else n.delete(l.id); return n; })} /></td>
                  <td className="th"><b>{l.name}</b><div className="small muted">{l.branchCode ? `สาขา ${l.branchCode} · ` : ''}{l.active ? 'ใช้งาน' : 'ปิดอยู่'} · สร้างโดย {l.createdBy || '—'}</div></td>
                  <td className="small" style={{ maxWidth: 280, wordBreak: 'break-all' }}><code>{linkUrl(l)}</code></td>
                  <td className="small">{l.lastUsedAt ? fmtDateTime(l.lastUsedAt) : '—'}</td>
                  <td><div className="rowx">
                    <button className="btn sm" onClick={() => copyText(linkUrl(l))}>คัดลอก</button>
                    <button className="btn sm ghost" onClick={() => setEditLink(l)}>แก้</button>
                    <button className="btn sm ghost" onClick={() => ask(`เปลี่ยนลิงก์ของ ${l.name}? ลิงก์เดิมจะใช้ไม่ได้ทันที`, async () => { await api(`/api/drop-links/${l.id}`, { method: 'PATCH', body: { rotate: true } }); toast('เปลี่ยนลิงก์แล้ว'); router.refresh(); })}>เปลี่ยนลิงก์</button>
                    <button className="btn sm ghost" onClick={() => ask(`ลบลิงก์ ${l.name}? (ใบสั่งเดิมยังเก็บไว้)`, async () => { await api(`/api/drop-links/${l.id}`, { method: 'DELETE' }); router.refresh(); }, { danger: true, yes: 'ลบ' })}>ลบ</button>
                  </div></td>
                </tr>
              )) : <tr><td colSpan={5}><div className="empty th">ไม่พบลิงก์</div></td></tr>}</tbody></table></div></div>
          </>;
        })()}
      </>}

      {editLink && <LinkModal master={tab === 'master'} branches={p.branches.filter(b => (tab === 'master' ? /^JC/ : /^JF/).test(b.code) && !p.links.some(l => l.branchCode === b.code))} link={editLink === 'new' ? null : editLink} appUrl={p.appUrl} onClose={() => setEditLink(null)} onSaved={url => { setEditLink(null); router.refresh(); if (url) copyText(url); }} />}
      {node}
    </>
  );
}

function LinkModal({ link, appUrl, master, branches, onClose, onSaved }: { link: Link | null; appUrl: string; master: boolean; branches: { code: string; name: string }[]; onClose: () => void; onSaved: (url?: string) => void }) {
  const [name, setName] = useState(link?.name || ''), [active, setActive] = useState(link?.active ?? true), [bc, setBc] = useState('');
  return (
    <Modal title={(link ? 'แก้ไข' : 'สร้าง') + (master ? 'ลิงก์มาสเตอร์' : 'ลิงก์แฟรนไชส์')} onClose={onClose} width={460}>
      {!link && <div className="field"><label>สาขา {master ? '(JC)' : '(JF)'} — ที่ยังไม่มีลิงก์</label>
        <select value={bc} onChange={e => { setBc(e.target.value); const b = branches.find(x => x.code === e.target.value); if (b) setName(`${b.code} ${b.name}`); }}>
          <option value="">{master ? '— เลือกสาขา —' : 'ไม่ผูกสาขา (ใช้ supplier ค่าเริ่มต้น)'}</option>{branches.map(b => <option key={b.code} value={b.code}>{b.code} {b.name}</option>)}</select></div>}
      <div className="field"><label>ชื่อลิงก์</label><input value={name} placeholder={master ? 'เช่น JC002 Dragon town' : 'เช่น แฟรนไชส์ พัทยา'} onChange={e => setName(e.target.value)} /></div>
      {link && <div className="field"><label style={{ display: 'flex', gap: '.5rem', alignItems: 'center', textTransform: 'none', letterSpacing: 0 }}><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> เปิดใช้งานลิงก์</label></div>}
      <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn ghost" onClick={onClose}>ยกเลิก</button>
        <button className="btn gold" onClick={async () => {
          if (!name.trim()) { toast('กรอกชื่อ'); return; }
          if (!link && master && !bc) { toast('เลือกสาขา'); return; }
          try {
            if (link) { await api(`/api/drop-links/${link.id}`, { method: 'PATCH', body: { name, active } }); toast('บันทึกแล้ว'); onSaved(); }
            else { const r = await api<{ link: Link }>('/api/drop-links', { body: { name, branchCode: bc || undefined } }); toast('สร้างลิงก์แล้ว · คัดลอกให้แล้ว'); onSaved(`${appUrl}/d/${r.link.token}`); }
          } catch (e) { toast((e as Error).message); }
        }}>{link ? 'บันทึก' : 'สร้างลิงก์'}</button></div>
    </Modal>
  );
}
