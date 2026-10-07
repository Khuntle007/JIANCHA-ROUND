import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { AuthCard } from '@/components/AuthCard';
import { LoginForm } from './LoginForm';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
  if (await getCurrentUser()) redirect(safeNext);
  return <AuthCard kicker="JC-ROUND" title="เข้าสู่ระบบ"><LoginForm next={safeNext} /></AuthCard>;
}
