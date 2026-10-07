import fs from 'fs';
import { prisma } from './db';
import { randomToken } from './crypto';

type Row = { seq: number; code: string; name: string; fromCode: string };

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Move a branch to a new code inside a transaction: rounds, orders, share links, specials, drops and its link follow. */
async function moveBranchTx(tx: Tx, from: string, to: string, patch: { nameEn?: string; nameTh?: string; type?: string } = {}) {
  const src = await tx.branch.findUniqueOrThrow({ where: { code: from } });
  if (await tx.branch.findUnique({ where: { code: to } })) throw new Error(`target ${to} already exists`);
  const { code: _c, createdAt: _a, updatedAt: _u, ...fields } = src;
  await tx.branch.create({ data: { ...fields, ...patch, code: to } });
  for (const m of ['round', 'order', 'shareLink', 'special', 'drop', 'dropLink'] as const)
    await (tx[m] as unknown as { updateMany: (a: unknown) => Promise<unknown> }).updateMany({ where: { branchCode: from }, data: { branchCode: to } });
  await tx.branch.delete({ where: { code: from } });
  return src;
}

/**
 * Re-code many branches, all-or-nothing. Chains (A→B while B→C) are handled by parking on temporary codes first.
 * Each mapping is remembered in Setting 'recodes' and never applied twice (re-running the same file is a no-op).
 */
export async function recodeMany(moves: { from: string; to: string; patch?: { nameEn?: string; nameTh?: string; type?: string } }[], actor = 'recode') {
  const key = (m: { from: string; to: string }) => `${m.from}>${m.to}`;
  const doneRow = await prisma.setting.findUnique({ where: { key: 'recodes' } });
  const done = new Set<string>(doneRow ? JSON.parse(doneRow.value) : []);
  const todo = moves.filter(m => m.from !== m.to && !done.has(key(m)));
  if (!todo.length) return [];
  await prisma.$transaction(async tx => {
    for (const m of todo) if (!(await tx.branch.findUnique({ where: { code: m.from } }))) throw new Error('missing source ' + m.from);
    const parked: (typeof todo[number] & { tmp: string; was: string })[] = [];
    for (const [i, m] of todo.entries()) { const tmp = 'ZZ' + String(900 + i); const src = await moveBranchTx(tx, m.from, tmp); parked.push({ ...m, tmp, was: src.nameEn }); }
    for (const m of parked) {
      await moveBranchTx(tx, m.tmp, m.to, m.patch || {});
      await tx.auditLog.create({ data: { action: 'branch.recoded', actorName: actor, target: `${m.from} → ${m.to}`, meta: JSON.stringify({ was: m.was, ...(m.patch || {}) }) } });
    }
    const all = [...done, ...todo.map(key)];
    await tx.setting.upsert({ where: { key: 'recodes' }, create: { key: 'recodes', value: JSON.stringify(all) }, update: { value: JSON.stringify(all) } });
  }, { timeout: 60_000 });
  return todo.map(m => `${m.from} → ${m.to}`);
}

export function readFranchiseCsv(file: string): Row[] {
  const [head, ...lines] = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/);
  const cols = head.split(',');
  return lines.map(l => {
    const v: string[] = []; let cur = '', q = false;
    for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { v.push(cur); cur = ''; } else cur += ch; }
    v.push(cur);
    const o = Object.fromEntries(cols.map((c, i) => [c, (v[i] || '').trim()]));
    return { seq: Number(o.seq) || 0, code: o.code, name: o.name, fromCode: o.fromCode || '' };
  }).filter(r => /^[A-Z]{1,4}\d{2,5}$/.test(r.code) && r.name);
}

/**
 * Apply the official franchise list (idempotent):
 *  - fromCode set & target missing → move the branch to the new code (rounds, orders, share links, specials follow),
 *    official name → nameEn, previous name kept in nameTh (if empty), type FC
 *  - target exists → just update name / type
 *  - otherwise create a new FC branch
 *  - every store gets exactly one Order Drop link (created once, never rotated here)
 */
export async function applyFranchise(rows: Row[], actor = 'franchise-import') {
  const log: string[] = [];
  for (const r of rows) {
    const target = await prisma.branch.findUnique({ where: { code: r.code } });
    if (!target && r.fromCode) {
      const src = await prisma.branch.findUnique({ where: { code: r.fromCode } });
      if (src) {
        const { code: _c, createdAt: _a, updatedAt: _u, ...fields } = src;
        await prisma.$transaction([
          prisma.branch.create({ data: { ...fields, code: r.code, nameEn: r.name, nameTh: src.nameTh || (src.nameEn !== r.name ? src.nameEn : ''), type: 'FC' } }),
          prisma.round.updateMany({ where: { branchCode: r.fromCode }, data: { branchCode: r.code } }),
          prisma.order.updateMany({ where: { branchCode: r.fromCode }, data: { branchCode: r.code } }),
          prisma.shareLink.updateMany({ where: { branchCode: r.fromCode }, data: { branchCode: r.code } }),
          prisma.special.updateMany({ where: { branchCode: r.fromCode }, data: { branchCode: r.code } }),
          prisma.drop.updateMany({ where: { branchCode: r.fromCode }, data: { branchCode: r.code } }),
          prisma.branch.delete({ where: { code: r.fromCode } }),
          prisma.auditLog.create({ data: { action: 'branch.recoded', actorName: actor, target: `${r.fromCode} → ${r.code}`, meta: JSON.stringify({ name: r.name, was: src.nameEn }) } }),
        ]);
        log.push(`recoded ${r.fromCode} "${src.nameEn}" → ${r.code} "${r.name}"`);
      } else log.push(`WARN ${r.code}: source ${r.fromCode} not found`);
    }
    const b = await prisma.branch.findUnique({ where: { code: r.code } });
    if (!b) {
      await prisma.branch.create({ data: { code: r.code, nameEn: r.name, type: 'FC' } });
      await prisma.auditLog.create({ data: { action: 'branch.created', actorName: actor, target: r.code, meta: JSON.stringify({ name: r.name }) } });
      log.push(`created ${r.code} "${r.name}"`);
    } else if (b.nameEn !== r.name || b.type !== 'FC') {
      await prisma.branch.update({ where: { code: r.code }, data: { nameEn: r.name, type: 'FC', nameTh: b.nameTh || (b.nameEn !== r.name ? b.nameEn : '') } });
    }
    if (!(await prisma.dropLink.findUnique({ where: { branchCode: r.code } }))) {
      await prisma.dropLink.create({ data: { token: randomToken(18), name: `${r.code} ${r.name}`, branchCode: r.code, createdBy: actor } });
      log.push(`link ${r.code}`);
    }
  }
  return log;
}
