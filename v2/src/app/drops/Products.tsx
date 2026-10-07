'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, toast, Modal, useConfirm } from '@/components/client';
import { fmtDateTime } from '@/lib/dates';

type Sup = { id: string; name: string; to: string[]; cc: string[]; products: number };
type Prod = { code: string; name: string; source: string; seen: boolean; bc: boolean; blocked: boolean; suppliers: { id: string; name: string }[] };
type Bc = { configured: boolean; lastSyncAt?: string; count?: number; company?: string; error?: string; failedAt?: string };
const split = (v: string) => v.split(/[,;\s]+/).map(x => x.trim()).filter(Boolean);

export function Products({ settings, bc: bc0 }: { settings: { scmEmails: string[]; reminderHours: number }; bc: Bc }) {
  const [view, setView] = useState<'products' | 'suppliers'>('products');
  const [sups, setSups] = useState<Sup[]>([]), [prods, setProds] = useState<{ products: Prod[]; total: number; all: number } | null>(null), [q, setQ] = useState('');
  const [editP, setEditP] = useState<Prod | 'new' | null>(null), [editS, setEditS] = useState<Sup | 'new' | null>(null);
  const [scm, setScm] = useState(settings.scmEmails.join(', ')), [hours, setHours] = useState(settings.reminderHours), [bc, setBc] = useState(bc0), [syncing, setSyncing] = useState(false);
  const { ask, node } = useConfirm();
  const loadS = useCallback(() => api<{ suppliers: Sup[] }>('/api/suppliers').then(r => setSups(r.suppliers)).catch(e => toast(e.message)), []);
  const loadP = useCallback((qq = q) => api<{ products: Prod[]; total: number; all: number }>('/api/products?q=' + encodeURIComponent(qq)).then(setProds).catch(e => toast(e.message)), [q]);
  useEffect(() => { loadS(); loadP(''); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const mode = (p: Prod) => (!p.suppliers.length ? <span className="muted">ยังไม่ผูก (ใช้กฎตามประเภท)</span> : p.suppliers.length === 1 ? <span className="estat sent">ส่งอัตโนมัติ</span> : <span className="estat wait">SCM ต้องเลือก</span>);

  return (
    <>
      <div className="tabs" style={{ marginTop: '-.4rem' }}>
        <button className={view === 'products' ? 'on' : ''} onClick={() => setView('products')}>รหัสสินค้า</button>
        <button className={view === 'suppliers' ? 'on' : ''} onClick={() => setView('suppliers')}>รายชื่อ Supplier ({sups.length})</button>
      </div>

      {view === 'products' && <>
        <div className="grid2" style={{ gap: '.8rem', marginBottom: '.8rem' }}>
          <div className="card"><div className="kicker" style={{ marginBottom: '.4rem' }}>แจ้งเตือน SCM (สินค้าที่มีหลาย supplier)</div>
            <div className="field"><label>อีเมล SCM</label><input value={scm} placeholder="scm@jianchatea.com" onChange={e => setScm(e.target.value)} /></div>
            <div className="row"><div className="field" style={{ margin: 0 }}><label>เตือนซ้ำทุก (ชม., 0 = ไม่เตือน)</label><input type="number" min={0} max={720} value={hours} onChange={e => setHours(+e.target.value)} style={{ width: 100 }} /></div>
              <button className="btn sm gold" style={{ alignSelf: 'flex-end' }} onClick={async () => { try { await api('/api/drop-settings', { method: 'PUT', body: { scmEmails: split(scm), reminderHours: hours } }); toast('บันทึกแล้ว'); } catch (e) { toast((e as Error).message); } }}>บันทึก</button></div></div>
          <div className="card"><div className="kicker" style={{ marginBottom: '.4rem' }}>Business Central</div>
            {bc.configured ? <div className="small th">
              {bc.lastSyncAt ? <>ซิงก์ล่าสุด {fmtDateTime(bc.lastSyncAt)} · {bc.count} รหัส · {bc.company}</> : 'ยังไม่เคยซิงก์'}
              {bc.error && <div style={{ color: 'var(--bad)' }}>ผิดพลาด: {bc.error}</div>}
            </div> : <div className="small muted th">ยังไม่ได้ตั้งค่า (BC_COMPANY ฯลฯ ใน .env) — รหัสสินค้าจะมาจากใบ PO และที่เพิ่มเองเท่านั้น</div>}
            <button className="btn sm" style={{ marginTop: '.5rem' }} disabled={!bc.configured || syncing} onClick={async () => {
              setSyncing(true);
              try { const r = await api<{ bc: Bc }>('/api/bc/sync', { method: 'POST' }); setBc({ ...bc, ...r.bc }); toast('ซิงก์แล้ว'); loadP(); } catch (e) { toast((e as Error).message); }
              setSyncing(false);
            }}>{syncing ? 'กำลังซิงก์…' : 'ซิงก์ตอนนี้'}</button></div>
        </div>
        <div className="row" style={{ marginBottom: '.6rem' }}>
          <input placeholder="ค้นหารหัส / ชื่อสินค้า (ทั้งแคตตาล็อก)" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') loadP(); }} style={{ flex: 1, minWidth: 200 }} />
          <button className="btn sm" onClick={() => loadP()}>ค้นหา</button>
          <button className="btn sm gold" onClick={() => setEditP('new')}>+ เพิ่มรหัสสินค้าเอง</button>
        </div>
        <div className="small muted th" style={{ marginBottom: '.4rem' }}>{q ? `พบ ${prods?.total ?? 0} รายการ` : `แสดงรหัสที่เคยอยู่ใน PO หรือผูก supplier แล้ว (${prods?.total ?? 0} จากทั้งหมด ${prods?.all ?? 0})`}{(prods?.total || 0) > 100 && ' · แสดง 100 แรก'}</div>
        <div className="card" style={{ padding: 0 }}><div className="tblwrap"><table>
          <thead><tr><th>รหัส</th><th>ชื่อสินค้า</th><th>Supplier</th><th>การส่ง</th><th /></tr></thead>
          <tbody>{prods?.products.length ? prods.products.map(p => (
            <tr key={p.code}><td><code>{p.code}</code></td><td className="th small">{p.name}{p.blocked && <span className="estat failed" style={{ marginLeft: 6 }}>blocked</span>}<div className="muted">{p.source === 'bc' ? 'BC' : p.source === 'manual' ? 'เพิ่มเอง' : 'จาก PO'}</div></td>
              <td className="small">{p.suppliers.map(s => <span key={s.id} className="chip">{s.name}</span>)}</td><td className="small">{mode(p)}</td>
              <td><button className="btn sm ghost" onClick={() => setEditP(p)}>แก้</button></td></tr>
          )) : <tr><td colSpan={5}><div className="empty th">ยังไม่มีรหัสสินค้า — จะขึ้นเองเมื่อมีใบ PO เข้ามา</div></td></tr>}</tbody></table></div></div>
      </>}

      {view === 'suppliers' && <>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: '.6rem' }}><div className="small muted th">แก้อีเมลที่นี่ครั้งเดียว มีผลกับทุกรหัสสินค้าที่ใช้ supplier นี้</div><button className="btn sm gold" onClick={() => setEditS('new')}>+ เพิ่ม supplier</button></div>
        <div className="card" style={{ padding: 0 }}><div className="tblwrap"><table>
          <thead><tr><th>Supplier</th><th>ส่งถึง (To)</th><th>CC</th><th>ใช้กับ</th><th /></tr></thead>
          <tbody>{sups.length ? sups.map(s => (
            <tr key={s.id}><td className="th"><b>{s.name}</b></td><td className="small">{s.to.join(', ')}</td><td className="small">{s.cc.join(', ')}</td><td className="small">{s.products} รหัส</td>
              <td><div className="rowx"><button className="btn sm ghost" onClick={() => setEditS(s)}>แก้</button>
                <button className="btn sm ghost" onClick={() => ask(`ลบ ${s.name}?${s.products ? ` จะถูกเอาออกจาก ${s.products} รหัสสินค้า` : ''}`, async () => { await api(`/api/suppliers/${s.id}`, { method: 'DELETE' }); loadS(); loadP(); }, { danger: true, yes: 'ลบ' })}>ลบ</button></div></td></tr>
          )) : <tr><td colSpan={5}><div className="empty th">ยังไม่มี supplier</div></td></tr>}</tbody></table></div></div>
      </>}

      {editS && <SupplierModal s={editS === 'new' ? null : editS} onClose={() => setEditS(null)} onSaved={() => { setEditS(null); loadS(); loadP(); }} />}
      {editP && <ProductModal p={editP === 'new' ? null : editP} sups={sups} onNewSupplier={loadS} onClose={() => setEditP(null)} onSaved={() => { setEditP(null); loadP(); loadS(); }} />}
      {node}
    </>
  );
}

