import crypto from 'crypto';
import { env } from './env';

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
/** Keyed hash for anything stored as a lookup key (session / invite / reset tokens). */
export const hashToken = (token: string) => crypto.createHmac('sha256', env.sessionSecret).update(token).digest('hex');
export const sha256 = (buf: Buffer | string) => crypto.createHash('sha256').update(buf).digest('hex');
export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
export function hmac(data: string) { return crypto.createHmac('sha256', env.sessionSecret).update(data).digest('base64url'); }
