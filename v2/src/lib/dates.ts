// All business dates are Bangkok calendar dates as ISO strings (yyyy-mm-dd).
// Fixes the v1 off-by-one (v1 used UTC toISOString on local-midnight dates).
const TZ = 'Asia/Bangkok';

export function todayISO(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: TZ }); // en-CA → yyyy-mm-dd
}

/** Pure calendar arithmetic on ISO dates (no timezone involved). */
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** Weekday index with 0 = Monday … 6 = Sunday (the convention used by all round data). */
export function monIndex(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

export function sameMonth(iso: string, ref: string): boolean {
  return iso.slice(0, 7) === ref.slice(0, 7);
}

export function isISODate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** Thai display: "07 ต.ค. 69" (Buddhist era, 2-digit year) — same as v1. */
export function fmtDate(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('th-TH', { timeZone: 'UTC', day: '2-digit', month: 'short', year: '2-digit' });
}

export function fmtDateTime(ts: string | Date): string {
  return new Date(ts).toLocaleString('th-TH', { timeZone: TZ, day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function isoToDMY(iso: string): string {
  if (!iso) return '';
  const p = iso.split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : '';
}

export function dmyToISO(s: string): string {
  const m = (s || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return '';
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return isISODate(iso) ? iso : '';
}
