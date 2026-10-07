'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, toast, Modal, useConfirm, copyText } from '@/components/client';
import { FEATURES, type Feature } from '@/lib/perms';
import { fmtDateTime } from '@/lib/dates';

type Role = { id: number; key: string; name: string; perms: string; isProtected: boolean };
type User = { id: string; email: string; name: string; roleId: number; status: string; permOverrides: string; emailVerifiedAt: string | null; lastLoginAt: string | null; lockedUntil: string | null };
type Invite = { id: string; email: string; name: string | null; roleId: number | null; expiresAt: string };
type Log = { id: number; actorName: string | null; action: string; target: string | null; meta: string | null; ip: string | null; createdAt: string };
const P = (s: string) => { try { return JSON.parse(s) as Partial<Record<Feature, boolean>>; } catch { return {}; } };

export function UsersAdmin({ me }: { me: { id: string; isMain: boolean } }) {
  const [tab, setTab] = useState<'users' | 'invites' | 'roles' | 'audit'>('users');
  const [d, setD] = useState<{ users: User[]; roles: Role[]; invites: Invite[] } | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [invite, setInvite] = useState(false), [editU, setEditU] = useState<User | null>(null), [devLink, setDevLink] = useState('');
  const { ask, node } = useConfirm();
  const load = useCallback(() => api<{ users: User[]; roles: Role[]; invites: Invite[] }>('/api/admin/users').then(setD).catch(e => toast(e.message)), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (tab === 'audit') api<{ logs: Log[] }>('/api/admin/audit').then(r => setLogs(r.logs)).catch(e => toast(e.message)); }, [tab]);
  if (!d) return <div className="card"><div className="empty th">กำลังโหลด…</div></div>;
  const roleOf = (id: number | null) => d.roles.find(r => r.id === id);
  const rolePerm = (r: Role | undefined, k: Feature) => !!r && (r.isProtected || !!P(r.perms)[k]);
  const assignable = d.roles.filter(r => me.isMain || r.key !== 'MAIN_ADMIN');
  const showDev = (j: { devLink?: string }) => { if (j.devLink) setDevLink(j.devLink); };

  return (
    <>
      <div className="pagehead"><div><div className="kicker">การจัดการสิทธิ์</div><h1 className="th">ผู้ใช้ &amp; สิทธิ์เข้าถึง</h1></div>
        <button className="btn gold" onClick={() => setInvite(true)}>+ เชิญผู้ใช้</button></div>
      {devLink && <div className="devlink th">โหมดทดสอบ (ยังไม่ได้ตั้งค่าอีเมล) — ลิงก์ที่จะถูกส่ง: <code>{devLink}</code> <button className="btn sm" onClick={() => copyText(devLink)}>คัดลอก</button></div>}
      <div className="tabs">
        {([['users', `ผู้ใช้ (${d.users.length})`], ['invites', `คำเชิญที่รอ (${d.invites.length})`], ['roles', 'บทบาท & สิทธิ์'], ['audit', 'บันทึกการใช้งาน']] as const).map(([k, l]) =>
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {tab === 'users' && <div className="card" style={{ padding: 0 }}><div className="tblwrap"><table>
        <thead><tr><th>ผู้ใช้</th><th>บทบาท</th><th>สถานะ</th><th className="hide-sm">เข้าใช้ล่าสุด</th><th /></tr></thead>
        <tbody>{d.users.map(u => { const r = roleOf(u.roleId); const ov = Object.keys(P(u.permOverrides)).length; return (
          <tr key={u.id} style={u.status === 'active' ? undefined : { opacity: .5 }}>
            <td><b className="th">{u.name}</b>{u.id === me.id && <span className="pill2" style={{ marginLeft: 6 }}>คุณ</span>}<div className="small muted">{u.email}</div></td>
            <td className="small">{r?.name}{ov ? <div className="muted">+ ปรับสิทธิ์เฉพาะ {ov} รายการ</div> : null}</td>
            <td>{u.status !== 'active' ? <span className="estat failed">ปิดใช้งาน</span> : u.lockedUntil && new Date(u.lockedUntil) > new Date() ? <span className="estat wait">ล็อกชั่วคราว</span> : <span className="estat sent">ใช้งาน</span>}</td>
            <td className="small hide-sm">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : '—'}</td>
            <td><div className="rowx">{(me.isMain || r?.key !== 'MAIN_ADMIN') && <>
              <button className="btn sm ghost" onClick={() => setEditU(u)}>แก้</button>
              <button className="btn sm ghost" onClick={() => ask(`ส่งลิงก์ตั้งรหัสผ่านใหม่ให้ ${u.email}? ผู้ใช้จะถูกออกจากระบบทุกเครื่อง`, async () => { try { const j = await api<{ devLink?: string }>(`/api/admin/users/${u.id}/reset`, { method: 'POST' }); showDev(j); toast('ส่งลิงก์รีเซ็ตแล้ว'); load(); } catch (e) { toast((e as Error).message); } })}>รีเซ็ตรหัส</button>
              {u.id !== me.id && <button className="btn sm ghost" onClick={() => ask(`ลบผู้ใช้ ${u.email}?`, async () => { try { await api(`/api/admin/users/${u.id}`, { method: 'DELETE' }); toast('ลบแล้ว'); load(); } catch (e) { toast((e as Error).message); } }, { danger: true, yes: 'ลบ' })}>ลบ</button>}
            </>}</div></td>
          </tr>); })}</tbody></table></div></div>}

      {tab === 'invites' && <div className="card" style={{ padding: 0 }}><div className="tblwrap"><table>
        <thead><tr><th>อีเมล</th><th>บทบาท</th><th>หมดอายุ</th><th /></tr></thead>
        <tbody>{d.invites.length ? d.invites.map(i => (
          <tr key={i.id}><td><b className="th">{i.name || '—'}</b><div className="small muted">{i.email}</div></td><td className="small">{roleOf(i.roleId)?.name}</td><td className="small">{fmtDateTime(i.expiresAt)}</td>
            <td><div className="rowx"><button className="btn sm ghost" onClick={async () => { try { showDev(await api<{ devLink?: string }>(`/api/admin/invites/${i.id}`, { method: 'POST' })); toast('ส่งคำเชิญใหม่แล้ว'); load(); } catch (e) { toast((e as Error).message); } }}>ส่งใหม่</button>
              <button className="btn sm ghost" onClick={() => ask(`ยกเลิกคำเชิญ ${i.email}?`, async () => { await api(`/api/admin/invites/${i.id}`, { method: 'DELETE' }); load(); })}>ยกเลิก</button></div></td></tr>
        )) : <tr><td colSpan={4}><div className="empty th">ไม่มีคำเชิญที่รออยู่</div></td></tr>}</tbody></table></div></div>}

      {tab === 'roles' && <RolesMatrix roles={d.roles} canEdit={me.isMain} reload={load} />}

      {tab === 'audit' && <div className="card" style={{ padding: 0 }}><div className="tblwrap"><table>
        <thead><tr><th>เวลา</th><th>ผู้ทำ</th><th>การกระทำ</th><th>เป้าหมาย</th><th className="hide-sm">IP</th></tr></thead>
        <tbody>{logs.map(l => <tr key={l.id}><td className="small" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(l.createdAt)}</td><td className="small th">{l.actorName || '—'}</td><td className="small"><code>{l.action}</code></td><td className="small th">{l.target}</td><td className="small hide-sm">{l.ip}</td></tr>)}</tbody></table></div></div>}

      {invite && <InviteModal roles={assignable} onClose={() => setInvite(false)} onDone={j => { setInvite(false); showDev(j); setTab('invites'); load(); }} />}
      {editU && <UserModal user={editU} roles={assignable} rolePerm={rolePerm} roleOf={roleOf} isSelf={editU.id === me.id} onClose={() => setEditU(null)} onSaved={() => { setEditU(null); load(); }} />}
      {node}
    </>
  );
}

