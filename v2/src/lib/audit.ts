import { prisma } from './db';
import { clientIp } from './http';

export async function audit(action: string, opts: { actor?: { id: string; name: string } | null; target?: string; meta?: unknown } = {}) {
  await prisma.auditLog.create({
    data: { action, actorId: opts.actor?.id, actorName: opts.actor?.name, target: opts.target, meta: opts.meta === undefined ? null : JSON.stringify(opts.meta).slice(0, 4000), ip: await clientIp().catch(() => null) },
  }).catch(e => console.error('[audit]', e));
}
