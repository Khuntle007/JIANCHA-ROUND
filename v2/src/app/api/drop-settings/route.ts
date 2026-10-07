import { route, body, json, ApiError, str } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { emailOk } from '@/lib/drop-catalog';
import { saveDropSettings } from '@/lib/settings';
import { audit } from '@/lib/audit';

export const PUT = route(async (req: Request) => {
  const me = await requireUser('orderDrop');
  const b = await body<{ scmEmails?: string[]; reminderHours?: number }>(req);
  const scmEmails = (b.scmEmails || []).map(e => str(e, 120)).filter(Boolean);
  const bad = scmEmails.find(e => !emailOk(e));
  if (bad) throw new ApiError(400, 'อีเมลไม่ถูกต้อง: ' + bad);
  const reminderHours = Math.max(0, Math.min(720, Math.round(Number(b.reminderHours) || 0)));
  await saveDropSettings({ scmEmails, reminderHours });
  await audit('dropsettings.updated', { actor: me, meta: { scmEmails, reminderHours } });
  return json({ ok: true, scmEmails, reminderHours });
});
