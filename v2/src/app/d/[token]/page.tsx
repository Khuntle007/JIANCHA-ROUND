import { Portal } from './Portal';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'JIANCHA · Order Drop' };

export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  return <Portal token={(await params).token} />;
}
