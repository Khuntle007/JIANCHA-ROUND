'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, toast, useConfirm } from '@/components/client';
import { downloadPost } from '@/components/download';
import { fmtDateTime } from '@/lib/dates';

export type DropRow = { id: string; ref: string; poNumber: string; branchCode: string; branchName: string; issuerName: string; item: string; fileName: string; size: number; sourceName: string;
  createdAt: string; emailStatus: string; emailError: string; emailTo: string; emailCc: string; openedAt: string | null; lastOpenedAt: string | null; openCount: number;
  supplierName: string; chosenBy: string };

const STATUS: Record<string, string> = { sent: 'ส่งอีเมลแล้ว', 'dry-run': 'ทดสอบ (ไม่ส่งจริง)', failed: 'ส่งไม่สำเร็จ', pending: 'รอเลือก supplier', blocked: 'ไม่ส่งต่อ (บันทึกเท่านั้น)', queued: 'กำลังส่ง', sending: 'กำลังส่ง' };
const fmtSize = (n: number) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
const list = (s: string) => { try { return (JSON.parse(s) as string[]).join(', '); } catch { return ''; } };
const bkkDay = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });

function EmailChip({ d }: { d: DropRow }) {
  const cls = d.emailStatus === 'sent' ? 'sent' : d.emailStatus === 'failed' || d.emailStatus === 'blocked' ? 'failed' : 'wait';
  const title = d.emailStatus === 'failed' ? d.emailError : d.emailStatus === 'sent' ? `ถึง: ${list(d.emailTo)}${list(d.emailCc) ? ` · CC: ${list(d.emailCc)}` : ''}` : '';
  return <span className={'estat ' + cls} title={title}>{STATUS[d.emailStatus] || d.emailStatus}</span>;
}
function OpenChip({ d }: { d: DropRow }) {
  if (d.emailStatus !== 'sent') return <span className="muted small">—</span>;
  if (!d.openedAt) return <span className="small muted" title="ยังไม่พบการเปิด (อีเมลบางระบบบล็อกรูปภาพ จึงอาจเปิดแล้วแต่ตรวจไม่พบ)">ยังไม่พบการเปิด</span>;
  return <span className="estat sent" title={`เปิดครั้งแรก ${fmtDateTime(d.openedAt)} · ล่าสุด ${d.lastOpenedAt ? fmtDateTime(d.lastOpenedAt) : '-'} · ${d.openCount} ครั้ง (เป็นการประมาณ)`}>เปิดแล้ว {fmtDateTime(d.openedAt)}</span>;
}

type SortKey = 'createdAt' | 'po' | 'branch' | 'item' | 'supplier' | 'issuer' | 'file' | 'status' | 'opened';
type F = { from: string; to: string; po: string; branch: string; item: string; supplier: string; issuer: string; file: string; status: string; opened: string };
const EMPTY: F = { from: '', to: '', po: '', branch: '', item: '', supplier: '', issuer: '', file: '', status: '', opened: '' };

