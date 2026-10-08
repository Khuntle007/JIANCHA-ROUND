import { describe, it, expect } from 'vitest';
import { orderDayFor, deliverDayFor, sortRounds, lineMatch, lines, slotForOrderDay, cleanSlots, nextStatus, statusMeta } from '@/lib/domain';
import { todayISO, addDays, monIndex, isISODate, dmyToISO, isoToDMY, sameMonth } from '@/lib/dates';
import { effectivePerms, parsePerms, SYSTEM_ROLES } from '@/lib/perms';
import { passwordProblem } from '@/lib/auth-rules';
import { emailOk, ITEM_GROUPS, OTHER_KEY } from '@/lib/drop-catalog';
import { parsePo, codeOf } from '@/lib/po';
import { itemForLine, pickSuppliers, mergeCc } from '@/lib/drop';
import { checkPoBranch, branchCheckMessage } from '@/lib/po-branch';
import fs from 'fs';
import path from 'path';

describe('weekend rules (ported from v1)', () => {
  it('Sunday order moves to Friday', () => { expect(orderDayFor(0)).toBe(4); expect(orderDayFor(2)).toBe(1); });
  it('Sat/Sun delivery moves to Monday', () => { expect(deliverDayFor(4)).toBe(0); expect(deliverDayFor(5)).toBe(0); expect(deliverDayFor(6)).toBe(0); expect(deliverDayFor(1)).toBe(2); });
});

describe('Bangkok dates (fixes v1 off-by-one)', () => {
  it('today is the Bangkok date even before 07:00', () => { expect(todayISO(new Date('2026-10-06T18:30:00Z'))).toBe('2026-10-07'); });
  it('addDays is pure calendar math', () => { expect(addDays('2026-10-07', -365)).toBe('2025-10-07'); expect(addDays('2026-02-28', 1)).toBe('2026-03-01'); });
  it('monIndex: 0 = Monday', () => { expect(monIndex('2026-10-05')).toBe(0); expect(monIndex('2026-10-11')).toBe(6); });
  it('validates dates', () => { expect(isISODate('2026-02-30')).toBe(false); expect(isISODate('2026-10-23')).toBe(true); });
  it('dd/mm/yyyy round-trip', () => { expect(dmyToISO('7/10/2026')).toBe('2026-10-07'); expect(isoToDMY('2026-10-07')).toBe('07/10/2026'); expect(dmyToISO('31/02/2026')).toBe(''); });
  it('sameMonth', () => { expect(sameMonth('2026-10-01', '2026-10-31')).toBe(true); });
});

describe('rounds', () => {
  const rs = [
    { category: 'fresh', warehouse: '', freshType: 'โยเกิร์ต', product: 'y', slots: [{ order: 0, cutoff: '12:00', deliver: 1 }] },
    { category: 'dry', warehouse: 'WH003', freshType: '', product: 'f', slots: [] },
    { category: 'fresh', warehouse: '', freshType: 'นมสด', product: 'm', slots: [{ order: 0, cutoff: '', deliver: 1 }, { order: 0, cutoff: '09:00', deliver: 2 }] },
    { category: 'dry', warehouse: 'WH001', freshType: '', product: 'd', slots: [] },
  ];
  it('sorts dry (WH001, WH002, other) then fresh by type order', () => { expect(sortRounds(rs).map(r => r.product)).toEqual(['d', 'f', 'm', 'y']); });
  it('line matching', () => { const milk = lines().find(l => l.key === 'นมสด')!; expect(rs.filter(r => lineMatch(r, milk)).map(r => r.product)).toEqual(['m']); });
  it('first slot for an order day wins (v1 behaviour)', () => { expect(slotForOrderDay(rs[2], 0)?.deliver).toBe(1); });
  it('cleanSlots drops invalid input', () => {
    expect(cleanSlots([{ order: 7, deliver: 1 }, { order: 1, deliver: 2, cutoff: '25:00' }, { order: '2', deliver: '3', cutoff: '12:30' }]))
      .toEqual([{ order: 1, deliver: 2, cutoff: '' }, { order: 2, deliver: 3, cutoff: '12:30' }]);
  });
  it('status cycle complete → cut → hold → complete', () => { expect(['complete', 'cut', 'hold'].map(nextStatus)).toEqual(['cut', 'hold', 'complete']); expect(statusMeta('weird').cls).toBe('hold'); });
});

