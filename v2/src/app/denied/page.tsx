import Link from 'next/link';
import { requirePage } from '@/lib/auth';
import { Shell } from '@/components/Shell';

export default async function Denied() {
  const u = await requirePage(undefined, '/denied');
  return <Shell user={u} active=""><div className="card"><div className="empty th">บัญชีของคุณยังไม่มีสิทธิ์เข้าหน้านี้ — ติดต่อผู้ดูแลระบบ · <Link href="/account">บัญชีของฉัน</Link></div></div></Shell>;
}
