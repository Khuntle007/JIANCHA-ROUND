import { prisma } from './db';
import { itemTypes } from './drop';
import { dropSettings } from './settings';
import { OTHER_KEY } from './drop-catalog';

export type MapRule = { branches: { code: string; name: string }[] | 'default'; supplier: string; to: string[]; cc: string[] };
export type MapGroup = {
  key: string; label: string; labelTh: string; blocked: boolean; subjectTag: string; cc: string[];
  sections: { codes: { code: string; name: string }[]; rules: MapRule[] }[]; fallbackTo: string[]; fallbackCc: string[];
};

/** "Ingredient → branch → email" explanation built from the live settings (same rules deliverDrop uses). */
export async function routingMap(): Promise<MapGroup[]> {
  const [items, settings, products, branches] = await Promise.all([
    itemTypes(), dropSettings(),
    prisma.product.findMany({ include: { suppliers: { include: { supplier: true } } }, orderBy: { code: 'asc' } }),
    prisma.branch.findMany({ select: { code: true, nameEn: true } }),
  ]);
  const bName = new Map(branches.map(b => [b.code, b.nameEn]));
  const J = (s: string) => { try { return JSON.parse(s) as string[]; } catch { return []; } };
  return items.map(it => {
    const codes = it.key === OTHER_KEY ? [] : it.codes;
    // codes with identical supplier set-ups are shown together
    const bySig = new Map<string, { codes: { code: string; name: string }[]; rules: MapRule[] }>();
    for (const code of codes) {
      const p = products.find(x => x.code === code);
      const links = (p?.suppliers || []).map(l => ({ supplier: l.supplier.name, to: J(l.supplier.to), cc: J(l.supplier.cc), branches: J(l.branches) }));
      const rules: MapRule[] = [
        ...links.filter(l => l.branches.length).map(l => ({ branches: l.branches.map(c => ({ code: c, name: bName.get(c) || '' })), supplier: l.supplier, to: l.to, cc: l.cc })),
        ...links.filter(l => !l.branches.length).map(l => ({ branches: 'default' as const, supplier: l.supplier, to: l.to, cc: l.cc })),
      ];
      const sig = JSON.stringify(rules);
      if (!bySig.has(sig)) bySig.set(sig, { codes: [], rules });
      bySig.get(sig)!.codes.push({ code, name: p?.name || '' });
    }
    return {
      key: it.key, label: it.label, labelTh: it.labelTh, blocked: it.blocked, subjectTag: it.subjectTag,
      cc: it.skipGlobalCc ? [] : settings.alwaysCc, sections: [...bySig.values()], fallbackTo: it.to, fallbackCc: it.cc,
    };
  });
}
