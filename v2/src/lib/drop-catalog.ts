// One dropdown entry per supplier company. Supplier + codes are internal only (never sent to the portal).
export type CatalogItem = {
  key: string; name: string; label: string;
  supplier: { code: string; name: string };
  ingredients: { code: string; name: string }[];
};

const RAW: Omit<CatalogItem, 'label'>[] = [
  { key: 'sp004', name: 'Yogurt', supplier: { code: 'SP004', name: 'บริษัท ดัชมิลล์ จำกัด' }, ingredients: [{ code: '030019', name: 'Yogurt (2 Kg)' }] },
  { key: 'sp036', name: 'Creamcheese / Whipping cream', supplier: { code: 'SP036', name: 'บริษัท โกลเบิล พรีเมี่ยม ไวน์ จำกัด' },
    ingredients: [{ code: '030013', name: 'Creamcheese (1 Kg)' }, { code: '030014', name: 'Whipping cream (1 Ltr.)' }] },
  { key: 'sp162', name: 'Fresh milk', supplier: { code: 'SP162', name: 'บริษัท มาลี เอ็นเตอร์ไพรส์ จำกัด' }, ingredients: [{ code: '030024', name: 'Fresh milk (2 Ltr.)' }] },
  { key: 'sp011', name: 'Ice hot creamer', supplier: { code: 'SP011', name: 'บริษัท ริช โปรดักส์ แมนูแฟคเจอริ่ง (ประเทศไทย) จำกัด' }, ingredients: [{ code: '030012', name: 'Ice hot creamer (1 Ltr.)' }] },
  { key: 'sp163', name: 'Fruits', supplier: { code: 'SP163', name: 'บริษัท ทรีดี ฟู้ด แอนด์ ดริงค์ จำกัด' },
    ingredients: [
      { code: '010001', name: 'Lemon' }, { code: '010006', name: 'Mango' }, { code: '010010', name: 'Navel Orange' },
      { code: '010011', name: 'Pineapple' }, { code: '010012', name: 'Red Seedless Grapes' }, { code: '010016', name: 'Taro' },
      { code: '010039', name: 'Pomegranate' }, { code: '010044', name: 'Pink Guava' }, { code: '010045', name: 'Green Mango' },
      { code: '010003', name: 'Fuji Apple' }, { code: '010002', name: 'Watermelon' },
    ] },
];
export const CATALOG: CatalogItem[] = RAW.map(c => ({ ...c, label: c.ingredients.map(i => i.name).join(' / ') }));
export const catalogItem = (key: string) => CATALOG.find(c => c.key === key);

/** Mock-up recipients until the real supplier emails are set in the admin page. */
export const DEFAULT_TO: Record<string, string[]> = {
  sp004: ['Malichat.no@jianchatea.com', 'it.manager@jianchatea.com'],
  sp036: ['Malichat.no@jianchatea.com', 'Chakrit.ji@jianchatea.com'],
  sp162: ['Chakrit.ji@jianchatea.com'],
  sp011: ['Chakrit.ji@jianchatea.com'],
  sp163: ['Chakrit.ji@jianchatea.com'],
};
export const LEGACY_ITEM: Record<string, string> = { fresh_milk: 'sp162', yogurt: 'sp004', cream_cheese: 'sp036', whipping_cream: 'sp036' };
export const emailOk = (e: string) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(e);