describe('permissions', () => {
  const role = (k: string) => { const r = SYSTEM_ROLES.find(x => x.key === k)!; return { perms: JSON.stringify(r.perms), isProtected: !!r.isProtected }; };
  it('MAIN ADMIN always has everything, even with overrides', () => { expect(Object.values(effectivePerms(role('MAIN_ADMIN'), '{"manageUsers":false}')).every(Boolean)).toBe(true); });
  it('Operation defaults', () => { const p = effectivePerms(role('OPERATION'), '{}'); expect(p.calendar && p.branches && p.orders && p.share).toBe(true); expect(p.editOrders || p.manageUsers || p.orderDrop).toBe(false); });
  it('user overrides win over role', () => { const p = effectivePerms(role('OPERATION'), '{"orderDrop":true,"share":false}'); expect(p.orderDrop).toBe(true); expect(p.share).toBe(false); });
  it('unknown keys are ignored', () => { expect(parsePerms('{"evil":true,"calendar":true}')).toEqual({ calendar: true }); });
});

describe('password rules', () => {
  it('rejects short / no digits / containing email', () => {
    expect(passwordProblem('Short1')).toBeTruthy();
    expect(passwordProblem('onlyletterslong')).toBeTruthy();
    expect(passwordProblem('chakrit2026xx', 'chakrit.ji@jianchatea.com')).toBeTruthy();
    expect(passwordProblem('Teapot-Monsoon-42')).toBeNull();
  });
});

describe('order drop', () => {
  const items = ITEM_GROUPS.map(i => ({ ...i }));
  it('fresh milk is record-only (never forwarded)', () => { const fm = ITEM_GROUPS.find(g => g.key === 'fresh_milk')!; expect(fm.blocked).toBe(true); expect(fm.to).toEqual([]); expect(itemForLine('030024 - Fresh milk (2 Ltr.)', items)).toBe('fresh_milk'); });
  it('5 groups in the requested order', () => { expect(ITEM_GROUPS.map(g => g.label)).toEqual(['Yogurt', 'Creamcheese / Whipping cream', 'Fresh milk', 'Ice hot creamer', 'Fruits']); });
  it('group by product code first', () => {
    expect(itemForLine('030013 - Creamcheese (1 Kg) ครีมชีส (1 กก.)', items)).toBe('cream_whip');
    expect(itemForLine('030014 - Whipping cream (1 Ltr.)', items)).toBe('cream_whip');
    expect(itemForLine('030019 - Yogurt (2 Kg)', items)).toBe('yogurt');
    expect(itemForLine('030012 - ice hot creamer ( 1 Ltr.)', items)).toBe('ice_hot_creamer');
    expect(itemForLine('010001 - Lemon', items)).toBe('fruits');
    expect(itemForLine('010045 - Green Mango', items)).toBe('fruits');
  });
  it('then by name keyword (TH/EN), else other', () => {
    expect(itemForLine('039999 - นมสดพาสเจอร์ไรส์', items)).toBe('fresh_milk');
    expect(itemForLine('039998 - Whipping topping', items)).toBe('cream_whip');
    expect(itemForLine('050001 - Mango syrup', items)).toBe(OTHER_KEY); // fruit names alone never pull syrups into Fruits
    expect(itemForLine('050002 - Cups 16oz', items)).toBe(OTHER_KEY);
  });
  it('product code', () => { expect(codeOf('030014 - Whipping cream')).toBe('030014'); expect(codeOf('Lemon')).toBe(''); });
  it('email validation', () => { expect(emailOk('a@b.co')).toBe(true); expect(emailOk('a@b')).toBe(false); expect(emailOk('a b@c.d')).toBe(false); });
  const fixture = path.join(__dirname, 'fixtures', 'po-layout.txt');
  it.runIf(fs.existsSync(fixture))('parses a real PURCHASE ORDER (pdftotext -layout)', () => {
    const po = parsePo(fs.readFileSync(fixture, 'utf8'));
    expect(po.number).toMatch(/^PO\d{6,}$/);
    expect(po.lines.length).toBe(2);
    expect(po.lines[1]).toMatchObject({ no: 2, qty: 2, unit: 'Box', vat: 'N', price: 2000, total: 4000 });
    expect(po.total).toBe(5000); expect(po.grand).toBe(5000); expect(po.vatRate).toBe('0');
    expect(po.buyer).toBeTruthy(); expect(po.issuedDate).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });
});

