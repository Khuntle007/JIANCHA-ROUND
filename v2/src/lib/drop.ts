import fs from 'fs';
import path from 'path';
import { prisma } from './db';
import { env } from './env';
import { hmac, safeEqual } from './crypto';
import { sendMail, layout, escHtml, button } from './mail';
import { CATALOG, catalogItem, DEFAULT_TO } from './drop-catalog';
import { todayISO } from './dates';

export const ATTACH_MAX = 3 * 1024 * 1024; // Graph sendMail inline-attachment ceiling (~4 MB request)
const LINK_TTL = 14 * 24 * 3600 * 1000;

export const filesDir = () => { const d = path.join(env.dataDir, 'files'); fs.mkdirSync(d, { recursive: true }); return d; };
export const dropFile = (id: string) => path.join(filesDir(), `${id}.pdf`);

export async function routes() {
  const rows = await prisma.itemRoute.findMany();
  return CATALOG.map(c => {
    const r = rows.find(x => x.key === c.key);
    const to = r ? (JSON.parse(r.to) as string[]) : DEFAULT_TO[c.key] || [];
    const cc = r ? (JSON.parse(r.cc) as string[]) : [];
    return { ...c, to, cc };
  });
}

export async function nextRef(): Promise<string> {
  const c = await prisma.counter.upsert({ where: { key: 'drop' }, create: { key: 'drop', value: 1 }, update: { value: { increment: 1 } } });
  return `OD-${todayISO().replace(/-/g, '')}-${String(c.value).padStart(4, '0')}`;
}

export function signedFileUrl(id: string) {
  const exp = Date.now() + LINK_TTL;
  return `${env.appUrl}/api/public/drop-file/${id}?exp=${exp}&sig=${hmac(`drop:${id}.${exp}`)}`;
}
export function verifyFileSig(id: string, exp: number, sig: string) {
  return exp > Date.now() && safeEqual(hmac(`drop:${id}.${exp}`), sig || '');
}

export async function deliverDrop(id: string) {
  const d = await prisma.drop.findUnique({ where: { id } });
  if (!d) return;
  const item = catalogItem(d.item);
  const route = (await routes()).find(r => r.key === d.item);
  await prisma.drop.update({ where: { id }, data: { emailStatus: 'sending', emailAttempts: { increment: 1 } } });
  try {
    if (!item || !route || !route.to.length) throw new Error('no recipient configured for item ' + d.item);
    const big = d.size > ATTACH_MAX;
    const when = d.createdAt.toLocaleString('en-GB', { timeZone: 'Asia/Bangkok' });
    const row = (k: string, v: string) => `<tr><td style="padding:6px 14px 6px 0;color:#525252;font-size:12px;letter-spacing:.06em;text-transform:uppercase">${k}</td><td style="padding:6px 0"><b>${v}</b></td></tr>`;
    const html = layout('ORDER DROP', `<p style="margin:0 0 12px">มีใบสั่งซื้อใหม่จากสาขาแฟรนไชส์ / New franchise order received.</p>
      <table style="border-collapse:collapse">${row('Ref', escHtml(d.ref))}${row('Item', escHtml(item.label))}${row('Branch', `${escHtml(d.branchName)} (${escHtml(d.branchCode)})`)}${row('Issued by', escHtml(d.issuerName))}${row('Submitted', escHtml(when) + ' (BKK)')}${row('File', escHtml(d.fileName))}</table>
      ${big ? button(signedFileUrl(d.id), 'DOWNLOAD PDF') + '<p style="font-size:11px;color:#525252">ลิงก์ใช้ได้ 14 วัน / Link valid 14 days</p>' : '<p style="font-size:12px;color:#525252;margin-top:16px">ไฟล์ PDF แนบมากับอีเมลนี้ / PDF attached.</p>'}`);
    const r = await sendMail({
      to: route.to, cc: route.cc, subject: `[JIANCHA Order Drop] ${item.name} · ${d.branchName} · ${d.ref}`, html,
      attachments: big ? [] : [{ name: d.fileName, contentType: 'application/pdf', content: fs.readFileSync(dropFile(d.id)) }],
    });
    await prisma.drop.update({ where: { id }, data: { emailStatus: r.dryRun ? 'dry-run' : 'sent', emailTo: JSON.stringify(route.to), emailCc: JSON.stringify(route.cc), emailSentAt: new Date(), emailError: '' } });
  } catch (e) {
    console.error('[drop mail]', d.ref, e);
    await prisma.drop.update({ where: { id }, data: { emailStatus: 'failed', emailError: String((e as Error).message || e).slice(0, 400) } });
  }
}
