// Creates the system roles (only if missing — never overwrites edited permissions) and invites the first MAIN ADMIN.
//   ADMIN_EMAIL=chakrit.ji@jianchatea.com ADMIN_NAME="Chakrit" npm run seed:admin
// No password is ever set here: the admin receives an invite email (or, in dry-run, the link is printed once).
import { prisma } from '../src/lib/db';
import { SYSTEM_ROLES } from '../src/lib/perms';
import { sendInvite } from '../src/lib/admin';

export async function ensureRoles() {
  for (const r of SYSTEM_ROLES) {
    await prisma.role.upsert({ where: { key: r.key }, create: { key: r.key, name: r.name, perms: JSON.stringify(r.perms), isProtected: !!r.isProtected }, update: { isProtected: !!r.isProtected } });
  }
}

async function main() {
  await ensureRoles();
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (!email) { console.log('roles ensured. Set ADMIN_EMAIL (and ADMIN_NAME) to invite the first MAIN ADMIN.'); return; }
  const role = await prisma.role.findUniqueOrThrow({ where: { key: 'MAIN_ADMIN' } });
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing?.passwordHash && existing.status === 'active') { console.log(`${email} already has an active account — nothing to do.`); return; }
  const r = await sendInvite({ email, name: process.env.ADMIN_NAME || email.split('@')[0], roleId: role.id, actor: null });
  console.log(r.dryRun ? `MAIL DRY-RUN — open this invite link once (valid 7 days):\n${r.link}` : `Invite emailed to ${email}.`);
}

if (require.main === module) main().then(() => prisma.$disconnect()).catch(e => { console.error(e); process.exit(1); });
