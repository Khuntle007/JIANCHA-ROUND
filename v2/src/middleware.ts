import { NextResponse, type NextRequest } from 'next/server';

// Deny-by-default: every path needs a session cookie except these. The cookie is only a hint here —
// the real session check happens server-side in requireUser()/requirePage() on every request.
const PUBLIC = [/^\/login$/, /^\/forgot$/, /^\/reset$/, /^\/invite$/, /^\/d\/[^/]+$/, /^\/a\/[^/]+$/, /^\/s\/[^/]+$/, /^\/api\/auth\//, /^\/api\/public\//, /^\/api\/health$/];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // CSRF: state-changing API calls must come from this origin.
  if (pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.headers.get('origin');
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
    if (!origin || !host || new URL(origin).host !== host) return NextResponse.json({ error: 'bad origin' }, { status: 403 });
  }
  if (PUBLIC.some(r => r.test(pathname))) return NextResponse.next();
  if (!req.cookies.get('jcr_session')) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'login required' }, { status: 401 });
    // Behind nginx the app listens on 127.0.0.1:8094, so req.nextUrl carries that host — build the redirect
    // from the public host the browser actually used.
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || req.nextUrl.host;
    const proto = req.headers.get('x-forwarded-proto') || req.nextUrl.protocol.replace(':', '');
    const next = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
    return NextResponse.redirect(new URL('/login' + next, `${proto}://${host}`));
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next/|favicon.ico|icon.png|icon.svg|brand/).*)'] };
