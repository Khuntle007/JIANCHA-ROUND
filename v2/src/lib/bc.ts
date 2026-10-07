// Business Central → product codes (number, displayName, blocked). Vendors are NOT pulled — suppliers are linked by hand.
import { prisma } from './db';
import { bcStatus, saveBcStatus, type BcStatus } from './settings';

export function bcConf() {
  const e = process.env, tenant = e.BC_TENANT_ID || e.GRAPH_TENANT_ID || '';
  return {
    tenant, client: e.BC_CLIENT_ID || e.GRAPH_CLIENT_ID || '', secret: e.BC_CLIENT_SECRET || e.GRAPH_CLIENT_SECRET || '',
    env: e.BC_ENVIRONMENT || 'Production', company: e.BC_COMPANY || '',
    api: (e.BC_API_BASE || 'https://api.businesscentral.dynamics.com').replace(/\/$/, ''),
    tokenUrl: e.BC_TOKEN_URL || `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
  };
}
export const bcConfigured = () => { const c = bcConf(); return !!(c.tenant && c.client && c.secret && c.company); };

let running = false;
export async function bcSync(): Promise<BcStatus> {
  if (!bcConfigured()) throw new Error('ยังไม่ได้ตั้งค่า Business Central (BC_TENANT_ID / BC_CLIENT_ID / BC_CLIENT_SECRET / BC_COMPANY ใน .env)');
  if (running) throw new Error('กำลังซิงก์อยู่');
  running = true;
  try {
    const c = bcConf();
    const t = await fetch(c.tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(30_000),
      body: new URLSearchParams({ client_id: c.client, client_secret: c.secret, scope: 'https://api.businesscentral.dynamics.com/.default', grant_type: 'client_credentials' }) });
    const tj = (await t.json().catch(() => ({}))) as { access_token?: string; error_description?: string };
    if (!t.ok || !tj.access_token) throw new Error(`BC token ${t.status} ${(tj.error_description || '').slice(0, 200)}`);
    const hdr = { Authorization: 'Bearer ' + tj.access_token, Prefer: 'odata.maxpagesize=5000' };
    const base = `${c.api}/v2.0/${c.tenant}/${encodeURIComponent(c.env)}/api/v2.0`;
    const cs = await fetch(base + '/companies', { headers: hdr, signal: AbortSignal.timeout(60_000) });
    if (!cs.ok) throw new Error(`BC companies ${cs.status} ${(await cs.text()).slice(0, 200)}`);
    const comp = (((await cs.json()) as { value?: { id: string; name: string; displayName: string }[] }).value || []).find(x => [x.id, x.name, x.displayName].includes(c.company));
    if (!comp) throw new Error(`ไม่พบบริษัท "${c.company}" ใน Business Central`);
    let url = `${base}/companies(${comp.id})/items?$select=number,displayName,blocked`, n = 0;
    while (url) {
      const r = await fetch(url, { headers: hdr, signal: AbortSignal.timeout(120_000) });
      if (!r.ok) throw new Error(`BC items ${r.status} ${(await r.text()).slice(0, 200)}`);
      const j = (await r.json()) as { value?: { number?: string; displayName?: string; blocked?: boolean }[]; '@odata.nextLink'?: string };
      for (const it of j.value || []) {
        const code = String(it.number || '').trim().slice(0, 40);
        if (!code) continue;
        const name = String(it.displayName || '').trim().slice(0, 200);
        await prisma.product.upsert({ where: { code }, create: { code, name, source: 'bc', bc: true, blocked: !!it.blocked }, update: { ...(name ? { name } : {}), bc: true, blocked: !!it.blocked } });
        n++;
      }
      url = j['@odata.nextLink'] || '';
    }
    const st = { lastSyncAt: new Date().toISOString(), count: n, company: comp.displayName || comp.name, error: '' };
    await saveBcStatus(st);
    return st;
  } catch (e) {
    await saveBcStatus({ ...(await bcStatus()), error: String((e as Error).message || e).slice(0, 300), failedAt: new Date().toISOString() });
    throw e;
  } finally { running = false; }
}

/** Hourly check: sync when configured and the last success is older than 24 h (or never). */
export async function bcAutoSync() {
  if (!bcConfigured()) return;
  const s = await bcStatus();
  if (s.lastSyncAt && Date.now() - new Date(s.lastSyncAt).getTime() < 24 * 3600_000) return;
  await bcSync().catch(e => console.error('[bc sync]', (e as Error).message));
}
