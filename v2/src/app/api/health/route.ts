import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { json } from '@/lib/http';

export async function GET() {
  await prisma.$queryRaw`SELECT 1`;
  return json({ ok: true, mailDryRun: env.mailDryRun });
}
