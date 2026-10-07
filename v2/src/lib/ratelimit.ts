import { prisma } from './db';

/** Fixed-window counter persisted in SQLite. Returns false when the limit is exceeded. */
export async function hit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const now = new Date();
  const b = await prisma.rateBucket.findUnique({ where: { key } });
  if (!b || b.resetAt < now) {
    await prisma.rateBucket.upsert({ where: { key }, create: { key, count: 1, resetAt: new Date(now.getTime() + windowMs) }, update: { count: 1, resetAt: new Date(now.getTime() + windowMs) } });
    return true;
  }
  if (b.count >= limit) return false;
  await prisma.rateBucket.update({ where: { key }, data: { count: { increment: 1 } } });
  return true;
}
export async function sweepBuckets() { await prisma.rateBucket.deleteMany({ where: { resetAt: { lt: new Date() } } }); }
