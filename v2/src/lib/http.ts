import { NextResponse } from 'next/server';
import { headers } from 'next/headers';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

/** Wrap a route handler: ApiError → JSON error, anything else → 500 without leaking internals. */
export function route<A extends unknown[]>(fn: (...a: A) => Promise<Response>) {
  return async (...a: A) => {
    try { return await fn(...a); }
    catch (e) {
      if (e instanceof ApiError) return json({ error: e.message }, e.status);
      console.error('[api]', e);
      return json({ error: 'server error' }, 500);
    }
  };
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  const t = await req.text();
  if (t.length > 512 * 1024) throw new ApiError(413, 'payload too large');
  try { return (t ? JSON.parse(t) : {}) as T; } catch { throw new ApiError(400, 'invalid JSON'); }
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get('x-forwarded-for') || h.get('x-real-ip') || '').split(',')[0].trim() || 'local';
}
export async function userAgent(): Promise<string> { return ((await headers()).get('user-agent') || '').slice(0, 200); }

export const str = (v: unknown, max = 200) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
