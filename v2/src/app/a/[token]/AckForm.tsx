'use client';
import { useState } from 'react';
import { api } from '@/components/client';
import { fmtDateTime } from '@/lib/dates';

export function AckForm({ token, ackAt, ackName }: { token: string; ackAt: string | null; ackName: string }) {
  const [done, setDone] = useState(ackAt ? { ackAt, ackName } : null), [name, setName] = useState(''), [busy, setBusy] = useState(false), [msg, setMsg] = useState('');
  if (done) return (
    <div className="th" role="status" style={{ marginTop: '1rem', background: 'var(--okbg, #EEF5EE)', borderLeft: '3px solid var(--ok, #2E7D32)', padding: '.8rem 1rem' }}>
      <b>✓ ยืนยันรับคำสั่งซื้อแล้ว / Order receipt confirmed</b>
      <div className="small">{fmtDateTime(done.ackAt)}{done.ackName ? ' · ' + done.ackName : ''} — ขอบคุณค่ะ / Thank you.</div>
    </div>
  );
  return (
    <form style={{ marginTop: '1rem' }} onSubmit={async e => {
      e.preventDefault(); if (busy) return; setBusy(true); setMsg('');
      try { setDone(await api<{ ackAt: string; ackName: string }>(`/api/public/ack/${token}`, { method: 'POST', body: { name } })); }
      catch (x) { setMsg((x as Error).message); }
      setBusy(false);
    }}>
      <label className="th small" htmlFor="ackname">ชื่อผู้รับทราบ / Your name (ไม่บังคับ / optional)</label>
      <input id="ackname" value={name} onChange={e => setName(e.target.value)} maxLength={80} autoComplete="name" style={{ width: '100%', margin: '.3rem 0 .8rem' }} />
      {msg && <div className="th small" role="alert" style={{ color: 'var(--bad)', marginBottom: '.6rem' }}>{msg}</div>}
      <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn gold" disabled={busy}>{busy ? 'กำลังบันทึก…' : '✓ ยืนยันรับคำสั่งซื้อ / Confirm'}</button></div>
    </form>
  );
}
