import { prisma } from './db';
import { ITEM_GROUPS, OTHER_GROUP, OTHER_KEY, LEGACY_ITEM } from './drop-catalog';

const J = (s: string | null | undefined): string[] => { try { return s ? JSON.parse(s) : []; } catch { return []; } };
const uniq = (a: string[]) => a.filter((e, i) => a.findIndex(x => x.toLowerCase() === e.toLowerCase()) === i);

/**
 * Make the item groups exactly ITEM_GROUPS (+ 'other'). Idempotent.
 * Keeps each group's existing recipients; a new merged group inherits the union of its legacy groups' recipients;
 * drops on removed groups move to their merged group (LEGACY_ITEM) or 'other'.
 */
export async function applyItemGroups() {
  const existing = await prisma.itemType.findMany();
  const keep = new Set([...ITEM_GROUPS.map(g => g.key), OTHER_KEY]);
  const log: string[] = [];
  for (const [n, g] of ITEM_GROUPS.entries()) {
    const cur = existing.find(e => e.key === g.key);
    const legacy = existing.filter(e => LEGACY_ITEM[e.key] === g.key);
    const to = cur ? J(cur.to) : legacy.length ? uniq(legacy.flatMap(l => J(l.to))) : g.to;
    const cc = cur ? J(cur.cc) : uniq(legacy.flatMap(l => J(l.cc)));
    const data = { label: g.label, labelTh: g.labelTh, codes: JSON.stringify(g.codes), words: JSON.stringify(g.words), blocked: !!g.blocked, sort: n, to: JSON.stringify(g.blocked ? [] : to.length ? to : g.to), cc: JSON.stringify(g.blocked ? [] : cc) };
    await prisma.itemType.upsert({ where: { key: g.key }, create: { key: g.key, ...data }, update: data });
    log.push(`${g.key}: ${g.label} → ${g.blocked ? '(record only — never forwarded)' : (to.length ? to : g.to).join(', ') + (cc.length ? ' cc ' + cc.join(', ') : '')}`);
  }
  await prisma.itemType.upsert({ where: { key: OTHER_KEY }, create: { key: OTHER_KEY, label: OTHER_GROUP.label, labelTh: OTHER_GROUP.labelTh, sort: 9999 }, update: { sort: 9999 } });
  for (const e of existing.filter(e => !keep.has(e.key))) {
    const target = LEGACY_ITEM[e.key] || OTHER_KEY;
    const moved = await prisma.drop.updateMany({ where: { item: e.key }, data: { item: target, itemLegacy: e.key } });
    await prisma.itemType.delete({ where: { key: e.key } });
    log.push(`removed ${e.key} (${moved.count} orders → ${target})`);
  }
  return log;
}
