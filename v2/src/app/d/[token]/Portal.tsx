'use client';
import { useEffect, useRef, useState } from 'react';
import { api, Modal } from '@/components/client';
import { BrandBar } from '@/components/Emblem';

const fmtSize = (n: number) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
type Done = { poNumber: string; buyer: string; drops: { ref: string; item: string }[]; blocked?: { message: string; items: string[] } };

/** Upload-only franchise page: no login, shows nothing about past orders. */
export function Portal({ token }: { token: string }) {
  const [info, setInfo] = useState<{ name: string; maxBytes: number } | null>(null), [fatal, setFatal] = useState('');
  const [file, setFile] = useState<File | null>(null), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false), [over, setOver] = useState(false), [done, setDone] = useState<Done | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { api<{ name: string; maxBytes: number }>(`/api/public/drop/${token}`).then(setInfo).catch(e => setFatal(e.message)); }, [token]);
  const pick = (f?: File | null) => {
    if (!f || !info) return;
    if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') { setMsg('รองรับเฉพาะไฟล์ PDF'); return; }
    if (f.size > info.maxBytes) { setMsg('ไฟล์ใหญ่เกิน ' + fmtSize(info.maxBytes)); return; }
    setMsg(''); setFile(f);
  };
  return (
    <>
      <div className="topbar"><div className="brand"><BrandBar sub="Order Drop · Franchise" /></div><div className="spacer" />{info && <div className="who"><span className="th">{info.name}</span></div>}</div>
      <div className="wrap" style={{ maxWidth: 680 }}>
        {fatal ? <div className="card"><div className="empty th">{fatal}<div className="small muted" style={{ marginTop: '.4rem' }}>ติดต่อทีม SCM JIAN CHA เพื่อขอลิงก์ใหม่</div></div></div> : !info ? <div className="card"><div className="empty th">กำลังโหลด…</div></div> : <>
          <div className="pagehead"><div><div className="kicker">Order Drop</div><h1 className="th">ส่งใบสั่งซื้อ (PO)</h1></div></div>
          <form className="card" onSubmit={async e => {
            e.preventDefault(); if (busy) return;
            if (!file) { setMsg('กรุณาแนบไฟล์ PDF'); return; }
            setBusy(true); setMsg('');
            try { setDone(await api<Done>(`/api/public/drop/${token}?filename=${encodeURIComponent(file.name)}`, { raw: file, headers: { 'Content-Type': 'application/pdf' } })); setFile(null); }
            catch (x) { const m = (x as Error).message; setMsg(m.startsWith('การจัดส่งไม่สำเร็จ') ? m : 'ส่งไม่สำเร็จ: ' + m); setFile(null); }
            setBusy(false);
          }}>
            <p className="th small" style={{ marginTop: 0 }}>แนบไฟล์ <b>ใบ PO (PURCHASE ORDER) จากระบบ PO</b> — ระบบจะอ่านสาขา รายการสินค้า และผู้ออกใบสั่งจากไฟล์ แล้วส่งต่อให้ supplier อัตโนมัติ</p>
            <div className={'dropzone' + (over ? ' over' : '') + (file ? ' has' : '')} role="button" tabIndex={0}
              onClick={() => input.current?.click()} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') input.current?.click(); }}
              onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={e => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}>
              <input ref={input} type="file" accept="application/pdf,.pdf" hidden onChange={e => pick(e.target.files?.[0])} />
              {file ? <div className="th"><b>{file.name}</b> <span className="muted small">{fmtSize(file.size)}</span><div className="small muted">คลิกเพื่อเปลี่ยนไฟล์</div></div>
                : <div className="th">ลากไฟล์ PDF มาวาง หรือ <u>คลิกเพื่อเลือกไฟล์</u><div className="small muted">สูงสุด {fmtSize(info.maxBytes)}</div></div>}
            </div>
            {msg ? <div className="th" role="alert" style={{ marginTop: '.8rem', background: 'var(--badbg)', color: 'var(--bad)', borderLeft: '3px solid var(--bad)', padding: '.8rem 1rem', fontSize: '.92rem', fontWeight: 500 }}>{msg}</div> : <div style={{ height: '.8rem' }} />}
            <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn gold" disabled={busy}>{busy ? 'กำลังส่ง…' : 'ส่งใบสั่ง'}</button></div>
          </form>
        </>}
        <div className="foot">JIAN CHA · Order Drop</div>
      </div>
      {done && <Modal title={done.blocked ? 'ส่งใบสั่งได้บางรายการ' : 'ส่งใบสั่งเรียบร้อย'} onClose={() => setDone(null)} width={460}>
        <p className="th" style={{ margin: '.2rem 0 .6rem', textAlign: 'center' }}><b>{done.poNumber}</b><br /><span className="small muted">{done.buyer}</span></p>
        <div className="small th" style={{ marginBottom: '1rem' }}>{done.drops.map(d => <div key={d.ref}>• {d.ref} · {d.item}</div>)}</div>
        {done.blocked && <div className="th small" role="alert" style={{ background: 'var(--badbg)', color: 'var(--bad)', padding: '.7rem .8rem', marginBottom: '1rem' }}>
          <b>{done.blocked.items.join(', ')}</b> — {done.blocked.message}</div>}
        <div className="row" style={{ justifyContent: 'center' }}><button className="btn gold" onClick={() => setDone(null)}>ตกลง</button></div>
      </Modal>}
    </>
  );
}
