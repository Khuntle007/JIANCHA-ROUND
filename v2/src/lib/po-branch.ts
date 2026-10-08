// Which store is a PO for? Read from the PO's "BUYER / SHIP TO" line, checked against the store of the upload link.
// Code first (JF001 / JC009 / WHB01), then the store name (POs from some stores print the name only).
export type BranchName = { code: string; nameEn: string; nameTh: string };
export type BranchCheck =
  | { ok: true; code: string }
  | { ok: false; reason: 'mismatch'; poBranch: string; poCode: string }
  | { ok: false; reason: 'unknown'; poBranch: string };

const CODE_RE = /\b(J[CF]\d{3}|WH[A-Z]\d{2})\b/i;

/** "Emsphere ชั้น1" / "Central World fl.7" → "emsphere" / "centralworld" (floor and punctuation ignored). */
export function normName(s: string) {
  return String(s || '').toLowerCase()
    .replace(CODE_RE, ' ')
    .replace(/ชั้น\s*\S*|\bfl(?:oor)?\.?\s*\d+\S*/g, ' ')
    .replace(/[^a-z0-9฀-๿]+/g, '');
}

function nameCandidates(buyer: string, branches: BranchName[]) {
  const b = normName(buyer);
  if (b.length < 3) return [];
  const names = (x: BranchName) => [x.nameEn, x.nameTh].map(normName).filter(n => n.length >= 3);
  const exact = branches.filter(x => names(x).includes(b));
  if (exact.length) return exact;
  // "Robinson Ladkrabang" ↔ "Robinson Ladkrabang ชั้น1" etc.: one name is the start of the other
  return branches.filter(x => names(x).some(n => Math.min(n.length, b.length) >= 5 && (n.startsWith(b) || b.startsWith(n))));
}

/**
 * @param recodes old→new code pairs ("JC030>JC009") so a PO printed with a store's previous code still matches it.
 */
export function checkPoBranch(buyer: string, linkCode: string, branches: BranchName[], recodes: string[] = []): BranchCheck {
  const link = branches.find(b => b.code === linkCode);
  const label = (b: BranchName) => `${b.code} ${b.nameEn || b.nameTh}`.trim();
  const byName = nameCandidates(buyer, branches);
  const code = (String(buyer || '').match(CODE_RE) || [])[1]?.toUpperCase() || '';
  if (code) {
    if (code === linkCode) return { ok: true, code };
    const renamedTo = recodes.map(r => r.split('>')).find(([o]) => o === code)?.[1];
    // a previous code of this link's store — accept only when the name agrees too (old codes were reused by other stores)
    if (renamedTo === linkCode && link && byName.includes(link)) return { ok: true, code: linkCode };
    const current = branches.find(b => b.code === code) || branches.find(b => b.code === renamedTo);
    if (current || !byName.length) return { ok: false, reason: 'mismatch', poCode: current?.code || code, poBranch: current ? label(current) : String(buyer).trim() };
  }
  if (link && byName.includes(link)) return { ok: true, code: linkCode };
  if (byName.length) return { ok: false, reason: 'mismatch', poCode: byName[0].code, poBranch: label(byName[0]) };
  return { ok: false, reason: 'unknown', poBranch: String(buyer || '').trim() };
}

/** Thai notice shown on the franchise upload page; the PO is not stored as an order and nothing is emailed. */
export function branchCheckMessage(c: Exclude<BranchCheck, { ok: true }>, linkLabel: string) {
  const tail = 'PO นี้ยังไม่ถูกส่งต่อให้ซัพพลายเออร์';
  return c.reason === 'mismatch'
    ? `ขออภัย ระบบไม่รับ PO นี้ เนื่องจากสาขาในไฟล์ PO (${c.poBranch}) ไม่ตรงกับสาขาของลิงก์นี้ (${linkLabel}) — กรุณาส่ง PO ผ่านลิงก์ของสาขาที่ระบุในไฟล์ หรือแก้ไขสาขาใน PO ให้ถูกต้องแล้วส่งใหม่ (${tail})`
    : `ขออภัย ระบบไม่รับ PO นี้ เนื่องจากไม่พบสาขาของลิงก์นี้ (${linkLabel}) ในช่อง BUYER / SHIP TO ของไฟล์ PO${c.poBranch ? ` (ในไฟล์ระบุว่า “${c.poBranch}”)` : ''} — กรุณาตรวจสอบสาขาใน PO แล้วส่งใหม่ หรือติดต่อทีม SCM (${tail})`;
}
