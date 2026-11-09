import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { shareTarget } from '../src/sharing.js';
import { renderSharedPage } from '../src/shared-page.js';
test('share targets cannot select a different account or an unsupported view', () => {
  assert.deepEqual(shareTarget('wishlist'), { scope: 'wishlist', targetId: '' });
  assert.throws(() => shareTarget('inventory'));
  assert.throws(() => shareTarget('wishlist', 'another-account'));
  assert.throws(() => shareTarget('collection', 'not-an-id'));
});
test('shared HTML escapes names and uses source images only', () => {
  const page = {
    scope: 'wishlist',
    title: '<img src=x onerror=alert(1)>',
    total: 1,
    matches: 1,
    page: 1,
    pageSize: 24,
    hasMore: false,
    filters: { language: '', status: '', search: '" onfocus="alert(1)', page: 1 },
    cards: [
      {
        name: '<script>bad()</script>',
        language: 'en',
        sourceId: 'set-1',
        number: '1',
        setName: 'A & B',
        image: 'https://other.example/image.png',
        artist: 'An artist',
        finish: { type: 'normal', stamps: [] },
      },
    ],
  };
  const html = renderSharedPage(page, new URL('https://carddex.example/s/' + 'a'.repeat(64)));
  assert(!html.includes('<script>bad()'));
  assert(!html.includes('<img src=x'));
  assert(!html.includes('https://other.example'));
  assert(html.includes('&lt;script&gt;'));
  assert(html.includes('no-referrer'));
  assert(!html.includes('name="status"'));
});
test('public links never authenticate private data requests or allow public writes', async () => {
  const env = {
    PASSKEY_ORIGIN: 'https://carddex.example',
    BETTER_AUTH_SECRET: 'isolated-test-secret-nqduY6guQ8K4dxrqQw',
  };
  for (const path of [
    '/api/shares?scope=wishlist',
    '/api/shares/preview?scope=wishlist&account=' + 'a'.repeat(64),
    '/api/sync',
  ]) {
    const response = await worker.fetch(
      new Request('https://carddex.example' + path, {
        headers: { 'X-Carddex-Account': 'a'.repeat(64), Authorization: 'Bearer ' + 'b'.repeat(64) },
      }),
      env,
    );
    assert.equal(response.status, 401);
  }
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const response = await worker.fetch(
      new Request('https://carddex.example/s/' + 'a'.repeat(64), { method }),
      {},
    );
    assert.equal(response.status, 405);
  }
});
