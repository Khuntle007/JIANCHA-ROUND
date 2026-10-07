import { prisma } from './db';
import type { Slot } from './domain';

export type BranchWithRounds = Awaited<ReturnType<typeof branchesWithRounds>>[number];

export async function branchesWithRounds(where: { code?: string } = {}) {
  const rows = await prisma.branch.findMany({ where, orderBy: { code: 'asc' }, include: { rounds: { orderBy: { sort: 'asc' } } } });
  return rows.map(b => ({
    ...b, createdAt: b.createdAt.toISOString(), updatedAt: b.updatedAt.toISOString(),
    rounds: b.rounds.map(r => ({ id: r.id, category: r.category, warehouse: r.warehouse, freshType: r.freshType, product: r.product, slots: JSON.parse(r.slots) as Slot[] })),
  }));
}
