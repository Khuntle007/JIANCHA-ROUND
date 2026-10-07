import { requirePage } from '@/lib/auth';
import { Shell } from '@/components/Shell';
import { FEATURES } from '@/lib/perms';
import { ChangePassword } from './ChangePassword';

export default async function Account() {
  const u = await requirePage(undefined, '/account');
  return (
    <Shell user={u} active="">
      <div className="pagehead"><div><div className="kicker">บัญชีของฉัน</div><h1 className="th">{u.name}</h1><div className="muted small">{u.email} · {u.role.name}</div></div></div>
      <div className="grid2" style={{ gap: '1rem', alignItems: 'start' }}>
        <div className="card"><div className="kicker" style={{ marginBottom: '.6rem' }}>เปลี่ยนรหัสผ่าน</div><ChangePassword /></div>
        <div className="card"><div className="kicker" style={{ marginBottom: '.6rem' }}>สิทธิ์ของคุณ</div>
          {FEATURES.map(f => <div key={f.key} className="small th">{u.perms[f.key] ? '✓' : '—'} {f.label}</div>)}</div>
      </div>
    </Shell>
  );
}
