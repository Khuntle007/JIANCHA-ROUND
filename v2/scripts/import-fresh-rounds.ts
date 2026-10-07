// Rebuild FRESH rounds from "รอบสั่ง-ส่งของสด*.xlsx" (one sheet per product). Dry rounds are never touched.
//   npx tsx scripts/import-fresh-rounds.ts <file.xlsx> [--apply]      (without --apply = preview only)
// Rules (confirmed 2026-10-07): cut-off 12:00 everywhere, Sunday off; X = delivery day.
//  fruit: order the day before (Mon ← Sat); Pattaya/Rayong fixed Sat→Mon, Wed→Thu, Thu→Fri; Maya Chiang Mai none
//  whipping/cream cheese, Malee, Meiji: order the day before, Monday ← Friday; explicit "สั่ง" cells override;
//    Central Pattaya whipping = Mon/Tue/Thu (file row is a copy error)
//  yogurt: explicit order row + supplier-delivery row; each order → next delivery day
//  stores not in the file: their fresh rounds are removed (the file is the master)
//  ice hot: by zone — central Mon→Wed, Wed→Fri, Fri→Mon · Pattaya/Rayong/Nakhon Pathom Mon→Thu, Wed→Sat, Fri→Tue ·
//    Chiang Mai Mon→Fri, Wed→Fri, Fri→Tue (as written)
import ExcelJS from 'exceljs';
import { prisma } from '../src/lib/db';
import type { Slot } from '../src/lib/domain';

const CUT = '12:00';
const s = (v: unknown) => { const x = v && typeof v === 'object' && 'richText' in (v as object) ? (v as { richText: { text: string }[] }).richText.map(t => t.text).join('') : v; return String(x ?? '').trim(); };
const before = (d: number, mondayFrom: number) => (d === 0 ? mondayFrom : d - 1); // order day for a delivery day (0 = Mon)
type Line = { freshType: string; product: string; slots: Slot[] };
const plan = new Map<string, Line[]>(); // branch → fresh rounds
const add = (code: string, l: Line) => { if (l.slots.length) plan.set(code, [...(plan.get(code) || []), l]); };
const names = new Map<string, string>();

function codeFor(id: string, name: string) {
  if (id === 'JC007' && /ชั้น\s*G/i.test(name)) return 'JC040'; // the file reuses JC007 for both Siam Paragon floors
  return id;
}

