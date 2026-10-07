'use client';
import { useState } from 'react';
import { api, toast, Modal, DateField, useConfirm } from '@/components/client';
import { DOW_TH, FRESH_TYPES, WAREHOUSES, DOC_TYPES, type RoundLike, type Slot } from '@/lib/domain';
import { todayISO } from '@/lib/dates';
import type { OrderRow } from '@/components/OrdersTable';

/* ───── rounds editor (replaces all rounds of a branch) ───── */
type R = RoundLike & { key: string };
let seq = 0;
const blank = (): R => ({ key: 'n' + seq++, category: 'fresh', warehouse: '', freshType: FRESH_TYPES[0], product: '', slots: [{ order: 0, cutoff: '12:00', deliver: 1 }] });

export function RoundsEditor({ code, name, rounds, addNew, onClose, onSaved }: { code: string; name: string; rounds: RoundLike[]; addNew?: boolean; onClose: () => void; onSaved: () => void }) {
  const [rs, setRs] = useState<R[]>(() => [...rounds.map(r => ({ ...r, slots: r.slots.map(s => ({ ...s })), key: r.id || 'n' + seq++ })), ...(addNew ? [blank()] : [])]);
  const [busy, setBusy] = useState(false);
  const up = (k: string, f: (r: R) => R) => setRs(x => x.map(r => (r.key === k ? f(r) : r)));
  const upSlot = (k: string, i: number, patch: Partial<Slot>) => up(k, r => ({ ...r, slots: r.slots.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  return (
    <Modal title={`ตั้งค่ารอบสั่ง–ส่ง · ${code} ${name}`} onClose={onClose} width={760}>
      {rs.map(r => (
        <div key={r.key} className="roundcard">
          <div className="row" style={{ marginBottom: '.5rem' }}>
            <select className="slotsel" value={r.category} aria-label="ประเภท" onChange={e => up(r.key, x => ({ ...x, category: e.target.value, warehouse: e.target.value === 'dry' ? 'WH001' : '', freshType: e.target.value === 'fresh' ? FRESH_TYPES[0] : '' }))}>
              <option value="dry">ของแห้ง</option><option value="fresh">ของสด</option></select>
            {r.category === 'dry'
              ? <select className="slotsel" value={r.warehouse} aria-label="คลัง" onChange={e => up(r.key, x => ({ ...x, warehouse: e.target.value }))}>{WAREHOUSES.map(w => <option key={w}>{w}</option>)}</select>
              : <select className="slotsel" value={r.freshType} aria-label="ชนิดของสด" onChange={e => up(r.key, x => ({ ...x, freshType: e.target.value }))}>{FRESH_TYPES.map(f => <option key={f}>{f}</option>)}</select>}
            <input style={{ flex: 1, minWidth: 160 }} placeholder="ชื่อสินค้า" value={r.product} aria-label="สินค้า" onChange={e => up(r.key, x => ({ ...x, product: e.target.value }))} />
            <button className="btn sm ghost" onClick={() => setRs(x => x.filter(y => y.key !== r.key))}>ลบรายการ</button>
          </div>
          <div className="slotgrid small th">
            <b>วันสั่ง</b><b>สั่งภายใน</b><b>วันรับของ</b><span />
            {r.slots.map((s, i) => (
              <div key={i} style={{ display: 'contents' }}>
                <select className="slotsel" value={s.order} aria-label="วันสั่ง" onChange={e => upSlot(r.key, i, { order: +e.target.value })}>{DOW_TH.map((d, j) => <option key={j} value={j}>{d}</option>)}</select>
                <input type="time" value={s.cutoff} aria-label="เวลาตัดรอบ" onChange={e => upSlot(r.key, i, { cutoff: e.target.value })} style={{ padding: '.25em' }} />
                <select className="slotsel" value={s.deliver} aria-label="วันรับของ" onChange={e => upSlot(r.key, i, { deliver: +e.target.value })}>{DOW_TH.map((d, j) => <option key={j} value={j}>{d}</option>)}</select>
                <button className="btn sm ghost" onClick={() => up(r.key, x => ({ ...x, slots: x.slots.filter((_, j) => j !== i) }))}>×</button>
              </div>
            ))}
          </div>
          <button className="btn sm ghost" style={{ marginTop: '.4rem' }} onClick={() => up(r.key, x => ({ ...x, slots: [...x.slots, { order: 0, cutoff: x.category === 'dry' ? '15:00' : '12:00', deliver: 1 }] }))}>+ เพิ่มรอบ</button>
        </div>
      ))}
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <button className="btn ghost" onClick={() => setRs(x => [...x, blank()])}>+ เพิ่มสินค้า / คลัง</button>
        <div className="row"><button className="btn ghost" onClick={onClose}>ยกเลิก</button>
          <button className="btn gold" disabled={busy} onClick={async () => {
            if (rs.some(r => !r.product.trim())) { toast('กรอกชื่อสินค้าให้ครบ'); return; }
            setBusy(true);
            try { await api(`/api/branches/${code}/rounds`, { method: 'PUT', body: { rounds: rs.map(({ key: _k, id: _i, ...r }) => r) } }); toast('บันทึกรอบแล้ว'); onSaved(); }
            catch (e) { toast((e as Error).message); setBusy(false); }
          }}>บันทึก</button></div>
      </div>
    </Modal>
  );
}

/* ───── branch add / edit ───── */
type BranchForm = { code: string; nameEn: string; nameTh: string; address: string; phone: string; am: string; company: string; type: string; openDate: string; mallCondition: string; mapUrl: string; active: boolean };
const EMPTY: BranchForm = { code: '', nameEn: '', nameTh: '', address: '', phone: '', am: '', company: 'บริษัท เจี้ยนชา จำกัด', type: '', openDate: '', mallCondition: '', mapUrl: '', active: true };

export function BranchEditor({ branch, onClose, onSaved, onDeleted }: { branch?: BranchForm; onClose: () => void; onSaved: (code: string) => void; onDeleted?: () => void }) {
  const isNew = !branch;
  const [f, setF] = useState<BranchForm>(branch || EMPTY);
  const { ask, node } = useConfirm();
  const set = (k: keyof BranchForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title={isNew ? 'เพิ่มสาขาใหม่' : `แก้ไขข้อมูลสาขา · ${f.code}`} onClose={onClose} width={640}>
      <div className="grid2">
        <div className="field"><label>รหัสสาขา</label><input value={f.code} disabled={!isNew} placeholder={isNew ? 'เว้นว่าง = สร้างอัตโนมัติ' : ''} onChange={set('code')} /></div>
        <div className="field"><label>ประเภท</label><select value={f.type} onChange={set('type')}><option value="">—</option><option value="MT">MT · Modern Trade</option><option value="FC">FC · Franchise</option></select></div>
        <div className="field"><label>ชื่อสาขา (EN) *</label><input value={f.nameEn} onChange={set('nameEn')} /></div>
        <div className="field"><label>ชื่อสาขา (TH)</label><input value={f.nameTh} onChange={set('nameTh')} /></div>
        <div className="field"><label>เบอร์โทร</label><input value={f.phone} onChange={set('phone')} /></div>
        <div className="field"><label>AM</label><input value={f.am} onChange={set('am')} /></div>
        <div className="field"><label>บริษัท</label><input value={f.company} onChange={set('company')} /></div>
        <div className="field"><label>วันเปิดสาขา</label><DateField value={f.openDate} onChange={iso => setF(x => ({ ...x, openDate: iso }))} /></div>
      </div>
      <div className="field"><label>ที่อยู่</label><textarea rows={2} value={f.address} onChange={set('address')} /></div>
      <div className="grid2">
        <div className="field"><label>เงื่อนไขห้าง</label><input value={f.mallCondition} onChange={set('mallCondition')} /></div>
        <div className="field"><label>ลิงก์แผนที่</label><input value={f.mapUrl} placeholder="https://maps…" onChange={set('mapUrl')} /></div>
      </div>
      {!isNew && <div className="field"><label style={{ display: 'flex', gap: '.5rem', alignItems: 'center', textTransform: 'none', letterSpacing: 0 }}><input type="checkbox" checked={f.active} onChange={e => setF({ ...f, active: e.target.checked })} /> เปิดใช้งานสาขา (ปิด = ซ่อนจากปฏิทิน / Order Drop)</label></div>}
      <div className="row" style={{ justifyContent: 'space-between' }}>
        {!isNew && onDeleted ? <button className="btn danger" onClick={() => ask(`ลบสาขา ${f.code}? รอบและออเดอร์ทั้งหมดของสาขานี้จะถูกลบด้วย`, async () => {
          try { await api(`/api/branches/${f.code}`, { method: 'DELETE' }); toast('ลบสาขาแล้ว'); onDeleted(); } catch (e) { toast((e as Error).message); }
        }, { danger: true, yes: 'ลบสาขา' })}>ลบสาขา</button> : <span />}
        <div className="row"><button className="btn ghost" onClick={onClose}>ยกเลิก</button>
          <button className="btn gold" onClick={async () => {
            if (!f.nameEn.trim()) { toast('กรอกชื่อสาขา'); return; }
            try {
              const r = isNew ? await api<{ branch: { code: string } }>('/api/branches', { body: f }) : await api<{ branch: { code: string } }>(`/api/branches/${f.code}`, { method: 'PATCH', body: f });
              toast('บันทึกแล้ว'); onSaved(r.branch.code);
            } catch (e) { toast((e as Error).message); }
          }}>บันทึก</button></div>
      </div>
      {node}
    </Modal>
  );
}

/* ───── order add / edit ───── */
export function OrderEditor({ branchCode, order, onClose, onSaved }: { branchCode: string; order?: OrderRow; onClose: () => void; onSaved: () => void }) {
  const isNew = !order;
  const [o, setO] = useState<Omit<OrderRow, 'id'>>(order || { orderDate: todayISO(), docType: 'PO', docNo: '', category: 'dry', warehouse: 'WH001', freshType: '', product: '', deliveryDate: '', status: 'hold', note: '' });
  const set = (k: keyof OrderRow) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setO({ ...o, [k]: e.target.value });
  return (
    <Modal title={isNew ? 'เพิ่มออเดอร์' : 'แก้ไขออเดอร์'} onClose={onClose}>
      <div className="grid2">
        <div className="field"><label>วันที่สั่ง</label><DateField value={o.orderDate} onChange={iso => setO(x => ({ ...x, orderDate: iso }))} /></div>
        <div className="field"><label>วันส่ง</label><DateField value={o.deliveryDate} onChange={iso => setO(x => ({ ...x, deliveryDate: iso }))} /></div>
        <div className="field"><label>ประเภทเอกสาร</label><select value={o.docType} onChange={set('docType')}>{DOC_TYPES.map(d => <option key={d}>{d}</option>)}</select></div>
        <div className="field"><label>เลขที่เอกสาร</label><input value={o.docNo} onChange={set('docNo')} /></div>
        <div className="field"><label>หมวด</label><select value={o.category} onChange={e => setO({ ...o, category: e.target.value, warehouse: e.target.value === 'dry' ? 'WH001' : '', freshType: e.target.value === 'fresh' ? FRESH_TYPES[0] : '' })}><option value="dry">ของแห้ง</option><option value="fresh">ของสด</option></select></div>
        <div className="field">{o.category === 'dry'
          ? <><label>คลัง</label><select value={o.warehouse} onChange={set('warehouse')}>{WAREHOUSES.map(w => <option key={w}>{w}</option>)}</select></>
          : <><label>ชนิดของสด</label><select value={o.freshType} onChange={set('freshType')}>{FRESH_TYPES.map(f => <option key={f}>{f}</option>)}</select></>}</div>
      </div>
      <div className="field"><label>สินค้า</label><input value={o.product} onChange={set('product')} /></div>
      <div className="grid2">
        <div className="field"><label>สถานะ</label><select value={o.status} onChange={set('status')}><option value="complete">Complete · ได้รับครบ</option><option value="cut">โดนตัด / ส่งไม่ครบ</option><option value="hold">รอชำระเงิน (Hold)</option></select></div>
        {o.status !== 'complete' && <div className="field"><label>หมายเหตุ</label><input value={o.note} onChange={set('note')} /></div>}
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn ghost" onClick={onClose}>ยกเลิก</button>
        <button className="btn gold" onClick={async () => {
          try {
            if (isNew) await api('/api/orders', { body: { ...o, branchCode } }); else await api(`/api/orders/${order!.id}`, { method: 'PATCH', body: o });
            toast('บันทึกออเดอร์แล้ว'); onSaved();
          } catch (e) { toast((e as Error).message); }
        }}>บันทึก</button></div>
    </Modal>
  );
}
