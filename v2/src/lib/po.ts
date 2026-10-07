// PURCHASE ORDER extraction — ported 1:1 from the live drop-service (poppler `pdftotext -layout`).
// The regexes depend on pdftotext's column spacing, so keep using the CLI rather than a JS PDF lib.
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { env } from './env';

export type PoLine = { no: number; name: string; qty: number; unit: string; vat: string; price: number; total: number };
export type PoData = {
  number: string; buyer: string; issuedDate: string; dueDate: string; creditTerms: string; contact: string; tel: string; issuedBy: string; remarks: string;
  lines: PoLine[]; total: number | null; vatRate: string; vat: number | null; grand: number | null; partial?: boolean;
};

export class PoError extends Error { constructor(public code: 'NOTOOL' | 'BADPDF', msg: string) { super(msg); } }

export function pdfText(buf: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(env.dataDir, { recursive: true });
    const tmp = path.join(env.dataDir, 'tmp-' + crypto.randomBytes(8).toString('hex') + '.pdf');
    fs.writeFileSync(tmp, buf, { mode: 0o600 });
    execFile('pdftotext', ['-layout', '-enc', 'UTF-8', tmp, '-'], { timeout: 20_000, maxBuffer: 8 * 1024 * 1024 }, (err, out) => {
      fs.unlink(tmp, () => {});
      if (err) return reject((err as NodeJS.ErrnoException).code === 'ENOENT' ? new PoError('NOTOOL', 'pdftotext not installed') : new PoError('BADPDF', 'cannot read PDF'));
      resolve(String(out));
    });
  });
}

const num = (v: string) => parseFloat(String(v).replace(/,/g, ''));

export function parsePo(text: string): PoData {
  const lines = text.split(/\r?\n/);
  const grab = (re: RegExp) => { const m = text.match(re); return m ? m[1].trim() : ''; };
  const bi = lines.findIndex(l => /BUYER\s*\/\s*SHIP TO/i.test(l));
  const bl = bi >= 0 ? lines.slice(bi + 1).find(x => x.trim()) : undefined;
  const po: PoData = {
    number: (text.match(/\bPO\d{6,}\b/) || [])[0] || '',
    buyer: bl ? bl.trim().split(/\s{3,}/)[0] : '',
    issuedDate: grab(/Issued date\s*:\s*(\S+)/i), dueDate: grab(/Due date\s*:\s*(\S+)/i), creditTerms: grab(/Credit terms\s*:\s*(\S+)/i),
    contact: grab(/Contact\s*:\s*(.+?)(?:\s{3,}|$)/im), tel: grab(/Tel\s*:\s*(.+?)(?:\s{3,}|$)/im), issuedBy: grab(/Issued by\s*:\s*(.+?)\s*$/im),
    remarks: '', lines: [], total: null, vatRate: '', vat: null, grand: null,
  };
  const rowRe = /^\s*(\d{1,3})\s+(\d{4,}\s*-\s*.+?)\s{2,}([\d,]+(?:\.\d+)?)\s+(\S+)\s+([YN])\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)\s*$/;
  for (const l of lines) {
    const m = l.match(rowRe);
    if (m) po.lines.push({ no: +m[1], name: m[2].replace(/\s+/g, ' ').trim(), qty: num(m[3]), unit: m[4], vat: m[5], price: num(m[6]), total: num(m[7]) });
  }
  const t = text.match(/(?<!Grand )\bTotal\s+([\d,]+\.\d+)\s*$/m), v = text.match(/VAT\s*\((\d+(?:\.\d+)?)%\)\s+([\d,]+\.\d+)/i), g = text.match(/Grand Total\s+([\d,]+\.\d+)/i);
  po.total = t ? num(t[1]) : null; po.vatRate = v ? v[1] : ''; po.vat = v ? num(v[2]) : null; po.grand = g ? num(g[1]) : null;
  const ri = lines.findIndex(l => /Remarks\s*:/i.test(l));
  if (ri >= 0) {
    const end = lines.findIndex((l, i) => i > ri && /Authorized by|_{6,}/.test(l));
    po.remarks = lines.slice(ri, end > ri ? end : ri + 6).map((l, i) => (i === 0 ? l.replace(/^.*?Remarks\s*:/i, '') : l).slice(0, 60).trim()).filter(Boolean).join(' ').replace(/^-$/, '');
  }
  return po;
}

/** "030013 - Creamcheese (1 Kg)" → "030013" */
export const codeOf = (name: string) => { const m = String(name || '').match(/^\s*(\d{4,})\s*-\s*/); return m ? m[1] : ''; };
export const stripCode = (name: string) => name.replace(/^\s*\d+\s*-\s*/, '').trim();
