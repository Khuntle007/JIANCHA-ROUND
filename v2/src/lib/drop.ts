import fs from 'fs';
import path from 'path';
import { prisma } from './db';
import { env } from './env';
import { hmac, safeEqual, sha256 } from './crypto';
import { sendMail, escHtml, brandHead } from './mail';
import { OTHER_KEY, ITEM_GROUPS, OTHER_GROUP, normName, emailOk } from './drop-catalog';
import { todayISO } from './dates';
import { codeOf, stripCode, type PoData, type PoLine } from './po';
import { dropSettings } from './settings';

export const ATTACH_MAX = 3 * 1024 * 1024; // Graph sendMail inline-attachment ceiling (~4 MB request)
const LINK_TTL = 14 * 24 * 3600 * 1000;
const J = <T>(s: string | null | undefined, d: T): T => { try { return s ? (JSON.parse(s) as T) : d; } catch { return d; } };

export type Route =
  | { kind: 'supplier'; supplierId: string; supplierName: string; to: string[]; cc: string[]; chosenBy?: string; chosenAt?: string }
  | { kind: 'pending'; code: string; options: { id: string; name: string; to: string[]; cc: string[] }[] };
export type ItemTypeRow = { key: string; label: string; labelTh: string; to: string[]; cc: string[]; codes: string[]; words: string[]; sort: number };

export const filesDir = () => { const d = path.join(env.dataDir, 'files'); fs.mkdirSync(d, { recursive: true }); return d; };
export const dropFile = (id: string) => path.join(filesDir(), `${id}.pdf`);
export const parseRoute = (s: string | null) => J<Route | null>(s, null);
export const parsePoJson = (s: string | null) => J<PoData | null>(s, null);

/** Item groups, seeding the defaults on first use. 'other' always exists and is last. */
export async function itemTypes(): Promise<ItemTypeRow[]> {
  if (!(await prisma.itemType.count()))
    await prisma.itemType.createMany({ data: [...ITEM_GROUPS, OTHER_GROUP].map((i, n) => ({ key: i.key, label: i.label, labelTh: i.labelTh, to: JSON.stringify(i.to), cc: '[]', codes: JSON.stringify(i.codes), words: JSON.stringify(i.words), sort: i.key === OTHER_KEY ? 9999 : n })) });
  if (!(await prisma.itemType.findUnique({ where: { key: OTHER_KEY } })))
    await prisma.itemType.create({ data: { key: OTHER_KEY, label: OTHER_GROUP.label, labelTh: OTHER_GROUP.labelTh, sort: 9999 } });
  return (await prisma.itemType.findMany({ orderBy: { sort: 'asc' } })).map(i => ({ ...i, to: J<string[]>(i.to, []), cc: J<string[]>(i.cc, []), codes: J<string[]>(i.codes, []), words: J<string[]>(i.words, []) }));
}

/** Group for a PO line: product code first, then label / Thai label / keywords contained in the name, else 'other'. */
export function itemForLine(name: string, items: Pick<ItemTypeRow, 'key' | 'label' | 'labelTh' | 'codes' | 'words'>[]) {
  const code = codeOf(name);
  if (code) { const byCode = items.find(i => i.key !== OTHER_KEY && i.codes.includes(code)); if (byCode) return byCode.key; }
  const n = normName(name);
  const hit = items.find(i => i.key !== OTHER_KEY && [i.label, i.labelTh, ...i.words].some(w => normName(w).length >= 2 && n.includes(normName(w))));
  return hit ? hit.key : OTHER_KEY;
}

async function nextSeq(): Promise<number> {
  const c = await prisma.counter.upsert({ where: { key: 'drop' }, create: { key: 'drop', value: 1 }, update: { value: { increment: 1 } } });
  return c.value;
}

