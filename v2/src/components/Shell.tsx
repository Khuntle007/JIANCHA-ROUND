import Link from 'next/link';
import type { CurrentUser } from '@/lib/auth';
import { BrandBar } from './Emblem';
import { LogoutButton } from './LogoutButton';

const NAV: { href: string; label: string; perm: keyof CurrentUser['perms'] }[] = [
  { href: '/calendar', label: 'ปฏิทิน', perm: 'calendar' },
  { href: '/branches', label: 'สาขา', perm: 'branches' },
  { href: '/drops', label: 'Order Drop', perm: 'orderDrop' },
  { href: '/admin/users', label: 'ผู้ใช้ & สิทธิ์', perm: 'manageUsers' },
];

export function Shell({ user, active, children }: { user: CurrentUser; active: string; children: React.ReactNode }) {
  return (
    <>
      <div className="topbar">
        <Link href="/" className="brand" aria-label="JIAN CHA Rounds System — หน้าแรก"><BrandBar sub="Rounds System" /></Link>
        <nav className="nav">
          {NAV.filter(n => user.perms[n.perm]).map(n => <Link key={n.href} href={n.href} className={active === n.href ? 'active' : ''}>{n.label}</Link>)}
        </nav>
        <div className="spacer" />
        <div className="who">
          <Link href="/account" style={{ textDecoration: 'none' }}><span>{user.name} · <b>{user.role.name}</b></span></Link>
          <LogoutButton />
        </div>
      </div>
      <div className="wrap">
        <main id="main">{children}</main>
        <div className="foot">JIAN CHA · Rounds System</div>
      </div>
    </>
  );
}