function SupplierModal({ s, onClose, onSaved }: { s: Sup | null; onClose: () => void; onSaved: (id?: string) => void }) {
  const [name, setName] = useState(s?.name || ''), [to, setTo] = useState(s?.to.join(', ') || ''), [cc, setCc] = useState(s?.cc.join(', ') || '');
  return (
    <Modal title={s ? 'แก้ไข supplier' : 'เพิ่ม supplier'} onClose={onClose} width={480}>
      <div className="field"><label>ชื่อ supplier</label><input value={name} onChange={e => setName(e.target.value)} /></div>
      <div className="field"><label>ส่งถึง (To)</label><input value={to} placeholder="sales@supplier.com" onChange={e => setTo(e.target.value)} /></div>
      <div className="field"><label>สำเนา (CC)</label><input value={cc} placeholder="ไม่บังคับ" onChange={e => setCc(e.target.value)} /></div>
      <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn ghost" onClick={onClose}>ยกเลิก</button>
        <button className="btn gold" onClick={async () => { try {
          const body = { name, to: split(to), cc: split(cc) };
          if (s) { await api(`/api/suppliers/${s.id}`, { method: 'PATCH', body }); onSaved(); } else { const r = await api<{ supplier: Sup }>('/api/suppliers', { body }); onSaved(r.supplier.id); }
          toast('บันทึกแล้ว');
        } catch (e) { toast((e as Error).message); } }}>บันทึก</button></div>
    </Modal>
  );
}

