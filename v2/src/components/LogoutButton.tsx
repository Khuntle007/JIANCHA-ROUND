'use client';
import { api } from './client';

export function LogoutButton() {
  return <button className="btn sm ghost" id="logoutBtn" onClick={async () => { await api('/api/auth/logout', { method: 'POST' }).catch(() => {}); location.href = '/login'; }}>ออกจากระบบ</button>;
}
