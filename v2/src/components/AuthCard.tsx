import { BrandStack } from './Emblem';

export function AuthCard({ kicker, title, children }: { kicker: string; title: string; children: React.ReactNode }) {
  return (
    <div className="loginwrap">
      <BrandStack />
      <div className="loginbox authform">
        <div style={{ marginBottom: '1.2rem' }}>
          <div className="kicker">{kicker}</div>
          <h2 className="th" style={{ fontSize: '1.05rem', margin: '.35rem 0 0' }}>{title}</h2>
        </div>
        {children}
      </div>
      <div className="tagline">Rounds System · Every order tells a story</div>
    </div>
  );
}
