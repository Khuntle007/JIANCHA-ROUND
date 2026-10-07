'use client';
import { useState } from 'react';
import Link from 'next/link';
import { AuthCard } from '@/components/AuthCard';
import { api } from '@/components/client';

export default function ForgotPage() {
  const [email, setEmail] = useState(''), [done, setDone] = useState(false), [err, setErr] = useState('');
  return (
    <AuthCard kicker="JC-ROUND" title="ลืมรหัสผ่าน">
      {done ? <p className="th okmsg">ถ้ามีบัญชีที่ใช้อีเมลนี้ เราได้ส่งลิงก์ตั้งรหัสผ่านใหม่ไปแล้ว (ใช้ได้ 30 นาที) — ตรวจกล่องจดหมายและ Junk</p> : (
        <form onSubmit={async e => { e.preventDefault(); setErr(''); try { await api('/api/auth/forgot', { body: { email } }); setDone(true); } catch (x) { setErr((x as Error).message); } }}>
          <div className="field"><label htmlFor="em">อีเมลที่ใช้เข้าระบบ</label><input id="em" type="email" required value={email} onChange={e => setEmail(e.target.value)} /></div>
          <div className="err">{err}</div>
          <button className="btn gold" style={{ width: '100%' }}>ส่งลิงก์ตั้งรหัสใหม่</button>
        </form>
      )}
      <div className="small th" style={{ marginTop: '1rem', textAlign: 'center' }}><Link href="/login" className="muted">‹ กลับไปหน้าเข้าสู่ระบบ</Link></div>
    </AuthCard>
  );
}
