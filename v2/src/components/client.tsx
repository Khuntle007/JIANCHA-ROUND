'use client';
import { useEffect, useRef, useState } from 'react';
import { dmyToISO, isoToDMY } from '@/lib/dates';

export class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }

/** JSON fetch to our own API; throws HttpError with the server's Thai message. */
export async function api<T = Record<string, unknown>>(url: string, init?: { method?: string; body?: unknown; raw?: BodyInit; headers?: Record<string, string> }): Promise<T> {
  const r = await fetch(url, {
    method: init?.method || (init?.body !== undefined || init?.raw ? 'POST' : 'GET'),
    headers: init?.raw ? init.headers : { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    body: init?.raw ?? (init?.body !== undefined ? JSON.stringify(init.body) : undefined),
    credentials: 'same-origin',
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && !url.startsWith('/api/auth') && !url.startsWith('/api/public')) { location.href = '/login?next=' + encodeURIComponent(location.pathname); }
  if (!r.ok) throw new HttpError(r.status, (j as { error?: string }).error || 'HTTP ' + r.status);
  return j as T;
}

export function toast(msg: string) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout((t as unknown as { _t?: number })._t);
  (t as unknown as { _t?: number })._t = window.setTimeout(() => t.classList.remove('show'), 2400);
}

export function Modal({ title, onClose, children, width = 560 }: { title: string; onClose: () => void; children: React.ReactNode; width?: number }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: width }} role="dialog" aria-modal="true" aria-label={title}>
        <button className="x" onClick={onClose} aria-label="ปิด">×</button>
        <h2>{title}</h2><div style={{ height: '.6rem' }} />
        {children}
      </div>
    </div>
  );
}

export function useConfirm() {
  const [c, setC] = useState<null | { msg: string; yes: string; danger?: boolean; run: () => void }>(null);
  const ask = (msg: string, run: () => void, opt: { yes?: string; danger?: boolean } = {}) => setC({ msg, run, yes: opt.yes || 'ยืนยัน', danger: opt.danger });
  const node = c && (
    <Modal title="ยืนยัน" onClose={() => setC(null)} width={420}>
      <p className="th" style={{ margin: '0 0 1.1rem' }}>{c.msg}</p>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn ghost" onClick={() => setC(null)}>ยกเลิก</button>
        <button className={'btn ' + (c.danger ? 'danger' : 'gold')} onClick={() => { const r = c.run; setC(null); r(); }}>{c.yes}</button>
      </div>
    </Modal>
  );
  return { ask, node };
}

/** dd/mm/yyyy text field storing ISO (same UX as v1). */
export function DateField({ value, onChange, disabled, placeholder = 'วว/ดด/ปปปป' }: { value: string; onChange: (iso: string) => void; disabled?: boolean; placeholder?: string }) {
  const [txt, setTxt] = useState(isoToDMY(value));
  const last = useRef(value);
  useEffect(() => { if (value !== last.current) { last.current = value; setTxt(isoToDMY(value)); } }, [value]);
  return (
    <input type="text" inputMode="numeric" className="dmy" maxLength={10} placeholder={placeholder} disabled={disabled} value={txt}
      onChange={e => {
        const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 8);
        const o = v.length >= 5 ? `${v.slice(0, 2)}/${v.slice(2, 4)}/${v.slice(4)}` : v.length >= 3 ? `${v.slice(0, 2)}/${v.slice(2)}` : v;
        setTxt(o);
      }}
      onBlur={() => { const iso = txt ? dmyToISO(txt) : ''; if (txt && !iso) { toast('รูปแบบวันที่ไม่ถูกต้อง'); return; } if (iso !== last.current) { last.current = iso; onChange(iso); } }} />
  );
}

export function copyText(t: string) {
  (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('คัดลอกแล้ว')).catch(() => window.prompt('คัดลอก:', t));
}
