import { ApiError, str } from './http';
import { FRESH_TYPES, WAREHOUSES, ORDER_STATUSES, DOC_TYPES, cleanSlots } from './domain';
import { isISODate } from './dates';

export function branchFields(b: Record<string, unknown>) {
  const out: Record<string, string> = {};
  for (const k of ['nameEn', 'nameTh', 'address', 'phone', 'am', 'company', 'mallCondition', 'mapUrl'] as const)
    if (b[k] !== undefined) out[k] = str(b[k], k === 'address' ? 400 : 200);
  if (b.type !== undefined) { const t = str(b.type, 4); if (!['', 'MT', 'FC'].includes(t)) throw new ApiError(400, 'ประเภทสาขาไม่ถูกต้อง'); out.type = t; }
  if (b.openDate !== undefined) { const d = str(b.openDate, 10); if (d && !isISODate(d)) throw new ApiError(400, 'วันเปิดไม่ถูกต้อง'); out.openDate = d; }
  if (out.mapUrl && !/^https?:\/\//i.test(out.mapUrl)) throw new ApiError(400, 'ลิงก์แผนที่ต้องขึ้นต้นด้วย http(s)://');
  return out;
}

export function roundFields(r: Record<string, unknown>) {
  const category = str(r.category, 10);
  if (!['dry', 'fresh'].includes(category)) throw new ApiError(400, 'category ไม่ถูกต้อง');
  const warehouse = category === 'dry' ? str(r.warehouse, 10) : '';
  const freshType = category === 'fresh' ? str(r.freshType, 40) : '';
  if (category === 'dry' && warehouse && !(WAREHOUSES as readonly string[]).includes(warehouse)) throw new ApiError(400, 'คลังไม่ถูกต้อง');
  if (category === 'fresh' && !(FRESH_TYPES as readonly string[]).includes(freshType)) throw new ApiError(400, 'ชนิดของสดไม่ถูกต้อง: ' + freshType);
  const product = str(r.product, 120);
  if (!product) throw new ApiError(400, 'กรอกชื่อสินค้า');
  return { category, warehouse, freshType, product, slots: JSON.stringify(cleanSlots(r.slots)) };
}

export function orderFields(o: Record<string, unknown>, partial = false) {
  const out: Record<string, string> = {};
  const set = (k: string, v: string) => { out[k] = v; };
  if (!partial || o.orderDate !== undefined) { const d = str(o.orderDate, 10); if (!isISODate(d)) throw new ApiError(400, 'วันที่สั่งไม่ถูกต้อง'); set('orderDate', d); }
  if (o.deliveryDate !== undefined) { const d = str(o.deliveryDate, 10); if (d && !isISODate(d)) throw new ApiError(400, 'วันส่งไม่ถูกต้อง'); set('deliveryDate', d); }
  if (!partial || o.docType !== undefined) { const t = str(o.docType, 4); if (!(DOC_TYPES as readonly string[]).includes(t)) throw new ApiError(400, 'ประเภทเอกสารไม่ถูกต้อง'); set('docType', t); }
  if (!partial || o.category !== undefined) { const c = str(o.category, 10); if (!['dry', 'fresh'].includes(c)) throw new ApiError(400, 'category ไม่ถูกต้อง'); set('category', c); }
  if (o.status !== undefined) { const s = str(o.status, 10); if (!(ORDER_STATUSES as readonly string[]).includes(s)) throw new ApiError(400, 'สถานะไม่ถูกต้อง'); set('status', s); }
  for (const k of ['docNo', 'warehouse', 'freshType', 'product', 'note'] as const) if (o[k] !== undefined) set(k, str(o[k], k === 'note' ? 500 : 120));
  if (out.category === 'dry') out.freshType = '';
  if (out.category === 'fresh') out.warehouse = '';
  if (out.status === 'complete') out.note = '';
  return out;
}
