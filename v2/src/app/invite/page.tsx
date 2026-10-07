'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AuthCard } from '@/components/AuthCard';
import { PasswordFields } from '@/components/PasswordFields';
import { api } from '@/components/client';

function Accept() {
  const token = useSearchParams().get('token') || '';
  const [info, setInfo] = useState<{ email: string; name: string; role: string } | null>(null);
  const [name, setName] = useState(''), [pw, setPw] = useState(''), [pw2, setPw2] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{ email: string; name: string; role: string }>('/api/auth/invite?token=' + encodeURIComponent(token))
      .then(i => { setInfo(i); setName(i.name); }).catch(x => setErr((x as Error).message));
  }, [token]);
  if (!info) return <div className="err th">{err || 'กำลังตรวจสอบลิงก์…'}</div>;
  return (
    <form onSubmit={async e => {
      e.preventDefault(); setErr('');
      if (pw !== pw2) { setErr('รหัสผ่านไม่ตรงกัน'); return; }
      setBusy(true);
      try { await api('/api/auth/invite', { body: { token, name, password: pw } }); location.href = '/'; }
      catch (x) { setErr((x as Error).message); setBusy(false); }
    }}>
      <p className="th small" style={{ marginTop: 0 }}>อีเมล <b>{info.email}</b> · บทบาท <b>{info.role}</b></p>
      <div className="field"><label htmlFor="nm">ชื่อที่แสดงในระบบ</label><input id="nm" required maxLength={80} value={name} onChange={e => setName(e.target.value)} /></div>
      <PasswordFields pw={pw} setPw={setPw} pw2={pw2} setPw2={setPw2} />
      <div className="err">{err}</div>
      <button className="btn gold" style={{ width: '100%' }} disabled={busy}>เริ่มใช้งาน</button>
    </form>
  );
}
export default function InvitePage() {
  return <AuthCard kicker="JC-ROUND · คำเชิญ" title="ตั้งรหัสผ่านเพื่อเริ่มใช้งาน"><Suspense><Accept /></Suspense></AuthCard>;
}
