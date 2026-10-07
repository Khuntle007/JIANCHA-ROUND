'use client';
import { toast } from './client';

/** POST JSON, receive a file, save it with the server-provided name. */
export async function downloadPost(url: string, payload: unknown, fallbackName: string) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), credentials: 'same-origin' });
  if (!r.ok) { const j = await r.json().catch(() => ({})); toast((j as { error?: string }).error || 'ดาวน์โหลดไม่สำเร็จ'); return; }
  const name = /filename="([^"]+)"/.exec(r.headers.get('content-disposition') || '')?.[1] || fallbackName;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(await r.blob()); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
