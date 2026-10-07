// Item groups for Order Drop (fallback routing when a PO product code has no supplier).
// A PO line joins a group by product code first, then by name keyword; otherwise 'other' (catch-all, may have no recipients).
export const OTHER_KEY = 'other';

export type ItemGroupDef = { key: string; label: string; labelTh: string; codes: string[]; words: string[]; to: string[]; blocked?: boolean; subjectTag?: string; skipGlobalCc?: boolean };

/** Shown to the franchise when a PO contains an item that must not go through this portal. */
export const BLOCKED_MESSAGE = 'การจัดส่งไม่สำเร็จเนื่องจากสินค้าประเภทนี้ไม่สามารถจัดส่งผ่านระบบนี้ได้ กรุณาติดต่อ Area Manager';

/** The 5 ingredient groups (2026-10-07). Recipients are mock-ups until the real supplier emails are set. */
export const ITEM_GROUPS: ItemGroupDef[] = [
  { key: 'yogurt', label: 'Yogurt', labelTh: 'โยเกิร์ต', codes: ['030019'], words: ['yogurt', 'yoghurt', 'โยเกิร์ต'], to: ['Malichat.no@jianchatea.com', 'it.manager@jianchatea.com'] },
  { key: 'cream_whip', label: 'Creamcheese / Whipping cream', labelTh: 'ครีมชีส / วิปปิ้งครีม', codes: ['030013', '030014'], words: ['creamcheese', 'cream cheese', 'whipping', 'ครีมชีส', 'วิปปิ้ง'], to: ['Malichat.no@jianchatea.com', 'Chakrit.ji@jianchatea.com'] },
  // fresh milk is ordered outside this portal: lines are recorded only, never forwarded (2026-10-07)
  { key: 'fresh_milk', label: 'Fresh milk', labelTh: 'นมสด', codes: ['030024'], words: ['fresh milk', 'นมสด'], to: [], blocked: true },
  { key: 'ice_hot_creamer', label: 'Ice hot creamer', labelTh: 'ไอซ์ฮอต ครีมเมอร์', codes: ['030012'], words: ['ice hot', 'icehot', 'ไอซ์ฮอต'], to: ['Chakrit.ji@jianchatea.com'] },
  // fruits: by code only (+ the word "fruit") — fruit names also appear in syrups / powders
  { key: 'fruits', label: 'Fruits', labelTh: 'ผลไม้', codes: ['010001', '010006', '010010', '010011', '010012', '010016', '010039', '010044', '010045', '010003', '010002'], words: ['fruit', 'ผลไม้'], to: ['Malichat.no@jianchatea.com', 'scm.admin@jianchatea.com'], subjectTag: 'FRUIT ORDER', skipGlobalCc: true },
];
export const OTHER_GROUP: ItemGroupDef = { key: OTHER_KEY, label: 'Other', labelTh: 'อื่นๆ / ไม่ระบุประเภท', codes: [], words: [], to: [] };
/** pre-2026-10-07 keys → current group */
export const LEGACY_ITEM: Record<string, string> = { cream_cheese: 'cream_whip', whipping_cream: 'cream_whip' };

export const emailOk = (e: string) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(e);
/** lowercase, strip spaces / - _ . — used for name matching (same as the live service) */
export const normName = (x: unknown) => String(x ?? '').toLowerCase().replace(/[\s\-_.]+/g, '');
