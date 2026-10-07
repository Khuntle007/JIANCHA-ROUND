import type { MapGroup } from '@/lib/routing-map';

/** Read-only "ingredient → branch → email" overview (server-rendered from live settings). */
export function RoutingMap({ groups }: { groups: MapGroup[] }) {
  const mails = (a: string[]) => (a.length ? a.join(', ') : '—');
  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div className="kicker">ผังการส่งต่ออีเมล</div>
      <h2 className="th" style={{ fontSize: '1rem', margin: '.3rem 0 .4rem' }}>สินค้า → สาขา → อีเมลที่ได้รับ</h2>
      <p className="small muted th" style={{ margin: '0 0 .9rem' }}>
        ลำดับการตัดสิน: ① ประเภท “บันทึกอย่างเดียว” → ไม่ส่งต่อ · ② รหัสสินค้าที่ผูก supplier → <b>supplier เฉพาะสาขา</b> ก่อน ถ้าไม่มีใช้ <b>ค่าเริ่มต้น</b> · ③ รหัสที่ยังไม่ผูก → ผู้รับตามประเภทในตารางด้านล่าง · ④ ไม่ตรงประเภทใด → Other
        · สาขาดูจาก<b>ลิงก์แฟรนไชส์</b>ที่ใช้ส่ง (เช่น ลิงก์ JF023 = Central Pattaya)
      </p>
      <div className="routemap">
        {groups.map(g => (
          <div key={g.key} className="rm-group">
            <div className="rm-head">
              <b>{g.label}</b> <span className="muted small th">{g.labelTh}</span>
              {g.subjectTag && <span className="tag fc" style={{ marginLeft: 6 }}>Subject [{g.subjectTag}]</span>}
            </div>
            {g.blocked ? (
              <div className="rm-rule rm-blocked th small">ไม่ส่งต่อ — บันทึกไว้เท่านั้น · แฟรนไชส์จะเห็นข้อความ “ติดต่อ Area Manager”</div>
            ) : (
              <>
                {g.sections.map((s, i) => (
                  <div key={i} className="rm-section">
                    <div className="small muted">รหัส {s.codes.map(c => c.code + (c.name ? ` ${c.name}` : '')).join(' · ')}</div>
                    {s.rules.length ? s.rules.map((r, j) => (
                      <div key={j} className="rm-rule small th">
                        <span className="rm-branch">{r.branches === 'default' ? (s.rules.length > 1 ? 'สาขาอื่นทั้งหมด (ค่าเริ่มต้น)' : 'ทุกสาขา') : r.branches.map(b => `${b.code} ${b.name}`).join(', ')}</span>
                        <span className="rm-arrow">→</span>
                        <span><b>{r.supplier}</b><br /><span className="muted">{mails(r.to)}{r.cc.length ? ` · CC ${r.cc.join(', ')}` : ''}</span></span>
                      </div>
                    )) : (
                      <div className="rm-rule small th"><span className="rm-branch">ทุกสาขา</span><span className="rm-arrow">→</span><span><b>ผู้รับตามประเภท</b> (ยังไม่ผูก supplier)<br /><span className="muted">{mails(g.fallbackTo)}</span></span></div>
                    )}
                  </div>
                ))}
                {!g.sections.length && (
                  <div className="rm-rule small th"><span className="rm-branch">ทุกสาขา</span><span className="rm-arrow">→</span>
                    <span>{g.fallbackTo.length ? <><b>ผู้รับตามประเภท</b><br /><span className="muted">{mails(g.fallbackTo)}</span></> : <span className="muted">ไม่ส่งต่อ (บันทึกไว้) — ยังไม่ได้ตั้งผู้รับ</span>}</span></div>
                )}
                {(g.sections.length > 0 || g.fallbackTo.length > 0) && <div className="small muted th" style={{ marginTop: '.3rem' }}>CC: {g.cc.length ? g.cc.join(', ') : 'ไม่มี CC กลาง'}{g.fallbackCc.length ? ` + ${g.fallbackCc.join(', ')}` : ''}</div>}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
