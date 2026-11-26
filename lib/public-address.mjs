import { PUBLIC_SITE_URL } from './release.ts';
import { safeReturnPath } from './auth-return.ts';

const LEGACY_ORIGINS = new Set([
  'https://malapit.malapit-ph.workers.dev',
  'https://malapit-test.malapit-ph.workers.dev',
]);

export function publicAddressRedirect(request) {
  const url = new URL(request.url);
  if (!LEGACY_ORIGINS.has(url.origin) || !['GET', 'HEAD'].includes(request.method)) return null;
  const path = url.pathname.replace(/\/$/, '') || '/';
  if (!['/', '/guide', '/privacy', '/terms', '/install', '/payment-demo', '/auth/signin'].includes(path)) return null;
  // Land old sign-in links on their intended public screen first. Redirecting
  // directly to /auth/signin crosses sites and correctly fails its CSRF check.
  const destination = path === '/auth/signin'
    ? safeReturnPath(url.searchParams.get('return_to'))
    : url.pathname + url.search;
  // Existing callbacks and API requests retain their original host and cookies.
  return new Response(null, { status: 307, headers: {
    Location: new URL(destination, PUBLIC_SITE_URL).href,
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
  } });
}