export function DropsList({ drops, items, isMain, onChoose }: { drops: DropRow[]; items: { key: string; label: string }[]; isMain: boolean; onChoose: () => void }) {
  const router = useRouter();
  const { ask, node } = useConfirm();
  const [f, setF] = useState<F>(EMPTY);
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: 'createdAt', dir: -1 });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState('');
  const label = (k: string) => items.find(i => i.key === k)?.label || k;
  const has = (v: string, q: string) => !q || v.toLowerCase().includes(q.toLowerCase());

  const rows = useMemo(() => {
    const val: Record<SortKey, (d: DropRow) => string | number> = {
      createdAt: d => d.createdAt, po: d => d.poNumber + d.ref, branch: d => d.branchCode + d.branchName, item: d => label(d.item), supplier: d => d.supplierName,
      issuer: d => d.issuerName + d.sourceName, file: d => d.fileName, status: d => STATUS[d.emailStatus] || d.emailStatus, opened: d => d.openedAt || '',
    };
    return drops.filter(d => {
      const day = bkkDay(d.createdAt);
      return (!f.from || day >= f.from) && (!f.to || day <= f.to) && has(d.poNumber + ' ' + d.ref, f.po) && has(d.branchCode + ' ' + d.branchName, f.branch)
        && (!f.item || d.item === f.item) && has(d.supplierName, f.supplier) && has(d.issuerName + ' ' + d.sourceName, f.issuer) && has(d.fileName, f.file)
        && (!f.status || d.emailStatus === f.status) && (!f.opened || (f.opened === 'yes' ? !!d.openedAt : d.emailStatus === 'sent' && !d.openedAt));
    }).sort((a, b) => { const x = val[sort.k](a), y = val[sort.k](b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir; });
  }, [drops, f, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  const target = sel.size ? rows.filter(r => sel.has(r.id)) : rows; // nothing ticked = everything currently shown
  const ids = target.map(r => r.id);
  const allOn = rows.length > 0 && rows.every(r => sel.has(r.id));
  const set = (k: keyof F) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const H = ({ k, children, w }: { k: SortKey; children: React.ReactNode; w?: number }) => (
    <th style={{ cursor: 'pointer', whiteSpace: 'nowrap', minWidth: w }} onClick={() => setSort(s => ({ k, dir: s.k === k ? (-s.dir as 1 | -1) : 1 }))} aria-sort={sort.k === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      {children} <span style={{ opacity: sort.k === k ? 1 : .25 }}>{sort.k === k && sort.dir === 1 ? '▲' : '▼'}</span></th>
  );
  const run = async (kind: string, fn: () => Promise<void>) => { setBusy(kind); try { await fn(); } finally { setBusy(''); } };
  const printTable = () => {
    const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
    const w = window.open('', '_blank');
    if (!w) { toast('เบราว์เซอร์บล็อกหน้าต่างใหม่'); return; }
    const body = target.map(d => `<tr><td>${esc(fmtDateTime(d.createdAt))}</td><td><b>${esc(d.poNumber || '—')}</b><br><small>${esc(d.ref)}</small></td><td>${esc(d.branchCode)} ${esc(d.branchName)}</td><td>${esc(label(d.item))}</td><td>${esc(d.supplierName)}</td><td>${esc(d.issuerName)}<br><small>${esc(d.sourceName)}</small></td><td>${esc(STATUS[d.emailStatus] || d.emailStatus)}</td><td>${d.openedAt ? esc(fmtDateTime(d.openedAt)) : '—'}</td></tr>`).join('');
    w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>Order Drop · ${esc(new Date().toLocaleDateString('th-TH'))}</title>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@100..125,400..700&family=Noto+Sans+Thai:wght@400;600&display=swap">
      <style>@page{size:A4 landscape;margin:12mm}body{font-family:'Noto Sans Thai','Archivo',sans-serif;color:#181818;font-size:10px;margin:0}
      .bar{background:#181818;color:#fff;padding:10px 14px;border-bottom:2px solid #AD9C82;display:flex;align-items:center;gap:12px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .bar img{height:16px}.bar span{color:#AD9C82;font:600 9px 'Archivo';font-stretch:125%;letter-spacing:.2em}
      h1{font:700 14px 'Archivo';font-stretch:125%;text-transform:uppercase;margin:12px 0 2px}p{margin:0 0 8px;color:#525252}
      table{width:100%;border-collapse:collapse}th{background:#EBE9E6;text-align:left;font:600 8px 'Archivo';font-stretch:125%;letter-spacing:.06em;text-transform:uppercase;padding:5px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      td{border-bottom:1px solid #EBE9E6;padding:5px;vertical-align:top}small{color:#525252}</style></head><body>
      <div class="bar"><img src="${location.origin}/brand/jiancha-logo-white.png" alt="JIAN CHA"><span>ORDER DROP</span></div>
      <h1>ใบสั่งที่ได้รับ</h1><p>${target.length} รายการ · พิมพ์ ${esc(fmtDateTime(new Date().toISOString()))}</p>
      <table><thead><tr><th>วันที่</th><th>PO / Ref</th><th>สาขา</th><th>ประเภท</th><th>Supplier</th><th>ผู้ออก PO</th><th>อีเมล</th><th>เปิดอีเมล</th></tr></thead><tbody>${body}</tbody></table>
      <script>window.onload=()=>setTimeout(()=>window.print(),400)</script></body></html>`);
    w.document.close();
  };

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: '.6rem' }}>
        <div className="small th">แสดง <b>{rows.length}</b> จาก {drops.length} รายการ{sel.size > 0 && <> · เลือก <b>{sel.size}</b> <a href="#" onClick={e => { e.preventDefault(); setSel(new Set()); }}>ล้าง</a></>}
          {JSON.stringify(f) !== JSON.stringify(EMPTY) && <> · <a href="#" onClick={e => { e.preventDefault(); setF(EMPTY); }}>ล้างตัวกรอง</a></>}</div>
        <div className="row">
          <span className="small muted th">ส่งออก{sel.size ? 'ที่เลือก' : 'ทั้งหมดที่แสดง'} ({target.length}):</span>
          <button className="btn sm" disabled={!target.length || !!busy} onClick={() => run('xlsx', () => downloadPost('/api/drops/export/xlsx', { ids }, 'order-drop.xlsx'))}>{busy === 'xlsx' ? '…' : 'Excel'}</button>
          <button className="btn sm" disabled={!target.length || !!busy} onClick={() => run('pdf', () => downloadPost('/api/drops/export/pdf', { ids }, 'order-drop-POs.pdf'))} title="รวมไฟล์ PO ต้นฉบับเป็น PDF ไฟล์เดียว">{busy === 'pdf' ? '…' : 'รวม PDF'}</button>
          <button className="btn sm" disabled={!target.length || !!busy} onClick={() => run('zip', () => downloadPost('/api/drops/export/zip', { ids }, 'order-drop-POs.zip'))} title="ไฟล์ PO ต้นฉบับแยกไฟล์ใน .zip">{busy === 'zip' ? '…' : 'ZIP'}</button>
          <button className="btn sm ghost" disabled={!target.length} onClick={printTable} title="ตารางนี้เป็น PDF (พิมพ์ → บันทึกเป็น PDF)">ตาราง PDF</button>
        </div>
      </div>
      <div className="card" style={{ padding: 0 }}><div className="tblwrap"><table>
        <thead>
          <tr>
            <th style={{ width: 28 }}><input type="checkbox" aria-label="เลือกทั้งหมดที่แสดง" checked={allOn} onChange={e => setSel(e.target.checked ? new Set([...sel, ...rows.map(r => r.id)]) : new Set([...sel].filter(id => !rows.some(r => r.id === id))))} /></th>
            <H k="createdAt" w={120}>วันที่</H><H k="po">PO / Ref</H><H k="branch">สาขา</H><H k="item">ประเภท</H><H k="supplier">Supplier</H>
            <H k="issuer">ผู้ออก / ลิงก์</H><H k="file">ไฟล์</H><H k="status">อีเมล</H><H k="opened">เปิดอีเมล</H><th />
          </tr>
          <tr className="filters">
            <th />
            <th><input type="date" value={f.from} onChange={set('from')} aria-label="ตั้งแต่วันที่" /><input type="date" value={f.to} onChange={set('to')} aria-label="ถึงวันที่" /></th>
            <th><input value={f.po} onChange={set('po')} placeholder="ค้นหา" aria-label="กรอง PO" /></th>
            <th><input value={f.branch} onChange={set('branch')} placeholder="รหัส / ชื่อ" aria-label="กรองสาขา" /></th>
            <th><select value={f.item} onChange={set('item')} aria-label="กรองประเภท"><option value="">ทั้งหมด</option>{items.map(i => <option key={i.key} value={i.key}>{i.label}</option>)}</select></th>
            <th><input value={f.supplier} onChange={set('supplier')} placeholder="ค้นหา" aria-label="กรอง supplier" /></th>
            <th><input value={f.issuer} onChange={set('issuer')} placeholder="ค้นหา" aria-label="กรองผู้ออก" /></th>
            <th><input value={f.file} onChange={set('file')} placeholder="ค้นหา" aria-label="กรองไฟล์" /></th>
            <th><select value={f.status} onChange={set('status')} aria-label="กรองสถานะอีเมล"><option value="">ทั้งหมด</option>{Object.entries(STATUS).filter(([k]) => k !== 'sending').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></th>
            <th><select value={f.opened} onChange={set('opened')} aria-label="กรองการเปิดอีเมล"><option value="">ทั้งหมด</option><option value="yes">เปิดแล้ว</option><option value="no">ยังไม่พบการเปิด</option></select></th>
            <th />
          </tr>
        </thead>
        <tbody>{rows.length ? rows.map(d => (
          <tr key={d.id} style={sel.has(d.id) ? { background: '#F5F4F2' } : undefined}>
            <td><input type="checkbox" aria-label={'เลือก ' + d.ref} checked={sel.has(d.id)} onChange={e => setSel(s => { const n = new Set(s); if (e.target.checked) n.add(d.id); else n.delete(d.id); return n; })} /></td>
            <td className="small" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(d.createdAt)}</td>
            <td style={{ whiteSpace: 'nowrap' }}><b>{d.poNumber || '—'}</b><div className="small muted">{d.ref}</div></td>
            <td className="th small">{d.branchCode && <b>{d.branchCode} </b>}{d.branchName}</td>
            <td><span className="tag fc">{label(d.item)}</span></td>
            <td className="small th">{d.supplierName || <span className="muted">—</span>}{d.chosenBy && <div className="muted">เลือกโดย {d.chosenBy}</div>}</td>
            <td className="th small">{d.issuerName}<div className="muted">{d.sourceName}</div></td>
            <td className="small"><a href={`/api/drops/${d.id}/file`} target="_blank" rel="noopener">{d.fileName}</a><div className="muted">{fmtSize(d.size)}</div></td>
            <td><EmailChip d={d} /></td>
            <td><OpenChip d={d} /></td>
            <td style={{ whiteSpace: 'nowrap' }}>
              {d.emailStatus === 'blocked' ? null : d.emailStatus === 'pending' ? <button className="btn sm gold" onClick={onChoose}>เลือก supplier</button>
                : <button className="btn sm ghost" onClick={async () => { try { const r = await api<{ emailStatus: string; emailError: string }>(`/api/drops/${d.id}/resend`, { method: 'POST' }); toast(r.emailStatus === 'failed' ? 'ส่งไม่สำเร็จ: ' + r.emailError : 'ส่งอีเมลแล้ว'); router.refresh(); } catch (e) { toast((e as Error).message); } }}>ส่งซ้ำ</button>}
              {isMain && <> <button className="btn sm ghost" onClick={() => ask('ลบใบสั่งนี้และไฟล์ PDF ถาวร?', async () => { await api(`/api/drops/${d.id}`, { method: 'DELETE' }); toast('ลบแล้ว'); router.refresh(); }, { danger: true, yes: 'ลบ' })}>ลบ</button></>}
            </td>
          </tr>
        )) : <tr><td colSpan={11}><div className="empty th">ไม่พบรายการ</div></td></tr>}</tbody>
      </table></div></div>
      <div className="small muted th" style={{ marginTop: '.5rem' }}>“เปิดอีเมล” ตรวจจากรูปภาพขนาดเล็กในอีเมล — เป็นการประมาณ: บางระบบบล็อกรูป (เปิดแล้วแต่ไม่พบ) หรือโหลดล่วงหน้า (แสดงว่าเปิดทั้งที่ยังไม่ได้อ่าน)</div>
      {node}
    </>
  );
}
