import test from 'node:test';
import assert from 'node:assert/strict';
import pages from '../worker/pages-address.mjs';
import { publicAddressRedirect } from '../lib/public-address.mjs';

const origin = 'https://malapit.pages.dev';
test('Pages retains the original auth callback, cookies, body, and range request', async () => {
  for (const path of ['/auth/callback?code=fictional&return_to=%2F%3Fview%3Drentals', '/api/inquiries', '/tutorial/malapit-how-to.mp4', '/sw.js']) {
    const request = new Request(origin + path, {
      method: path === '/api/inquiries' ? 'POST' : 'GET',
      headers: { Cookie: 'fictional=private', Origin: origin, Range: 'bytes=32-63' },
      ...(path === '/api/inquiries' ? { body: '{"message":"fictional"}' } : {}),
    });
    const expected = new Response('original body', { status: 206, headers: {
      'Content-Range': 'bytes 32-63/128',
      'Set-Cookie': 'fictional=private; HttpOnly; Secure; Path=/',
    } });
    const response = await pages.fetch(request, { MALAPIT: { async fetch(forwarded) {
      assert.equal(forwarded, request);
      assert.equal(forwarded.headers.get('origin'), origin);
      assert.equal(forwarded.headers.get('range'), 'bytes=32-63');
      if (forwarded.method === 'POST') assert.equal(await forwarded.text(), '{"message":"fictional"}');
      assert.equal(publicAddressRedirect(forwarded), null);
      return expected;
    } } });
    assert.equal(response, expected);
  }
});
test('Pages rejects preview and unrelated origins before accessing the app', async () => {
  for (const host of ['fictional.malapit.pages.dev', 'malapit.pages.dev.evil.example', 'malapit-ph.pages.dev']) {
    const response = await pages.fetch(new Request('https://' + host + '/api/rentals'), {
      MALAPIT: { fetch() { throw new Error('A preview must not access rental data'); } },
    });
    assert.equal(response.status, 404);
  }
  assert.equal((await pages.fetch(new Request(origin), {})).status, 503);
});
test('both earlier addresses redirect public visits, while preserving private operations', () => {
  for (const old of ['https://malapit.malapit-ph.workers.dev', 'https://malapit-test.malapit-ph.workers.dev']) {
    for (const method of ['GET', 'HEAD']) {
      const response = publicAddressRedirect(new Request(old + '/?view=rentals&bill=fictional', { method }));
      assert.equal(response.status, 307);
      assert.equal(response.headers.get('location'), origin + '/?view=rentals&bill=fictional');
    }
    for (const path of ['/auth/callback?code=fictional', '/auth/signout', '/api/rentals', '/sw.js']) {
      assert.equal(publicAddressRedirect(new Request(old + path)), null);
    }
    assert.equal(publicAddressRedirect(new Request(old + '/', { method: 'POST', body: 'fictional' })), null);
  }
  assert.equal(publicAddressRedirect(new Request('http://127.0.0.1:5187/')), null);
  assert.equal(publicAddressRedirect(new Request(origin + '/')), null);
});
test('old sign-in links land safely on Pages before a same-origin login', () => {
  for (const value of ['https://evil.example', '//evil.example', '/\\evil.example', '/auth/signin', '/cdn-cgi/test']) {
    const request = new Request('https://malapit.malapit-ph.workers.dev/auth/signin?return_to=' + encodeURIComponent(value));
    assert.equal(publicAddressRedirect(request).headers.get('location'), origin + '/');
  }
  const request = new Request('https://malapit.malapit-ph.workers.dev/auth/signin?return_to=%2F%3Fview%3Drentals', {
    headers: { 'sec-fetch-site': 'same-origin' },
  });
  assert.equal(publicAddressRedirect(request).headers.get('location'), origin + '/?view=rentals');
});