describe('branch-specific suppliers + CC', () => {
  const sups = [
    { id: 'gpwc', branches: [] as string[] }, { id: 'panfood', branches: ['JF050', 'JF055', 'JF039'] }, { id: 'rwp', branches: ['JF023'] },
  ];
  it('branch-specific supplier wins', () => { expect(pickSuppliers(sups, 'JF023').map(s => s.id)).toEqual(['rwp']); expect(pickSuppliers(sups, 'JF055').map(s => s.id)).toEqual(['panfood']); });
  it('other branches get the default', () => { expect(pickSuppliers(sups, 'JF001').map(s => s.id)).toEqual(['gpwc']); expect(pickSuppliers(sups, null).map(s => s.id)).toEqual(['gpwc']); });
  it('CC merges always-CC, drops duplicates and anyone in To', () => {
    expect(mergeCc(['a@x.co'], ['b@x.co'], ['B@x.co', 'c@x.co', 'A@x.co'])).toEqual(['b@x.co', 'c@x.co']);
  });
  it('fruits: FRUIT ORDER tag and no global CC', () => { const fr = ITEM_GROUPS.find(g => g.key === 'fruits')!; expect(fr.subjectTag).toBe('FRUIT ORDER'); expect(fr.skipGlobalCc).toBe(true); });
});

describe('PO store must match the upload link store', () => {
  const B = [
    { code: 'JF001', nameEn: 'Fashion Island', nameTh: 'Fashion ชั้น2' }, { code: 'JF056', nameEn: 'Robinson Suvarnabhumi', nameTh: 'Robinson Ladkrabang ชั้น1' },
    { code: 'JF065', nameEn: 'PTT Saimai 56', nameTh: '' }, { code: 'JC009', nameEn: 'Emsphere ชั้น1', nameTh: '' },
    { code: 'JC010', nameEn: 'Central world Groove', nameTh: '' }, { code: 'JC013', nameEn: 'Siam Square', nameTh: '' },
  ];
  const rec = ['JC030>JC009', 'JC009>JC013'];
  it('code on the PO wins', () => {
    expect(checkPoBranch('JC009 Emsphere', 'JC009', B, rec)).toEqual({ ok: true, code: 'JC009' });
    expect(checkPoBranch('JF001 Fashion Island', 'JC009', B, rec)).toMatchObject({ ok: false, reason: 'mismatch', poCode: 'JF001' });
  });
  it('name-only POs are matched by store name (floor ignored)', () => {
    expect(checkPoBranch('Ptt saimai 56', 'JF065', B).ok).toBe(true);
    expect(checkPoBranch('Fashion ชั้น2', 'JF001', B).ok).toBe(true);
    expect(checkPoBranch('Robinson Ladkrabang', 'JF065', B)).toMatchObject({ ok: false, reason: 'mismatch', poCode: 'JF056' });
  });
  it('a previous code is accepted only when the name agrees', () => {
    expect(checkPoBranch('JC030 Emsphere', 'JC009', B, rec).ok).toBe(true);
    expect(checkPoBranch('JC009 Siam Square', 'JC009', B, rec).ok).toBe(true); // current code wins over the reused old one
  });
  it('unknown store is refused', () => {
    expect(checkPoBranch('XYZ shop', 'JF001', B)).toMatchObject({ ok: false, reason: 'unknown' });
    expect(checkPoBranch('', 'JF001', B)).toMatchObject({ ok: false, reason: 'unknown' });
    expect(branchCheckMessage({ ok: false, reason: 'mismatch', poCode: 'JF001', poBranch: 'JF001 Fashion Island' }, 'JC002 Dragon town')).toMatch(/^ขออภัย/);
  });
});