/** Split a PO into routing groups and store one drop per group (same PDF for each). */
export async function createDropsFromPo(opts: { po: PoData; buf: Buffer; fileName: string; link: { id: string; name: string; branchCode?: string | null }; ip: string }) {
  const { po, buf } = opts;
  const items = await itemTypes();
  type G = { route: Route | null; item: string; lines: PoLine[] };
  const groups = new Map<string, G>();
  for (const l of po.lines) {
    const code = codeOf(l.name);
    let sups: { id: string; name: string; to: string[]; cc: string[] }[] = [];
    if (code) {
      const p = await prisma.product.upsert({
        where: { code }, create: { code, name: stripCode(l.name), source: 'po', seen: true }, update: { seen: true },
        include: { suppliers: { include: { supplier: true } } },
      });
      if (!p.name) await prisma.product.update({ where: { code }, data: { name: stripCode(l.name) } });
      sups = p.suppliers.map(x => ({ id: x.supplier.id, name: x.supplier.name, to: J<string[]>(x.supplier.to, []), cc: J<string[]>(x.supplier.cc, []) })).filter(x => x.to.length);
    }
    let key: string, route: Route | null = null;
    if (sups.length === 1) { route = { kind: 'supplier', supplierId: sups[0].id, supplierName: sups[0].name, to: sups[0].to, cc: sups[0].cc }; key = 'to:' + [...sups[0].to].sort().join(','); }
    else if (sups.length > 1) { route = { kind: 'pending', code, options: sups }; key = 'pending:' + code; }
    else key = 'item:' + itemForLine(l.name, items);
    if (!groups.has(key)) groups.set(key, { route, item: itemForLine(l.name, items), lines: [] });
    groups.get(key)!.lines.push(l);
  }
  const ymd = todayISO().replace(/-/g, ''), hash = sha256(buf), partial = groups.size > 1;
  const out: { id: string; ref: string; item: string; pending: boolean }[] = [];
  for (const g of groups.values()) {
    const gpo: PoData = { ...po, lines: g.lines, partial, ...(partial ? { total: Math.round(g.lines.reduce((x, l) => x + l.total, 0) * 100) / 100 } : {}) };
    const pending = g.route?.kind === 'pending';
    const d = await prisma.drop.create({ data: {
      ref: `OD-${ymd}-${String(await nextSeq()).padStart(4, '0')}`, linkId: opts.link.id, sourceName: opts.link.name, branchCode: opts.link.branchCode || '',
      branchName: po.buyer || '-', issuerName: po.issuedBy || opts.link.name, item: g.item, fileName: opts.fileName, size: buf.length, sha256: hash,
      po: JSON.stringify(gpo), poNumber: po.number, route: g.route ? JSON.stringify(g.route) : null, emailStatus: pending ? 'pending' : 'queued', ip: opts.ip,
    } });
    fs.writeFileSync(dropFile(d.id), buf, { mode: 0o600 });
    out.push({ id: d.id, ref: d.ref, item: g.item, pending });
  }
  return out;
}

export function signedFileUrl(id: string) {
  const exp = Date.now() + LINK_TTL;
  return `${env.appUrl}/api/public/drop-file/${id}?exp=${exp}&sig=${hmac(`drop:${id}.${exp}`)}`;
}
export function verifyFileSig(id: string, exp: number, sig: string) {
  return exp > Date.now() && safeEqual(hmac(`drop:${id}.${exp}`), sig || '');
}

