import { ApiError, str } from './http';
import { emailOk, normName } from './drop-catalog';

export function checkSupplier(b: Record<string, unknown>) {
  const name = str(b.name, 80);
  const list = (a: unknown) => (Array.isArray(a) ? a : []).map(e => str(e, 120)).filter(Boolean);
  const to = list(b.to), cc = list(b.cc);
  if (!name) throw new ApiError(400, 'ใส่ชื่อ supplier');
  if (!to.length) throw new ApiError(400, name + ': ต้องมีอีเมลอย่างน้อย 1');
  const bad = [...to, ...cc].find(e => !emailOk(e));
  if (bad) throw new ApiError(400, 'อีเมลไม่ถูกต้อง: ' + bad);
  return { name, nameKey: normName(name), to, cc };
}
