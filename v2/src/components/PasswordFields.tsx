'use client';
export function PasswordFields({ pw, setPw, pw2, setPw2 }: { pw: string; setPw: (s: string) => void; pw2: string; setPw2: (s: string) => void }) {
  return (
    <>
      <div className="field"><label htmlFor="pw">รหัสผ่านใหม่</label><input id="pw" type="password" autoComplete="new-password" required minLength={10} value={pw} onChange={e => setPw(e.target.value)} /></div>
      <div className="field"><label htmlFor="pw2">ยืนยันรหัสผ่าน</label><input id="pw2" type="password" autoComplete="new-password" required value={pw2} onChange={e => setPw2(e.target.value)} /></div>
      <div className="muted-sm th" style={{ marginBottom: '.5rem' }}>อย่างน้อย 10 ตัว · มีทั้งตัวอักษรและตัวเลข · ไม่มีชื่อหรืออีเมลของคุณ</div>
    </>
  );
}
