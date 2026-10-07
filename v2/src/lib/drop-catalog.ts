// Item types: fallback routing when a PO product code has no supplier. 'other' is the catch-all.
export const OTHER_KEY = 'other';
export const DEFAULT_ITEMS = [
  { key: 'fresh_milk', label: 'Fresh Milk', labelTh: 'นมสด', to: ['Chakrit.ji@jianchatea.com'] },
  { key: 'yogurt', label: 'Yogurt', labelTh: 'โยเกิร์ต', to: ['Malichat.no@jianchatea.com', 'it.manager@jianchatea.com'] },
  { key: 'cream_cheese', label: 'Creamcheese', labelTh: 'ครีมชีส', to: ['Malichat.no@jianchatea.com'] },
  { key: 'whipping_cream', label: 'Whipping cream', labelTh: 'วิปปิ้งครีม', to: ['Chakrit.ji@jianchatea.com'] },
  { key: OTHER_KEY, label: 'Other', labelTh: 'อื่นๆ / ไม่ระบุประเภท', to: [] as string[] },
];
export const emailOk = (e: string) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(e);
/** lowercase, strip spaces / - _ . — used for name matching (same as the live service) */
export const normName = (x: unknown) => String(x ?? '').toLowerCase().replace(/[\s\-_.]+/g, '');