function InviteModal({ roles, onClose, onDone }: { roles: Role[]; onClose: () => void; onDone: (j: { devLink?: string }) => void }) {
  const [email, setEmail] = useState(''), [name, setName] = useState(''), [roleId, setRoleId] = useState(roles.find(r => r.key === 'OPERATION')?.id || roles[0]?.id), [err, setErr] = useState('');
  return (
    <Modal title="เชิญผู้ใช้ใหม่" onClose={onClose} width={480}>
      <p className="small th muted" style={{ marginTop: 0 }}>ระบบจะส่งอีเมลจาก Noreply@jianchatea.com พร้อมลิงก์ให้ตั้งรหัสผ่านเอง (ใช้ได้ 7 วัน) — ผู้ดูแลไม่เห็นรหัสผ่าน</p>
      <div className="field"><label>อีเมล</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
      <div className="field"><label>ชื่อ</label><input value={name} onChange={e => setName(e.target.value)} /></div>
      <div className="field"><label>บทบาท</label><select value={roleId} onChange={e => setRoleId(+e.target.value)}>{roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
      <div className="err">{err}</div>
      <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn ghost" onClick={onClose}>ยกเลิก</button>
        <button className="btn gold" onClick={async () => { setErr(''); try { onDone(await api('/api/admin/invites', { body: { email, name, roleId } })); toast('ส่งคำเชิญแล้ว'); } catch (e) { setErr((e as Error).message); } }}>ส่งคำเชิญ</button></div>
    </Modal>
  );
}

function UserModal({ user, roles, rolePerm, roleOf, isSelf, onClose, onSaved }: { user: User; roles: Role[]; rolePerm: (r: Role | undefined, k: Feature) => boolean; roleOf: (id: number) => Role | undefined; isSelf: boolean; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(user.name), [roleId, setRoleId] = useState(user.roleId), [active, setActive] = useState(user.status === 'active');
  const [ov, setOv] = useState<Partial<Record<Feature, boolean>>>(P(user.permOverrides));
  const role = roleOf(roleId);
  return (
    <Modal title={`แก้ไขผู้ใช้ · ${user.email}`} onClose={onClose} width={620}>
      <div className="grid2">
        <div className="field"><label>ชื่อ</label><input value={name} onChange={e => setName(e.target.value)} /></div>
        <div className="field"><label>บทบาท</label><select value={roleId} onChange={e => setRoleId(+e.target.value)}>{roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
      </div>
      {!isSelf && <div className="field"><label style={{ display: 'flex', gap: '.5rem', alignItems: 'center', textTransform: 'none', letterSpacing: 0 }}><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> เปิดใช้งานบัญชี (ปิด = ออกจากระบบทันทีทุกเครื่อง)</label></div>}
      <div className="field"><label>สิทธิ์ — ค่าตามบทบาท / ปรับเฉพาะคนนี้</label>
        {role?.isProtected ? <div className="small th muted">MAIN ADMIN มีสิทธิ์ครบทุกฟังก์ชันเสมอ</div> :
        <div className="tblwrap"><table className="permtbl"><tbody>{FEATURES.map(f => {
          const base = rolePerm(role, f.key), cur = ov[f.key] ?? base;
          return <tr key={f.key}><td style={{ textAlign: 'left' }} className="th small">{f.label}</td>
            <td><select className="slotsel" value={ov[f.key] === undefined ? 'role' : ov[f.key] ? 'on' : 'off'} onChange={e => { const v = e.target.value; setOv(o => { const n = { ...o }; if (v === 'role') delete n[f.key]; else n[f.key] = v === 'on'; return n; }); }}>
              <option value="role">ตามบทบาท ({base ? 'ได้' : 'ไม่ได้'})</option><option value="on">ให้สิทธิ์</option><option value="off">ไม่ให้สิทธิ์</option></select></td>
            <td>{cur ? '✓' : '—'}</td></tr>; })}</tbody></table></div>}
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn ghost" onClick={onClose}>ยกเลิก</button>
        <button className="btn gold" onClick={async () => { try { await api(`/api/admin/users/${user.id}`, { method: 'PATCH', body: { name, roleId, ...(isSelf ? {} : { status: active ? 'active' : 'disabled' }), permOverrides: ov } }); toast('บันทึกแล้ว'); onSaved(); } catch (e) { toast((e as Error).message); } }}>บันทึก</button></div>
    </Modal>
  );
}

function RolesMatrix({ roles, canEdit, reload }: { roles: Role[]; canEdit: boolean; reload: () => void }) {
  const [newName, setNewName] = useState('');
  return (
    <>
      <div className="card" style={{ padding: 0 }}><div className="tblwrap"><table className="permtbl">
        <thead><tr><th style={{ textAlign: 'left' }}>ฟังก์ชัน</th>{roles.map(r => <th key={r.id}>{r.name}</th>)}</tr></thead>
        <tbody>{FEATURES.map(f => <tr key={f.key}><td style={{ textAlign: 'left' }} className="th small">{f.label}</td>
          {roles.map(r => { const on = r.isProtected || !!P(r.perms)[f.key]; return <td key={r.id}>
            <input type="checkbox" className="permcell" checked={on} disabled={!canEdit || r.isProtected} aria-label={`${r.name} ${f.label}`}
              onChange={async e => { try { await api(`/api/admin/roles/${r.id}`, { method: 'PATCH', body: { perms: { ...P(r.perms), [f.key]: e.target.checked } } }); reload(); } catch (x) { toast((x as Error).message); } }} /></td>; })}
        </tr>)}</tbody></table></div></div>
      <div className="small muted th" style={{ marginTop: '.6rem' }}>{canEdit ? 'ติ๊กเพื่อแก้สิทธิ์ของบทบาท (มีผลทันทีกับทุกคนในบทบาท) · MAIN ADMIN มีสิทธิ์ครบเสมอ' : '🔒 อ่านอย่างเดียว — เฉพาะ MAIN ADMIN แก้บทบาทได้'}</div>
      {canEdit && <div className="row" style={{ marginTop: '.8rem' }}>
        <input placeholder="ชื่อบทบาทใหม่" value={newName} onChange={e => setNewName(e.target.value)} />
        <button className="btn sm" onClick={async () => { try { await api('/api/admin/roles', { body: { name: newName } }); setNewName(''); reload(); } catch (e) { toast((e as Error).message); } }}>+ สร้างบทบาท</button>
        {roles.filter(r => r.key.startsWith('custom-')).map(r => <button key={r.id} className="btn sm ghost" onClick={async () => { try { await api(`/api/admin/roles/${r.id}`, { method: 'DELETE' }); reload(); } catch (e) { toast((e as Error).message); } }}>ลบ {r.name}</button>)}
      </div>}
    </>
  );
}