async function main() {
  const file = process.argv[2], apply = process.argv.includes('--apply');
  if (!file) throw new Error('usage: import-fresh-rounds.ts <file.xlsx> [--apply]');
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(file);
  const sheet = (t: string) => wb.worksheets.find(w => w.name.includes(t)) || (() => { throw new Error('sheet not found: ' + t); })();
  // grid sheets: col A id, col B name, C..I = Mon..Sun
  const grid = (t: string, f: (code: string, name: string, x: number[], order: number[]) => void) => {
    sheet(t).eachRow(r => {
      const id = s(r.getCell(1).value);
      if (!/^J[CF]\d{3}$/.test(id)) return;
      const name = s(r.getCell(2).value), cells = [3, 4, 5, 6, 7, 8, 9].map(c => s(r.getCell(c).value));
      const code = codeFor(id, name); names.set(code, name);
      f(code, name, cells.flatMap((c, i) => (/^x$/i.test(c) ? [i] : [])), cells.flatMap((c, i) => (/สั่ง/.test(c) ? [i] : [])));
    });
  };
  grid('มาลี', (code, _n, x) => add(code, { freshType: 'นมสด', product: 'นมสดมาลี', slots: x.map(d => ({ order: before(d, 4), cutoff: CUT, deliver: d })) }));
  grid('เมจิ', (code, _n, x) => add(code, { freshType: 'นมสด', product: 'นมเมจิ (ทำไอติม)', slots: x.map(d => ({ order: before(d, 4), cutoff: CUT, deliver: d })) }));
  grid('วิปปิ้ง', (code, _n, x, ord) => {
    if (code === 'JF023') x = [0, 1, 3]; // Central Pattaya: standard 3 rounds (file row is a copy error)
    const slots = ord.length
      ? x.map(d => ({ order: [...ord].reverse().find(o => o < d) ?? ord[ord.length - 1], cutoff: CUT, deliver: d })) // explicit order cell (e.g. Rayong Thu → Sat)
      : x.map(d => ({ order: before(d, 4), cutoff: CUT, deliver: d }));
    add(code, { freshType: 'วิปปิ้งครีม & ครีมชีส', product: 'วิปปิ้งครีม / ครีมชีส', slots });
  });
  grid('ผลไม้', (code, _n, x) => {
    if (code === 'JF039') return; // Maya Chiang Mai: not served
    const slots = code === 'JF023' || code === 'JF050'
      ? [{ order: 5, deliver: 0 }, { order: 2, deliver: 3 }, { order: 3, deliver: 4 }].map(v => ({ ...v, cutoff: CUT }))
      : x.map(d => ({ order: before(d, 5), cutoff: CUT, deliver: d }));
    add(code, { freshType: 'ผลไม้', product: 'ผลไม้สด', slots });
  });
  // yogurt: id row = order marks, next row = supplier delivery marks; cols E..K = Mon..Sun
  const yg = sheet('โยเกิร์ต'); let pending: { code: string; ord: number[] } | null = null;
  yg.eachRow(r => {
    const id = s(r.getCell(1).value), cells = [5, 6, 7, 8, 9, 10, 11].map(c => s(r.getCell(c).value));
    if (/^J[CF]\d{3}$/.test(id)) { const code = codeFor(id, s(r.getCell(4).value) || s(r.getCell(3).value)); pending = { code, ord: cells.flatMap((c, i) => (/สั่ง/.test(c) ? [i] : [])) }; if (!names.has(code)) names.set(code, s(r.getCell(4).value)); return; }
    if (pending && cells.some(c => /ส่ง/.test(c))) {
      const del = cells.flatMap((c, i) => (/ส่ง/.test(c) ? [i] : []));
      const next = (o: number) => del.map(d => ({ d, gap: (d - o + 7) % 7 || 7 })).sort((a, b) => a.gap - b.gap)[0].d;
      add(pending.code, { freshType: 'โยเกิร์ต', product: 'โยเกิร์ต', slots: pending.ord.map(o => ({ order: o, cutoff: CUT, deliver: next(o) })) });
      pending = null;
    }
  });
  // ice hot by zone, for every branch that appears in the file
  const ZONE: Record<string, [number, number][]> = {
    central: [[0, 2], [2, 4], [4, 0]], east: [[0, 3], [2, 5], [4, 1]], cm: [[0, 4], [2, 4], [4, 1]],
  };
  for (const code of names.keys()) {
    const z = ['JF023', 'JF050', 'JF055'].includes(code) ? 'east' : code === 'JF039' ? 'cm' : 'central';
    add(code, { freshType: 'ไอซ์ฮอต', product: 'ไอซ์ฮอต', slots: ZONE[z].map(([order, deliver]) => ({ order, cutoff: CUT, deliver })) });
  }

  // compare with the database
  const known = new Set((await prisma.branch.findMany({ select: { code: true } })).map(b => b.code));
  const missing = [...plan.keys()].filter(c => !known.has(c));
  let changed = 0;
  for (const [code, lines] of plan) {
    if (!known.has(code)) continue;
    const cur = await prisma.round.findMany({ where: { branchCode: code, category: 'fresh' }, orderBy: { sort: 'asc' } });
    const sig = (a: { freshType: string; product: string; slots: Slot[] }[]) => JSON.stringify(a.map(l => [l.freshType, l.product, [...l.slots].sort((x, y) => x.deliver - y.deliver || x.order - y.order)]).sort());
    if (sig(cur.map(r => ({ freshType: r.freshType, product: r.product, slots: JSON.parse(r.slots) }))) !== sig(lines)) changed++;
    if (apply) {
      const maxSort = (await prisma.round.aggregate({ where: { branchCode: code, category: 'dry' }, _max: { sort: true } }))._max.sort ?? -1;
      await prisma.$transaction([
        prisma.round.deleteMany({ where: { branchCode: code, category: 'fresh' } }),
        prisma.round.createMany({ data: lines.map((l, i) => ({ branchCode: code, category: 'fresh', warehouse: '', freshType: l.freshType, product: l.product, slots: JSON.stringify(l.slots), sort: maxSort + 1 + i })) }),
      ]);
    }
  }
  // the file is the master for fresh items: stores/warehouses not in it lose stale fresh rounds (dry rounds stay)
  const stale = await prisma.round.findMany({ where: { category: 'fresh', branchCode: { notIn: [...plan.keys()] } }, distinct: ['branchCode'], select: { branchCode: true } });
  if (apply && stale.length) await prisma.round.deleteMany({ where: { category: 'fresh', branchCode: { in: stale.map(x => x.branchCode) } } });
  console.log(`branches in file ${plan.size} · would change ${changed} · not in system: ${missing.join(', ') || 'none'} · fresh rounds removed (not in file): ${stale.map(x => x.branchCode).join(', ') || 'none'}`);
  const per = (t: string) => [...plan.values()].filter(ls => ls.some(l => l.product === t)).length;
  console.log(`rounds: Malee ${per('นมสดมาลี')} · Meiji ${per('นมเมจิ (ทำไอติม)')} · whipping ${per('วิปปิ้งครีม / ครีมชีส')} · yogurt ${per('โยเกิร์ต')} · fruit ${per('ผลไม้สด')} · ice hot ${per('ไอซ์ฮอต')}`);
  for (const c of ['JC002', 'JF023', 'JF050', 'JF039', 'JC007', 'JC040']) {
    const dn = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];
    console.log(`  ${c} ${names.get(c) || ''}: ` + (plan.get(c) || []).map(l => `${l.product} ${l.slots.map(x => dn[x.order] + '→' + dn[x.deliver]).join(',')}`).join(' | '));
  }
  if (apply) await prisma.auditLog.create({ data: { action: 'rounds.fresh_imported', actorName: 'import-fresh-rounds', meta: JSON.stringify({ file: file.split('/').pop(), branches: plan.size, changed }) } });
  console.log(apply ? 'APPLIED' : 'preview only — add --apply to write');
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
