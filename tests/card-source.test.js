import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { cardDetails, sourceLocation, sourceRead } from '../src/card-source.js';
import { identifier } from '../src/identifiers.js';

test('live source reads use a redirect mode supported by Cloudflare Workers', async (t) => {
  const cards = [{ id: 'base1-23', name: 'Arcanine', localId: '23' }];
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls++;
    // Workers reject redirect: error before making the request, unlike Node and browsers.
    assert.equal(options.redirect, 'manual');
    return Response.json(cards);
  });
  const request = new Request('https://carddex.example/api/cards/search');
  const url = 'https://api.tcgdex.net/v2/en/cards?name=arcanine';
  assert.deepEqual(await sourceRead({}, request, url), cards);
  assert.deepEqual(await sourceRead({}, request, url), cards);
  assert.equal(calls, 1);
});

test('source redirects are refused without following them or caching a failed reply', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls++;
    assert.equal(options.redirect, 'manual');
    return calls === 1
      ? new Response(null, { status: 302, headers: { Location: 'https://other.example/cards' } })
      : Response.json([]);
  });
  const request = new Request('https://carddex.example/api/cards/search');
  const url = 'https://api.tcgdex.net/v2/ja/cards?name=redirect-test';
  await assert.rejects(sourceRead({}, request, url), (error) => error.status === 503);
  assert.equal(calls, 1);
  assert.deepEqual(await sourceRead({}, request, url), []);
  assert.equal(calls, 2);
});

test('cards added through search keep the audited stable card and variant IDs', async () => {
  const rows = JSON.parse(readFileSync('tests/fixtures/source-cards.json', 'utf8'));
  const env = {
    LOCAL_DEV_AUTH: 'true',
    CATALOGUE_TEST_SOURCE: 'true',
    ASSETS: { fetch: async () => Response.json(rows) },
  };
  const card = await cardDetails(
    env,
    new Request('http://127.0.0.1/api/cards/detail'),
    'en',
    'sv03.5-001',
  );
  assert.equal(card.id, 'd1ca0ce4-a802-557a-a93c-4bb51b309699');
  assert.ok(card.variants.some((v) => v.id === '753ca925-db2c-5f1e-b142-c650e8558413'));
  assert.equal(await identifier('card', 'en', 'sv03.5-001'), card.id);
  assert.notEqual(await identifier('card', 'ja', 'sv03.5-001'), card.id);
});

test('source lookups use a fixed host and bulk imports cannot target the app', () => {
  assert.throws(() => sourceLocation('en', 'https://other.test/data'));
  assert.throws(() => sourceLocation('fr', 'base1-1'));
  assert.throws(
    () =>
      execFileSync(process.execPath, ['scripts/import-catalogue.mjs', '--remote'], {
        stdio: 'pipe',
      }),
    (error) => {
      assert.match(error.stderr.toString(), /Bulk imports are disabled/);
      return true;
    },
  );
});

test('digital Pocket cards cannot enter the physical card catalogue', async () => {
  const rows = [
    {
      language: 'en',
      card: {
        id: 'A1-1',
        category: 'Pokemon',
        name: 'Digital card',
        set: { id: 'A1' },
        dexId: [1],
      },
    },
  ];
  const env = {
    LOCAL_DEV_AUTH: 'true',
    CATALOGUE_TEST_SOURCE: 'true',
    ASSETS: { fetch: async () => Response.json(rows) },
  };
  await assert.rejects(
    cardDetails(env, new Request('http://127.0.0.1/api/cards/detail'), 'en', 'A1-1'),
    /digital Pocket/,
  );
});
