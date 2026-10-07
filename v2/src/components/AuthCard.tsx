import { Emblem } from './Emblem';

export function AuthCard({ kicker, title, children }: { kicker: string; title: string; children: React.ReactNode }) {
  return (
    <div className="loginwrap">
      <div className="loginbox authform" style={{ maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
          <Emblem size={46} />
          <div className="kicker" style={{ marginTop: '.4rem' }}>{kicker}</div>
          <h2 className="th" style={{ fontSize: '1.1rem', margin: '.3rem 0 0' }}>{title}</h2>
        </div>
        {children}
      </div>
    </div>
  );
}
