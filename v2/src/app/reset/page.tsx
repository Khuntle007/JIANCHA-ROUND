'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AuthCard } from '@/components/AuthCard';
import { PasswordFields } from '@/components/PasswordFields';
import { api } from '@/components/client';

function Reset() {
  const token = useSearchParams().get('token') || '';
  const [pw, setPw] = useState(''), [pw2, setPw2] = useState(''), [err, setErr] = useState(''), [done, setDone] = useState(false);
  if (done) return <><p className="th okmsg">ตั้งรหัสผ่านใหม่เรียบร้อย — อุปกรณ์อื่นถูกออกจากระบบแล้ว</p><Link className="btn gold" href="/login">เข้าสู่ระบบ</Link></>;
  return (
    <form onSubmit={async e => {
      e.preventDefault(); setErr('');
      if (pw !== pw2) { setErr('รหัสผ่านไม่ตรงกัน'); return; }
      try { await api('/api/auth/reset', { body: { token, password: pw } }); setDone(true); } catch (x) { setErr((x as Error).message); }
    }}>
      <PasswordFields pw={pw} setPw={setPw} pw2={pw2} setPw2={setPw2} />
      <div className="err">{err}</div>
      <button className="btn gold" style={{ width: '100%' }}>บันทึกรหัสผ่านใหม่</button>
    </form>
  );
}
export default function ResetPage() {
  return <AuthCard kicker="JC-ROUND" title="ตั้งรหัสผ่านใหม่"><Suspense><Reset /></Suspense></AuthCard>;
}
