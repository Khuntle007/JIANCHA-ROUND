/** ≥10 chars, letters + digits, not the email / name. Returns an error message or null. */
export function passwordProblem(pw: string, email = '', name = ''): string | null {
  if (typeof pw !== 'string' || pw.length < 10) return 'รหัสผ่านต้องยาวอย่างน้อย 10 ตัวอักษร';
  if (pw.length > 128) return 'รหัสผ่านยาวเกินไป';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'รหัสผ่านต้องมีทั้งตัวอักษรและตัวเลข';
  const low = pw.toLowerCase();
  // any ≥4-char piece of the email local part or the name (e.g. "chakrit" from chakrit.ji@…)
  const parts = [...email.split('@')[0].split(/[._+\-\s]+/), ...name.split(/[._+\-\s]+/)].map(x => x.toLowerCase()).filter(x => x.length >= 4);
  if (parts.some(x => low.includes(x))) return 'รหัสผ่านต้องไม่มีชื่อหรืออีเมลของคุณ';
  return null;
}

