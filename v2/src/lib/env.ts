// Server-only configuration. Fails loudly instead of silently falling back to insecure defaults.
import path from 'path';

function required(name: string, minLen = 1): string {
  const v = process.env[name];
  if (!v || v.length < minLen) throw new Error(`env ${name} is required${minLen > 1 ? ` (>= ${minLen} chars)` : ''}`);
  return v;
}

export const env = {
  get sessionSecret() { return required('SESSION_SECRET', 32); },
  get appUrl() { return (process.env.APP_URL || 'http://localhost:3100').replace(/\/$/, ''); },
  get dataDir() { return path.resolve(process.env.DATA_DIR || './data'); },
  get mailSender() { return process.env.MAIL_SENDER || 'Noreply@jianchatea.com'; },
  get maxPdfBytes() { return Number(process.env.MAX_PDF_BYTES || 15 * 1024 * 1024); },
  get graph() {
    return { tenant: process.env.GRAPH_TENANT_ID || '', clientId: process.env.GRAPH_CLIENT_ID || '', secret: process.env.GRAPH_CLIENT_SECRET || '' };
  },
  get mailDryRun() { return process.env.MAIL_DRY_RUN === '1' || !process.env.GRAPH_CLIENT_SECRET; },
  get isProd() { return process.env.NODE_ENV === 'production'; },
};
