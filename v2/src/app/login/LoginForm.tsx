'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/components/client';

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState(''), [pw, setPw] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  return (
    <form onSubmit={async e => {
      e.preventDefault(); setBusy(true); setErr('');
      try { await api('/api/auth/login', { body: { email, password: pw } }); location.href = next; }
      catch (x) { setErr((x as Error).message); setBusy(false); }
    }}>
      <div className="field"><label htmlFor="em">อีเมล</label><input id="em" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></div>
      <div className="field"><label htmlFor="pw">รหัสผ่าน</label><input id="pw" type="password" autoComplete="current-password" required value={pw} onChange={e => setPw(e.target.value)} /></div>
      <div className="err" role="alert">{err}</div>
      <button className="btn gold" style={{ width: '100%', marginTop: '.4rem' }} disabled={busy}>{busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}</button>
      <div className="small th" style={{ marginTop: '1rem', textAlign: 'center' }}><Link href="/forgot" className="muted">ลืมรหัสผ่าน?</Link></div>
      <div className="small muted th" style={{ marginTop: '.6rem', textAlign: 'center' }}>ใช้งานได้เฉพาะผู้ที่ได้รับคำเชิญจากผู้ดูแลระบบ</div>
    </form>
  );
}
