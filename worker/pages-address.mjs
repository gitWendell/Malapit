import { PUBLIC_SITE_URL } from '../lib/release.ts';

export default {
  async fetch(request, env) {
    // Deployment preview hosts are not additional account origins.
    if (new URL(request.url).origin !== PUBLIC_SITE_URL) {
      return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }
    if (!env.MALAPIT) {
      return new Response('Malapit is temporarily unavailable. Please try again shortly.', {
        status: 503, headers: { 'Cache-Control': 'no-store' },
      });
    }
    // Keep the original request, including the Pages origin, streamed body,
    // cookies and range headers. The existing app enforces all access checks.
    return env.MALAPIT.fetch(request);
  },
};