function ProductModal({ p, sups, onNewSupplier, onClose, onSaved }: { p: Prod | null; sups: Sup[]; onNewSupplier: () => void; onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState(p?.code || ''), [name, setName] = useState(p?.name || ''), [sel, setSel] = useState<string[]>(p?.suppliers.map(s => s.id) || []), [sq, setSq] = useState(''), [newSup, setNewSup] = useState(false);
  return (
    <Modal title={p ? `รหัสสินค้า ${p.code}` : 'เพิ่มรหัสสินค้า'} onClose={onClose}>
      <div className="grid2"><div className="field"><label>รหัส</label><input value={code} disabled={!!p} onChange={e => setCode(e.target.value)} placeholder="เช่น 030013" /></div>
        <div className="field"><label>ชื่อสินค้า</label><input value={name} onChange={e => setName(e.target.value)} /></div></div>
      <div className="field"><label>Supplier (1 = ส่งอัตโนมัติ · มากกว่า 1 = SCM เลือกทุกครั้ง)</label>
        <input placeholder="ค้นหา supplier…" value={sq} onChange={e => setSq(e.target.value)} style={{ marginBottom: '.4rem' }} />
        <div className="scopebox">{sups.filter(s => !sq || s.name.toLowerCase().includes(sq.toLowerCase())).map(s => (
          <label key={s.id}><input type="checkbox" checked={sel.includes(s.id)} onChange={e => setSel(e.target.checked ? [...sel, s.id] : sel.filter(x => x !== s.id))} /> {s.name} <span className="muted small">{s.to.join(', ')}</span></label>
        ))}{!sups.length && <div className="small muted">ยังไม่มี supplier</div>}</div>
        <button className="btn sm ghost" style={{ marginTop: '.4rem' }} onClick={() => setNewSup(true)}>+ supplier ใหม่</button></div>
      <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn ghost" onClick={onClose}>ยกเลิก</button>
        <button className="btn gold" onClick={async () => { try { await api(`/api/products/${encodeURIComponent(code.trim())}`, { method: 'PUT', body: { name, supplierIds: sel } }); toast('บันทึกแล้ว'); onSaved(); } catch (e) { toast((e as Error).message); } }}>บันทึก</button></div>
      {newSup && <SupplierModal s={null} onClose={() => setNewSup(false)} onSaved={id => { setNewSup(false); onNewSupplier(); if (id) setSel(x => [...x, id]); }} />}
    </Modal>
  );
}
