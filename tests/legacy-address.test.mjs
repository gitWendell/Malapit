import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/legacy-address.mjs';

const oldOrigin = 'https://malapit-test.malapit-ph.workers.dev';
test('old shared links preserve the destination on the public address', async () => {
  for (const path of ['/?view=rentals&bill=example', '/guide', '/privacy/', '/terms', '/install', '/payment-demo', '/auth/signin?return_to=%2F%3Fview%3Dsaved']) {
    const response = await worker.fetch(new Request(oldOrigin + path), {});
    assert.equal(response.status, 307);
    const destination = path.startsWith('/auth/signin') ? '/?view=saved' : path;
    assert.equal(response.headers.get('location'), 'https://malapit.pages.dev' + destination);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
});
test('old callbacks, API writes and loaded assets retain the original request and cookies', async () => {
  for (const path of ['/auth/callback?code=fictional', '/auth/signout', '/api/notifications', '/sw.js', '/assets/existing-tab.js']) {
    const request = new Request(oldOrigin + path, {
      method: path === '/api/notifications' ? 'PATCH' : 'GET',
      headers: { Cookie: 'fictional=private', Origin: oldOrigin },
      ...(path === '/api/notifications' ? { body: '{"id":"fictional"}' } : {}),
    });
    const response = await worker.fetch(request, { MALAPIT: { async fetch(forwarded) {
      assert.equal(forwarded, request);
      assert.equal(forwarded.headers.get('cookie'), 'fictional=private');
      assert.equal(forwarded.headers.get('origin'), oldOrigin);
      if (forwarded.method === 'PATCH') assert.equal(await forwarded.text(), '{"id":"fictional"}');
      return new Response(null, { status: 204, headers: { 'Set-Cookie': 'fictional=; Max-Age=0; HttpOnly; Secure; Path=/' } });
    } } });
    assert.equal(response.status, 204);
    assert.match(response.headers.get('set-cookie'), /HttpOnly; Secure/);
    assert.equal(response.headers.get('location'), null);
  }
});
