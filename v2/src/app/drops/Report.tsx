'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, toast, DateField } from '@/components/client';
import { MultiSelect } from '@/components/MultiSelect';
import { fmtDateTime } from '@/lib/dates';

type Row = { dropId: string; createdAt: string; day: string; ref: string; poNumber: string; branch: string; itemKey: string; itemLabel: string; issuedDate: string; issuer: string; source: string;
  emailStatus: string; supplier: string; pending: boolean; hasDetail: boolean; no: number | ''; product: string; qty: number | null; unit: string; vat: string; price: number | null; total: number | null };
type Res = { rows: Row[]; truncated: boolean; branches: string[]; sources: string[]; items: { key: string; label: string }[] };
const money = (n: number | null) => (n == null ? '' : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

export function Report() {
  const [f, setF] = useState({ from: '', to: '', q: '', branch: [] as string[], item: [] as string[], link: [] as string[] });
  const [res, setRes] = useState<Res | null>(null), [busy, setBusy] = useState(false);
  const load = useCallback(async (flt = f) => {
    setBusy(true);
    const p = new URLSearchParams();
    if (flt.from) p.set('from', flt.from); if (flt.to) p.set('to', flt.to); if (flt.q) p.set('q', flt.q);
    flt.branch.forEach(v => p.append('branch', v)); flt.item.forEach(v => p.append('item', v)); flt.link.forEach(v => p.append('link', v));
    try { setRes(await api<Res>('/api/drop-report?' + p)); } catch (e) { toast((e as Error).message); }
    setBusy(false);
  }, [f]);
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const csv = () => {
    if (!res) return;
    const head = ['วันที่ส่ง', 'Ref', 'PO', 'สาขา (จาก PO)', 'ประเภท', 'Supplier', 'วันที่ออก PO', 'ลำดับ', 'รายการสินค้า', 'จำนวน', 'หน่วย', 'VAT', 'ราคา', 'รวม', 'ผู้ออกใบสั่ง', 'ลิงก์'];
    const q = (v: unknown) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const body = res.rows.map(r => [r.day, r.ref, r.poNumber, r.branch, r.itemLabel, r.supplier || (r.pending ? 'รอเลือก' : ''), r.issuedDate, r.no, r.product, r.qty ?? '', r.unit, r.vat, r.price ?? '', r.total ?? '', r.issuer, r.source].map(q).join(','));
    const blob = new Blob(['﻿' + [head.map(q).join(','), ...body].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `po-report-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };
  const rows = res?.rows || [];
  const sum = rows.reduce((s, r) => s + (r.total || 0), 0), pos = new Set(rows.map(r => r.poNumber || r.ref)).size;

  return (
    <>
      <div className="card" style={{ marginBottom: '.8rem' }}>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div className="field" style={{ margin: 0, width: 130 }}><label>ตั้งแต่</label><DateField value={f.from} onChange={v => setF({ ...f, from: v })} /></div>
          <div className="field" style={{ margin: 0, width: 130 }}><label>ถึง</label><DateField value={f.to} onChange={v => setF({ ...f, to: v })} /></div>
          <MultiSelect label="สาขา (จาก PO)" options={(res?.branches || []).map(b => ({ value: b, label: b }))} value={f.branch} onChange={v => setF({ ...f, branch: v })} />
          <MultiSelect label="ประเภท" options={(res?.items || []).map(i => ({ value: i.key, label: i.label }))} value={f.item} onChange={v => setF({ ...f, item: v })} />
          <MultiSelect label="ลิงก์ / ร้าน" options={(res?.sources || []).map(s => ({ value: s, label: s }))} value={f.link} onChange={v => setF({ ...f, link: v })} />
          <div className="field" style={{ margin: 0, flex: 1, minWidth: 160 }}><label>ค้นหา</label><input placeholder="PO / ref / สินค้า / สาขา" value={f.q} onChange={e => setF({ ...f, q: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') load(); }} /></div>
          <button className="btn" onClick={() => load()} disabled={busy}>ค้นหา</button>
          <button className="btn ghost" onClick={() => { const e = { from: '', to: '', q: '', branch: [], item: [], link: [] }; setF(e); load(e); }}>ล้าง</button>
          <button className="btn gold" onClick={csv} disabled={!rows.length}>CSV</button>
        </div>
      </div>
      <div className="row small th" style={{ marginBottom: '.5rem', gap: '1.2rem' }}><span><b>{pos}</b> ใบ PO</span><span><b>{rows.filter(r => r.hasDetail).length}</b> รายการ</span><span>มูลค่ารวม <b>{money(sum)}</b></span>{res?.truncated && <span style={{ color: 'var(--bad)' }}>แสดง 5,000 แถวแรก — กรองให้แคบลง</span>}</div>
      <div className="card" style={{ padding: 0 }}><div className="tblwrap"><table>
        <thead><tr><th>วันที่ส่ง</th><th>PO / Ref</th><th>สาขา</th><th>ประเภท → supplier</th><th>สินค้า</th><th style={{ textAlign: 'right' }}>จำนวน</th><th>หน่วย</th><th style={{ textAlign: 'right' }}>ราคา</th><th style={{ textAlign: 'right' }}>รวม</th><th>ผู้ออก</th><th>ลิงก์</th></tr></thead>
        <tbody>{rows.length ? rows.map((r, i) => (
          <tr key={r.dropId + i}>
            <td className="small" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(r.createdAt)}</td>
            <td style={{ whiteSpace: 'nowrap' }}><a href={`/api/drops/${r.dropId}/file`} target="_blank" rel="noopener"><b>{r.poNumber || '—'}</b></a><div className="small muted">{r.ref}</div></td>
            <td className="th small">{r.branch}</td>
            <td className="small">{r.itemLabel}{r.supplier ? <div>→ {r.supplier}</div> : r.pending ? <div style={{ color: '#9a7b12' }}>รอเลือก supplier</div> : null}</td>
            <td className="th small">{r.product || <span className="muted">(ไม่มีรายละเอียด)</span>}</td>
            <td style={{ textAlign: 'right' }}>{r.qty ?? ''}</td><td className="small">{r.unit}</td>
            <td style={{ textAlign: 'right' }} className="small">{money(r.price)}</td><td style={{ textAlign: 'right' }}><b>{money(r.total)}</b></td>
            <td className="th small">{r.issuer}</td><td className="th small">{r.source}</td>
          </tr>
        )) : <tr><td colSpan={11}><div className="empty th">{busy ? 'กำลังโหลด…' : 'ไม่พบข้อมูล'}</div></td></tr>}</tbody></table></div></div>
    </>
  );
}
