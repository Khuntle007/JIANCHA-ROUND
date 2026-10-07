'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, Modal } from '@/components/client';
import { Emblem } from '@/components/Emblem';
import { fmtDateTime } from '@/lib/dates';

type Info = { name: string; branches: { code: string; name: string }[]; items: { key: string; label: string; name: string }[]; maxBytes: number;
  drops: { ref: string; branchName: string; issuerName: string; itemName: string; createdAt: string; forwarded: boolean }[] };
const fmtSize = (n: number) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

export function Portal({ token }: { token: string }) {
  const [info, setInfo] = useState<Info | null>(null), [fatal, setFatal] = useState('');
  const [branch, setBranch] = useState(''), [item, setItem] = useState(''), [issuer, setIssuer] = useState(''), [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState(''), [busy, setBusy] = useState(false), [over, setOver] = useState(false), [done, setDone] = useState<null | { ref: string; itemName: string; branchName: string }>(null);
  const input = useRef<HTMLInputElement>(null);
  const load = useCallback(() => api<Info>(`/api/public/drop/${token}`).then(i => { setInfo(i); if (i.branches.length === 1) setBranch(i.branches[0].code); }).catch(e => setFatal(e.message)), [token]);
  useEffect(() => { load(); }, [load]);

  const pick = (f?: File | null) => {
    if (!f || !info) return;
    if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') { setMsg('รองรับเฉพาะไฟล์ PDF'); return; }
    if (f.size > info.maxBytes) { setMsg('ไฟล์ใหญ่เกิน ' + fmtSize(info.maxBytes)); return; }
    setMsg(''); setFile(f);
  };
  const sel = info?.items.find(i => i.key === item);

  return (
    <>
      <div className="topbar"><div className="brand"><Emblem /><div className="wm">JIANCHA<small>ORDER DROP · FRANCHISE</small></div></div><div className="spacer" />{info && <div className="who"><span className="th">{info.name}</span></div>}</div>
      <div className="wrap" style={{ maxWidth: 820 }}>
        {fatal ? <div className="card"><div className="empty th">{fatal}<div className="small muted" style={{ marginTop: '.4rem' }}>ติดต่อทีม SCM JIANCHA เพื่อขอลิงก์ใหม่</div></div></div> : !info ? <div className="card"><div className="empty th">กำลังโหลด…</div></div> : <>
          <div className="pagehead"><div><div className="kicker">Order Drop</div><h1 className="th">ส่งใบสั่งซื้อ</h1></div></div>
          <form className="card" onSubmit={async e => {
            e.preventDefault(); if (busy) return;
            if (!branch || !item || !issuer.trim()) { setMsg('กรอกข้อมูลให้ครบ'); return; }
            if (!file) { setMsg('กรุณาแนบไฟล์ PDF'); return; }
            setBusy(true); setMsg('');
            try {
              const qs = new URLSearchParams({ branch, item, issuer: issuer.trim(), filename: file.name });
              const r = await api<{ ref: string; itemName: string; branchName: string }>(`/api/public/drop/${token}?${qs}`, { raw: file, headers: { 'Content-Type': 'application/pdf' } });
              setDone(r); setFile(null); setIssuer(''); load();
            } catch (x) { setMsg('ส่งไม่สำเร็จ: ' + (x as Error).message); }
            setBusy(false);
          }}>
            <div className="grid2">
              <div className="field"><label htmlFor="b">สาขา (Branch) *</label><select id="b" className="full" value={branch} onChange={e => setBranch(e.target.value)} required>
                {info.branches.length !== 1 && <option value="">— เลือกสาขา —</option>}{info.branches.map(b => <option key={b.code} value={b.code}>{b.name}</option>)}</select></div>
              <div className="field"><label htmlFor="i">รายการ (Item) *</label><select id="i" className="full" value={item} onChange={e => setItem(e.target.value)} required>
                <option value="">— เลือกรายการ —</option>{info.items.map(i => <option key={i.key} value={i.key}>{i.label}</option>)}</select>
                {sel && sel.label.includes(' / ') && <div className="small muted" style={{ marginTop: '.3rem' }}>{sel.label.split(' / ').join(' · ')}</div>}</div>
            </div>
            <div className="field"><label htmlFor="n">ชื่อผู้ออกใบสั่ง (Name of Order Issuer) *</label><input id="n" maxLength={120} required placeholder="ชื่อ-นามสกุล" value={issuer} onChange={e => setIssuer(e.target.value)} /></div>
            <div className="field"><label>ไฟล์ใบสั่ง (PDF) *</label>
              <div className={'dropzone' + (over ? ' over' : '') + (file ? ' has' : '')} role="button" tabIndex={0}
                onClick={() => input.current?.click()} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') input.current?.click(); }}
                onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={e => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}>
                <input ref={input} type="file" accept="application/pdf,.pdf" hidden onChange={e => pick(e.target.files?.[0])} />
                {file ? <div className="th">📄 <b>{file.name}</b> <span className="muted small">{fmtSize(file.size)}</span><div className="small muted">คลิกเพื่อเปลี่ยนไฟล์</div></div>
                  : <div className="th">ลากไฟล์ PDF มาวาง หรือ <u>คลิกเพื่อเลือกไฟล์</u><div className="small muted">สูงสุด {fmtSize(info.maxBytes)}</div></div>}
              </div></div>
            <div className="err th" role="alert">{msg}</div>
            <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn gold" disabled={busy}>{busy ? 'กำลังส่ง…' : 'ส่งใบสั่ง'}</button></div>
          </form>
          <div style={{ height: '1.2rem' }} />
          <div className="kicker" style={{ marginBottom: '.5rem' }}>ใบสั่งที่ส่งผ่านลิงก์นี้ล่าสุด</div>
          <div className="card" style={{ padding: 0 }}><div className="tblwrap"><table><thead><tr><th>วันที่</th><th>Ref</th><th>สาขา</th><th>รายการ</th><th>ผู้สั่ง</th><th>สถานะ</th></tr></thead>
            <tbody>{info.drops.length ? info.drops.map(d => <tr key={d.ref}><td className="small" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(d.createdAt)}</td><td><b>{d.ref}</b></td><td className="th">{d.branchName}</td><td>{d.itemName}</td><td className="th">{d.issuerName}</td>
              <td>{d.forwarded ? <span className="estat sent">ได้รับแล้ว</span> : <span className="estat wait">ได้รับแล้ว · รอทีมส่งต่อ</span>}</td></tr>)
              : <tr><td colSpan={6}><div className="empty th">ยังไม่มีใบสั่ง</div></td></tr>}</tbody></table></div></div>
        </>}
        <div className="foot">JIANCHA · External Order Drop — ระบบรับใบสั่งซื้อจากแฟรนไชส์</div>
      </div>
      {done && <Modal title="ส่งใบสั่งเรียบร้อย" onClose={() => setDone(null)} width={420}>
        <p className="th" style={{ margin: '.2rem 0 1rem', textAlign: 'center' }}>✓ เลขที่อ้างอิง <b>{done.ref}</b><br /><span className="small muted">{done.itemName} · {done.branchName}</span></p>
        <div className="row" style={{ justifyContent: 'center' }}><button className="btn gold" onClick={() => setDone(null)}>ตกลง</button></div>
      </Modal>}
    </>
  );
}
