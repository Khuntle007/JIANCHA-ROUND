// Feature permissions (same 11 keys as v1) + role defaults.
export const FEATURES = [
  { key: 'calendar', label: 'ดูปฏิทิน / วันหยุด', short: 'ปฏิทิน' },
  { key: 'manageHolidays', label: 'ตั้งวันหยุด & รอบเฉพาะกิจ', short: 'ตั้งวันหยุด' },
  { key: 'branches', label: 'ดูทะเบียนสาขา', short: 'สาขา' },
  { key: 'editBranch', label: 'เพิ่ม / แก้ข้อมูลสาขา', short: 'แก้สาขา' },
  { key: 'editRounds', label: 'ตั้งค่ารอบสั่ง–ส่ง', short: 'ตั้งค่ารอบ' },
  { key: 'orders', label: 'ดูออเดอร์ PO / TR', short: 'ออเดอร์' },
  { key: 'editOrders', label: 'เพิ่ม / แก้ออเดอร์', short: 'แก้ออเดอร์' },
  { key: 'history', label: 'ดูประวัติ 1 ปี', short: 'ประวัติ' },
  { key: 'share', label: 'แชร์ลิงก์สาขา', short: 'แชร์' },
  { key: 'manageUsers', label: 'จัดการผู้ใช้ & สิทธิ์', short: 'จัดการผู้ใช้' },
  { key: 'orderDrop', label: 'External Order Drop (ใบสั่งจากแฟรนไชส์)', short: 'Order Drop' },
] as const;
export type Feature = (typeof FEATURES)[number]['key'];
export const FEATURE_KEYS = FEATURES.map(f => f.key) as Feature[];
export type PermMap = Partial<Record<Feature, boolean>>;

const ALL: PermMap = Object.fromEntries(FEATURE_KEYS.map(k => [k, true]));
const OPERATION: PermMap = { calendar: true, branches: true, orders: true, share: true };

export const SYSTEM_ROLES: { key: string; name: string; perms: PermMap; isProtected?: boolean }[] = [
  { key: 'MAIN_ADMIN', name: 'MAIN ADMIN', perms: ALL, isProtected: true },
  { key: 'SCM_MANAGER', name: 'SCM Manager', perms: ALL },
  { key: 'WH_ADMIN', name: 'WH ADMIN', perms: ALL },
  { key: 'PCM_ADMIN', name: 'PCM ADMIN', perms: ALL },
  { key: 'OPERATION', name: 'Operation', perms: OPERATION },
];

export function parsePerms(json: string | null | undefined): PermMap {
  try {
    const o = JSON.parse(json || '{}');
    return Object.fromEntries(FEATURE_KEYS.filter(k => typeof o[k] === 'boolean').map(k => [k, o[k]]));
  } catch { return {}; }
}

/** Effective permissions: protected role = everything; otherwise role perms, then per-user overrides. */
export function effectivePerms(role: { perms: string; isProtected: boolean }, overrides: string): Record<Feature, boolean> {
  if (role.isProtected) return Object.fromEntries(FEATURE_KEYS.map(k => [k, true])) as Record<Feature, boolean>;
  const r = parsePerms(role.perms), o = parsePerms(overrides);
  return Object.fromEntries(FEATURE_KEYS.map(k => [k, o[k] ?? r[k] ?? false])) as Record<Feature, boolean>;
}
