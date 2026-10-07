// Microsoft Graph (client credentials, Mail.Send app permission) — same Entra app as Recipe-DB.
// Without GRAPH_CLIENT_SECRET (or MAIL_DRY_RUN=1) messages are written to DATA_DIR/outbox instead.
import fs from 'fs';
import path from 'path';
import { env } from './env';

export type Attachment = { name: string; contentType: string; content: Buffer };
export type Mail = { to: string[]; cc?: string[]; subject: string; html: string; attachments?: Attachment[] };

let tok: { value: string; exp: number } | null = null;
async function graphToken() {
  if (tok && tok.exp > Date.now() + 60_000) return tok.value;
  const g = env.graph;
  const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(g.tenant)}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: g.clientId, client_secret: g.secret, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
    signal: AbortSignal.timeout(20_000),
  });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !j.access_token) throw new Error(`Graph token ${res.status}: ${(j.error_description || '').slice(0, 200)}`);
  tok = { value: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return tok.value;
}

export async function sendMail(m: Mail): Promise<{ dryRun: boolean }> {
  const message = {
    subject: m.subject, body: { contentType: 'HTML', content: m.html },
    toRecipients: m.to.map(address => ({ emailAddress: { address } })),
    ccRecipients: (m.cc || []).map(address => ({ emailAddress: { address } })),
    attachments: (m.attachments || []).map(a => ({ '@odata.type': '#microsoft.graph.fileAttachment', name: a.name, contentType: a.contentType, contentBytes: a.content.toString('base64') })),
  };
  if (env.mailDryRun) {
    const dir = path.join(env.dataDir, 'outbox');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${Date.now()}-${Math.random().toString(36).slice(2, 7)}.json`),
      JSON.stringify({ from: env.mailSender, ...message, attachments: (m.attachments || []).map(a => ({ name: a.name, bytes: a.content.length })) }, null, 1));
    return { dryRun: true };
  }
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(env.mailSender)}/sendMail`, {
    method: 'POST', headers: { Authorization: `Bearer ${await graphToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, saveToSentItems: true }), signal: AbortSignal.timeout(60_000),
  });
  if (res.status !== 202) throw new Error(`Graph sendMail ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return { dryRun: false };
}

export const escHtml = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** JIANCHA-branded shell (black header, tan rule). */
export function layout(title: string, inner: string) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;color:#181818">
  <div style="background:#181818;color:#fff;padding:16px 20px;letter-spacing:.2em;font-weight:700">JIAN CHA <span style="color:#AD9C82;font-size:11px;letter-spacing:.25em;font-weight:400">· ${escHtml(title)}</span></div>
  <div style="border:1px solid #EBE9E6;border-top:3px solid #AD9C82;padding:18px 20px;font-size:14px;line-height:1.6">${inner}</div>
  <p style="font-size:11px;color:#525252;margin:10px 2px">อีเมลอัตโนมัติจากระบบ JC-ROUND — กรุณาอย่าตอบกลับ / Automated message, please do not reply.</p></div>`;
}
export const button = (href: string, label: string) =>
  `<p style="margin:18px 0"><a href="${escHtml(href)}" style="background:#181818;color:#fff;padding:11px 18px;text-decoration:none;font-size:13px;letter-spacing:.06em">${escHtml(label)}</a></p>
   <p style="font-size:11px;color:#525252;word-break:break-all">${escHtml(href)}</p>`;
