import { prisma } from './db';

export type DropSettings = { scmEmails: string[]; reminderHours: number };
export type BcStatus = { lastSyncAt?: string; count?: number; company?: string; error?: string; failedAt?: string };

async function get<T>(key: string, def: T): Promise<T> {
  const r = await prisma.setting.findUnique({ where: { key } });
  try { return r ? { ...def, ...JSON.parse(r.value) } : def; } catch { return def; }
}
async function set(key: string, value: unknown) {
  await prisma.setting.upsert({ where: { key }, create: { key, value: JSON.stringify(value) }, update: { value: JSON.stringify(value) } });
}
export const dropSettings = () => get<DropSettings>('dropScm', { scmEmails: [], reminderHours: 0 });
export const saveDropSettings = (v: DropSettings) => set('dropScm', v);
export const bcStatus = () => get<BcStatus>('bc', {});
export const saveBcStatus = (v: BcStatus) => set('bc', v);
