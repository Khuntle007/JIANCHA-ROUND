'use client';
import { useEffect, useRef, useState } from 'react';

/** Searchable multi-select dropdown (checkbox list). Empty selection = all. */
export function MultiSelect({ label, options, value, onChange }: { label: string; options: { value: string; label: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false), [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const f = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f); }, []);
  const shown = options.filter(o => !q || o.label.toLowerCase().includes(q.toLowerCase()));
  const txt = !value.length ? 'ทั้งหมด' : value.length === 1 ? options.find(o => o.value === value[0])?.label || value[0] : `เลือก ${value.length} รายการ`;
  return (
    <div className="field" ref={ref} style={{ position: 'relative', margin: 0, minWidth: 170 }}>
      <label>{label}</label>
      <button type="button" className="slotsel" style={{ textAlign: 'left', width: '100%', padding: '.5em .7em' }} onClick={() => setOpen(!open)} aria-expanded={open}>{txt} ▾</button>
      {open && <div className="card" style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, width: 280, padding: '.5rem', boxShadow: '0 6px 20px rgba(0,0,0,.12)' }}>
        <input placeholder="ค้นหา…" value={q} onChange={e => setQ(e.target.value)} style={{ width: '100%', marginBottom: '.4rem' }} autoFocus />
        <div className="row" style={{ marginBottom: '.3rem' }}><button type="button" className="btn sm ghost" onClick={() => onChange([])}>ล้าง</button></div>
        <div className="scopebox" style={{ maxHeight: 220 }}>{shown.map(o => (
          <label key={o.value}><input type="checkbox" checked={value.includes(o.value)} onChange={e => onChange(e.target.checked ? [...value, o.value] : value.filter(v => v !== o.value))} /> {o.label}</label>
        ))}{!shown.length && <div className="small muted">ไม่พบ</div>}</div>
      </div>}
    </div>
  );
}
