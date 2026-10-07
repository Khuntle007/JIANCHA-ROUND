// Rounds domain — ported 1:1 from v1 jiancha-rounds.html. Day index 0 = Monday … 6 = Sunday.
export const DOW_TH = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์', 'อาทิตย์'];
export const DOW_SHORT = ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'];
export const FRESH_TYPES = ['นมสด', 'โยเกิร์ต', 'วิปปิ้งครีม & ครีมชีส', 'ผลไม้', 'ไอซ์ฮอต'] as const;
export const WAREHOUSES = ['WH001', 'WH002', 'WH003'] as const;
export const ORDER_STATUSES = ['complete', 'cut', 'hold'] as const;
export const DOC_TYPES = ['PO', 'TR'] as const;

export type Slot = { order: number; cutoff: string; deliver: number };
export type RoundLike = { id?: string; category: string; warehouse: string; freshType: string; product: string; slots: Slot[] };

export function statusMeta(s: string) {
  if (s === 'complete') return { cls: 'ok', label: 'Complete · ได้รับครบ' };
  if (s === 'cut') return { cls: 'bad', label: 'โดนตัด / ส่งไม่ครบ' };
  return { cls: 'hold', label: 'รอชำระเงิน (Hold)' };
}
export const nextStatus = (s: string) => (s === 'complete' ? 'cut' : s === 'cut' ? 'hold' : 'complete');

/** Lines shown in the holiday "affected" panel and the rounds board. */
export type Line = { key: string; cat: 'dry' | 'fresh'; label: string };
export function lines(): Line[] {
  return [
    ...WAREHOUSES.map(w => ({ key: w, cat: 'dry' as const, label: w })),
    ...FRESH_TYPES.map(f => ({ key: f, cat: 'fresh' as const, label: f })),
  ];
}
export function lineMatch(r: RoundLike, line: Line): boolean {
  return line.cat === 'dry' ? r.category === 'dry' && r.warehouse === line.key : r.category === 'fresh' && r.freshType === line.key;
}

export const roundDeliverDays = (r: RoundLike) => [...new Set(r.slots.map(s => s.deliver))];
export const slotForOrderDay = (r: RoundLike, day: number) => r.slots.find(s => s.order === day) || null;

/** Sunday order → Friday (v1 orderDayFor). */
export function orderDayFor(deliver: number) { let o = (deliver + 6) % 7; if (o === 6) o = 4; return o; }
/** Sat/Sun delivery → Monday (v1 deliverDayFor). */
export function deliverDayFor(order: number) { let d = (order + 1) % 7; if (d === 5 || d === 6) d = 0; return d; }

/** dry first (WH001, WH002, others), then fresh in FRESH_TYPES order — v1 sortedRounds. */
export function sortRounds<T extends RoundLike>(rounds: T[]): T[] {
  const rank = (r: RoundLike) => {
    if (r.category === 'dry') return [0, r.warehouse === 'WH001' ? 0 : r.warehouse === 'WH002' ? 1 : 9];
    const i = (FRESH_TYPES as readonly string[]).indexOf(r.freshType);
    return [1, i < 0 ? 99 : i];
  };
  return [...rounds].sort((a, b) => { const x = rank(a), y = rank(b); return x[0] - y[0] || x[1] - y[1]; });
}

export function roundLabel(r: RoundLike) { return r.category === 'dry' ? r.warehouse || 'ของแห้ง' : r.freshType || 'ของสด'; }

/** Validate + normalise slots coming from the client. */
export function cleanSlots(input: unknown): Slot[] {
  if (!Array.isArray(input)) return [];
  const out: Slot[] = [];
  for (const s of input) {
    const order = Number((s as Slot)?.order), deliver = Number((s as Slot)?.deliver);
    let cutoff = String((s as Slot)?.cutoff ?? '').trim();
    if (!Number.isInteger(order) || order < 0 || order > 6 || !Number.isInteger(deliver) || deliver < 0 || deliver > 6) continue;
    if (cutoff && !/^([01]\d|2[0-3]):[0-5]\d$/.test(cutoff)) cutoff = '';
    out.push({ order, cutoff, deliver });
  }
  return out.slice(0, 14);
}