const money = (n: number | null | undefined) => (n == null ? '' : Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const shell = (inner: string) => `<div style="font-family:Arial,Helvetica,sans-serif;max-width:680px">
  <div style="background:#181818;color:#fff;padding:16px 20px;border-bottom:2px solid #AD9C82">${brandHead('ORDER DROP')}</div>
  <div style="border:1px solid #EBE9E6;border-top:3px solid #AD9C82;padding:18px 20px">${inner}</div>
  <p style="font-size:11px;color:#525252;margin:10px 2px">อีเมลอัตโนมัติจากระบบ JC-ROUND — กรุณาอย่าตอบกลับ / Automated message, please do not reply.</p></div>`;

type DropRow = NonNullable<Awaited<ReturnType<typeof prisma.drop.findUnique>>>;
function buildMail(d: DropRow, item: ItemTypeRow) {
  const po = parsePoJson(d.po);
  const subject = `[JIANCHA Order Drop] ${item.label} · ${po ? (po.buyer || d.branchName) + ' · ' + po.number : d.branchName} · ${d.ref}`;
  const big = d.size > ATTACH_MAX;
  const when = d.createdAt.toLocaleString('en-GB', { timeZone: 'Asia/Bangkok' });
  const row = (k: string, v: string) => (v ? `<tr><td style="padding:5px 14px 5px 0;color:#525252;font-size:12px;letter-spacing:.06em;text-transform:uppercase;vertical-align:top">${k}</td><td style="padding:5px 0;font-size:14px;color:#181818"><b>${v}</b></td></tr>` : '');
  const td = (v: unknown, al = 'left') => `<td style="padding:6px 8px;border-bottom:1px solid #EBE9E6;font-size:13px;text-align:${al}">${v}</td>`;
  const th = (v: string, al = 'left') => `<th style="padding:6px 8px;background:#F3F1EB;font-size:11px;letter-spacing:.05em;text-transform:uppercase;text-align:${al}">${v}</th>`;
  const itemTxt = escHtml(item.label) + (item.labelTh ? ' · ' + escHtml(item.labelTh) : '');
  let head: string, body = '';
  if (po) {
    head = row('Ref', escHtml(d.ref)) + row('PO No.', escHtml(po.number)) + row('Item', itemTxt) + row('Buyer / Ship to', escHtml(po.buyer))
      + row('Contact', escHtml(po.contact) + (po.tel && po.tel !== '-' && po.tel !== '--' ? ' · ' + escHtml(po.tel) : ''))
      + row('Issued date', escHtml(po.issuedDate)) + row('Due date', po.dueDate && po.dueDate !== '-' ? escHtml(po.dueDate) : '')
      + row('Credit terms', po.creditTerms && po.creditTerms !== '-' ? escHtml(po.creditTerms) : '') + row('Issued by', escHtml(po.issuedBy || d.issuerName)) + row('Submitted', escHtml(when) + ' (BKK)');
    body = `<table style="border-collapse:collapse;width:100%;margin-top:16px"><tr>${th('No.')}${th('Ingredient')}${th('Qty', 'right')}${th('Unit')}${th('VAT')}${th('Price', 'right')}${th('Total', 'right')}</tr>`
      + po.lines.map((l, i) => `<tr>${td(i + 1)}${td(escHtml(l.name))}${td(escHtml(l.qty), 'right')}${td(escHtml(l.unit))}${td(escHtml(l.vat))}${td(money(l.price), 'right')}${td(money(l.total), 'right')}</tr>`).join('') + '</table>'
      + `<table style="border-collapse:collapse;margin:10px 0 0 auto">${po.partial
        ? `<tr><td style="padding:3px 14px;font-size:13px;color:#525252">Total (this item)</td><td style="padding:3px 0;font-size:14px;text-align:right"><b>${money(po.total)}</b></td></tr>`
        : `<tr><td style="padding:3px 14px;font-size:13px;color:#525252">Total</td><td style="text-align:right;font-size:13px">${money(po.total)}</td></tr>`
          + `<tr><td style="padding:3px 14px;font-size:13px;color:#525252">VAT${po.vatRate ? ' (' + escHtml(po.vatRate) + '%)' : ''}</td><td style="text-align:right;font-size:13px">${money(po.vat)}</td></tr>`
          + `<tr><td style="padding:3px 14px;font-size:14px"><b>Grand Total</b></td><td style="text-align:right;font-size:15px"><b>${money(po.grand)}</b></td></tr>`}</table>`
      + (po.partial ? `<p style="font-size:11px;color:#8a6d00;margin:8px 0 0">ใบ PO นี้มีหลายประเภทสินค้า — เมลนี้แสดงเฉพาะรายการของ ${escHtml(item.label)} / This PO has several item types; only this item's lines are shown.</p>` : '')
      + (po.remarks ? `<p style="font-size:13px;margin:12px 0 0"><span style="color:#525252">Remarks:</span> ${escHtml(po.remarks)}</p>` : '');
  } else {
    head = row('Ref', escHtml(d.ref)) + row('Item', itemTxt) + row('Branch', escHtml(d.branchName) + (d.branchCode ? ' (' + escHtml(d.branchCode) + ')' : ''))
      + row('Issued by', escHtml(d.issuerName)) + row('Submitted', escHtml(when) + ' (BKK)') + row('File', escHtml(d.fileName));
  }
  const html = shell(`<p style="margin:0 0 12px;font-size:14px">มีใบสั่งซื้อใหม่จากสาขาแฟรนไชส์ / New franchise order received.</p>
   <table style="border-collapse:collapse">${head}</table>${body}
   ${big ? `<p style="margin:16px 0 0"><a href="${signedFileUrl(d.id)}" style="background:#181818;color:#fff;padding:10px 16px;text-decoration:none;font-size:13px;letter-spacing:.06em">DOWNLOAD PDF</a><br><span style="font-size:11px;color:#525252">ไฟล์ใหญ่เกินแนบอีเมล — ลิงก์ใช้ได้ 14 วัน / File too large to attach — link valid 14 days.</span></p>` : `<p style="font-size:12px;color:#525252;margin:14px 0 0">ไฟล์ PDF แนบมากับอีเมลนี้ / PDF attached.</p>`}`);
  return { subject, html, big };
}

export async function deliverDrop(id: string) {
  const d = await prisma.drop.findUnique({ where: { id } });
  if (!d || d.emailStatus === 'pending') return;
  await prisma.drop.update({ where: { id }, data: { emailStatus: 'sending', emailAttempts: { increment: 1 } } });
  try {
    const items = await itemTypes();
    const item = items.find(i => i.key === d.item) || { key: d.item, label: d.item, labelTh: '', to: [], cc: [], codes: [], words: [], sort: 0 };
    const route = parseRoute(d.route);
    const rec = route?.kind === 'supplier' ? route : item; // supplier from product code wins over item-type recipients
    if (!rec.to.length) throw new Error('no recipient configured for ' + (route?.kind === 'supplier' ? route.supplierName : 'item ' + d.item));
    const { subject, html, big } = buildMail(d, item);
    const r = await sendMail({ to: rec.to, cc: rec.cc, subject, html, attachments: big ? [] : [{ name: d.fileName, contentType: 'application/pdf', content: fs.readFileSync(dropFile(d.id)) }] });
    await prisma.drop.update({ where: { id }, data: { emailStatus: r.dryRun ? 'dry-run' : 'sent', emailTo: JSON.stringify(rec.to), emailCc: JSON.stringify(rec.cc), emailSentAt: new Date(), emailError: '' } });
  } catch (e) {
    console.error('[drop mail]', d.ref, e);
    await prisma.drop.update({ where: { id }, data: { emailStatus: 'failed', emailError: String((e as Error).message || e).slice(0, 400) } });
  }
}

/** Tell SCM which PO lines are waiting for a supplier choice (several suppliers for one product code). */
export async function notifyScm(ids: string[]) {
  if (!ids.length) return;
  const to = (await dropSettings()).scmEmails.filter(emailOk);
  if (!to.length) return;
  const drops = await prisma.drop.findMany({ where: { id: { in: ids }, emailStatus: 'pending' }, orderBy: { createdAt: 'asc' } });
  if (!drops.length) return;
  const byPo = new Map<string, typeof drops>();
  drops.forEach(d => { const k = d.poNumber || d.ref; byPo.set(k, [...(byPo.get(k) || []), d]); });
  const td = (v: string) => `<td style="padding:6px 8px;border-bottom:1px solid #EBE9E6;font-size:13px">${v}</td>`;
  const blocks = [...byPo].map(([no, ds]) => `<p style="margin:14px 0 4px;font-size:14px"><b>${escHtml(no)}</b> · ${escHtml(ds[0].branchName)}</p><table style="border-collapse:collapse;width:100%">${ds.map(d => {
    const po = parsePoJson(d.po), r = parseRoute(d.route);
    const opts = r?.kind === 'pending' ? r.options.map(o => escHtml(o.name)).join(' / ') : '';
    return (po?.lines || []).map(l => `<tr>${td(escHtml(d.ref))}${td(escHtml(l.name))}${td(escHtml(l.qty) + ' ' + escHtml(l.unit))}${td('<span style="color:#8a6d00">' + opts + '</span>')}</tr>`).join('');
  }).join('')}</table>`).join('');
  const html = shell(`<p style="margin:0 0 8px;font-size:14px">มีรายการสินค้าที่มี supplier หลายเจ้า ระบบ<b>ยังไม่ได้ส่ง</b>อีเมลถึง supplier กรุณาเลือก supplier / These items have several suppliers — nothing was sent yet. Please choose one.</p>${blocks}
    <p style="margin:18px 0 0"><a href="${env.appUrl}/drops?tab=pending" style="background:#181818;color:#fff;padding:10px 16px;text-decoration:none;font-size:13px;letter-spacing:.06em">เปิดหน้ารอเลือก supplier</a></p>`);
  try {
    await sendMail({ to, subject: `[JIANCHA Order Drop] รอเลือก supplier · ${[...byPo.keys()].join(', ')}`, html });
    await prisma.drop.updateMany({ where: { id: { in: drops.map(d => d.id) } }, data: { notifiedAt: new Date(), notifyError: '' } });
  } catch (e) {
    console.error('[notify-scm]', e);
    await prisma.drop.updateMany({ where: { id: { in: drops.map(d => d.id) } }, data: { notifyError: String((e as Error).message || e).slice(0, 300) } });
  }
}

/** Re-notify SCM about drops still waiting longer than reminderHours. */
export async function remindPending() {
  const h = (await dropSettings()).reminderHours;
  if (!h) return;
  const cutoff = new Date(Date.now() - h * 3600_000);
  const due = await prisma.drop.findMany({ where: { emailStatus: 'pending', OR: [{ notifiedAt: { lt: cutoff } }, { notifiedAt: null, createdAt: { lt: cutoff } }] }, select: { id: true } });
  await notifyScm(due.map(d => d.id));
}
