'use client';
import { useState } from 'react';
import { api, toast } from '@/components/client';
import { PasswordFields } from '@/components/PasswordFields';

export function ChangePassword() {
  const [cur, setCur] = useState(''), [pw, setPw] = useState(''), [pw2, setPw2] = useState(''), [err, setErr] = useState('');
  return (
    <form className="authform" onSubmit={async e => {
      e.preventDefault(); setErr('');
      if (pw !== pw2) { setErr('รหัสผ่านไม่ตรงกัน'); return; }
      try { await api('/api/account/password', { body: { current: cur, password: pw } }); setCur(''); setPw(''); setPw2(''); toast('เปลี่ยนรหัสผ่านแล้ว · อุปกรณ์อื่นถูกออกจากระบบ'); }
      catch (x) { setErr((x as Error).message); }
    }}>
      <div className="field"><label htmlFor="cur">รหัสผ่านปัจจุบัน</label><input id="cur" type="password" autoComplete="current-password" required value={cur} onChange={e => setCur(e.target.value)} /></div>
      <PasswordFields pw={pw} setPw={setPw} pw2={pw2} setPw2={setPw2} />
      <div className="err">{err}</div>
      <button className="btn gold">บันทึก</button>
    </form>
  );
}
