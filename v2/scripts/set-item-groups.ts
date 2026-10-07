// Apply the 5 Order Drop ingredient groups to the database (idempotent).
//   npx tsx scripts/set-item-groups.ts
import { prisma } from '../src/lib/db';
import { applyItemGroups } from '../src/lib/item-groups';

applyItemGroups().then(l => { l.forEach(x => console.log(x)); return prisma.$disconnect(); }).catch(e => { console.error(e); process.exit(1); });
