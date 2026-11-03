import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const origin = 'http://127.0.0.1:8788';
const friend = { 'X-Carddex-Dev-Email': 'friend@example.test' };
async function headers(request, extra = {}) {
  const { user } = await (await request.get('/api/session', { headers: extra })).json();
  return { ...extra, Origin: origin, 'X-Carddex-Account': user.id };
}
async function sync(request, extra = {}) {
  return (await request.get('/api/sync', { headers: await headers(request, extra) })).json();
}
async function save(request, kind, id, data, extra = {}) {
  const body = await sync(request, extra),
    row = body[kind === 'inventory' ? 'inventory' : 'collections'].find(
      (row) => (row.variantId || row.id) === id,
    );
  const response = await request.put(`/api/${kind}/${id}`, {
    headers: await headers(request, extra),
    data: { ...data, baseRevision: row?.revision || 0, mutationId: randomUUID() },
  });
  expect(response.ok(), await response.text()).toBe(true);
}
async function variant(
  request,
  language = 'en',
  sourceId = language === 'en' ? 'sv03.5-001' : 'SV2a-001',
) {
  return (
    await (
      await request.get(`/api/cards/detail?${new URLSearchParams({ language, sourceId })}`, {
        headers: await headers(request),
      })
    ).json()
  ).card.variants[0].id;
}
async function sharing(request, scope, targetId = '', extra = {}) {
  return (
    await request.get(`/api/shares?${new URLSearchParams({ scope, targetId })}`, {
      headers: await headers(request, extra),
    })
  ).json();
}
async function setSharing(request, scope, targetId, enabled, extra = {}) {
  const current = await sharing(request, scope, targetId, extra);
  const response = await request.put('/api/shares', {
    headers: await headers(request, extra),
    data: { scope, targetId, enabled, baseRevision: current.share.revision },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}
async function collection(request, name = 'Shared artwork', ids = []) {
  const id = randomUUID();
  await save(request, 'collections', id, { name, deleted: false, variantIds: ids });
  return id;
}

test('collection links expose selected cards and boolean progress without private records', async ({
  request,
}) => {
  const en = await variant(request),
    ja = await variant(request, 'ja'),
    id = await collection(request, 'Shared artwork', [en, ja]);
  await save(request, 'inventory', en, { quantity: 731, wanted: false });
  await save(request, 'inventory', ja, { quantity: 0, wanted: false });
  const secret = await variant(request, 'en', 'base1-44');
  await collection(request, 'A private collection name', [secret]);
  const before = await sync(request);
  const disabled = await sharing(request, 'collection', id);
  expect(disabled.share).toEqual({ enabled: false, revision: 0, url: null });
  const active = await setSharing(request, 'collection', id, true);
  const response = await request.get(active.share.url + '/data');
  expect(response.status()).toBe(200);
  const page = await response.json();
  expect(page.title).toBe('Shared artwork');
  expect(page.total).toBe(2);
  expect(page.owned).toBe(1);
  expect(page.cards).toHaveLength(2);
  expect(page.cards.some((card) => card.sourceId === 'base1-44')).toBe(false);
  const body = JSON.stringify(page);
  for (const hidden of [
    'quantity',
    'user_id',
    'owner@example.test',
    'friend@example.test',
    'A private collection name',
    '731',
    id,
  ])
    expect(body).not.toContain(hidden);
  expect(response.headers()['cache-control']).toContain('no-store');
  expect(response.headers()['referrer-policy']).toBe('no-referrer');
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH'])
    expect((await request.fetch(active.share.url + '/data', { method })).status()).toBe(405);
  const attempted = await request.get(
    active.share.url + '/data?scope=wishlist&user_id=someone-else',
  );
  expect((await attempted.json()).title).toBe('Shared artwork');
  const after = await sync(request);
  expect(after.cursor).toBe(before.cursor);
  expect(after.inventory).toEqual(before.inventory);
  expect(after.collections).toEqual(before.collections);
  const denied = await request.put('/api/shares', {
    headers: await headers(request, friend),
    data: {
      scope: 'collection',
      targetId: id,
      enabled: false,
      baseRevision: active.share.revision,
    },
  });
  expect(denied.status()).toBe(404);
});

test('live wishlist links follow wanted cards and missing goals without exposing ownership quantities or collection names', async ({
  request,
}) => {
  const en = await variant(request),
    ja = await variant(request, 'ja');
  await save(request, 'inventory', en, { quantity: 731, wanted: true });
  await save(request, 'inventory', ja, { quantity: 0, wanted: false });
  await collection(request, 'Keep this goal name private', [ja]);
  const active = await setSharing(request, 'wishlist', '', true);
  let page = await (await request.get(active.share.url + '/data')).json();
  expect(page.cards.some((card) => card.sourceId === 'sv03.5-001')).toBe(true);
  expect(page.cards.some((card) => card.sourceId === 'SV2a-001')).toBe(true);
  expect(page).not.toHaveProperty('owned');
  for (const card of page.cards) {
    expect(card).not.toHaveProperty('owned');
    expect(card).not.toHaveProperty('quantity');
  }
  expect(JSON.stringify(page)).not.toContain('Keep this goal name private');
  await save(request, 'inventory', ja, { quantity: 1, wanted: false });
  await save(request, 'inventory', en, { quantity: 731, wanted: false });
  page = await (await request.get(active.share.url + '/data')).json();
  expect(page.cards.some((card) => card.sourceId === 'SV2a-001')).toBe(false);
  await save(request, 'inventory', en, { quantity: 731, wanted: true });
  const filtered = await (
    await request.get(active.share.url + '/data?language=en&search=Bulbasaur')
  ).json();
  expect(filtered.cards.some((card) => card.sourceId === 'sv03.5-001')).toBe(true);
  expect(filtered.cards.every((card) => card.language === 'en')).toBe(true);
  expect((await request.get(active.share.url + '/data?status=owned')).status()).toBe(400);
});

test('turning a link off revokes it and stale requests cannot turn it back on', async ({
  request,
}) => {
  const id = await collection(request, 'Revocation check', [await variant(request)]);
  const active = await setSharing(request, 'collection', id, true),
    off = await setSharing(request, 'collection', id, false);
  expect(off.share.enabled).toBe(false);
  expect(off.share.url).toBeNull();
  expect((await request.get(active.share.url)).status()).toBe(404);
  const stale = await request.put('/api/shares', {
    headers: await headers(request),
    data: { scope: 'collection', targetId: id, enabled: true, baseRevision: active.share.revision },
  });
  expect(stale.status()).toBe(409);
  expect((await request.get(active.share.url + '/data')).status()).toBe(404);
  const renewed = await setSharing(request, 'collection', id, true);
  expect(renewed.share.url).not.toBe(active.share.url);
  expect((await request.get(renewed.share.url)).status()).toBe(200);
  await save(request, 'collections', id, {
    name: 'Revocation check',
    deleted: true,
    variantIds: [await variant(request)],
  });
  expect((await request.get(renewed.share.url)).status()).toBe(404);
  await save(request, 'collections', id, {
    name: 'Revocation check',
    deleted: false,
    variantIds: [await variant(request)],
  });
  expect((await sharing(request, 'collection', id)).share.enabled).toBe(false);
  expect((await request.get(renewed.share.url)).status()).toBe(404);
  expect((await request.get(origin + '/s/' + 'f'.repeat(64))).status()).toBe(404);
});

test('owner previews require the signed-in account and do not enable sharing', async ({
  request,
}) => {
  const id = await collection(request, '<img src=x onerror=alert(1)>', [await variant(request)]),
    current = await sharing(request, 'collection', id);
  const preview = await request.get(current.previewUrl);
  expect(preview.status()).toBe(200);
  const html = await preview.text();
  expect(html).toContain('Private preview');
  expect(html).toContain('&lt;img');
  expect(html).not.toContain('<img src=x');
  expect((await sharing(request, 'collection', id)).share.enabled).toBe(false);
  expect((await request.get(current.previewUrl, { headers: friend })).status()).toBe(401);
  expect(
    (
      await request.put('/api/shares', {
        headers: { ...(await headers(request)), Origin: 'https://other.example' },
        data: { scope: 'wishlist', targetId: '', enabled: true, baseRevision: 0 },
      })
    ).status(),
  ).toBe(403);
});

test('restored collections with the same ID keep separate public links for each account', async ({
  request,
}) => {
  const id = randomUUID(),
    en = await variant(request),
    ja = await variant(request, 'ja');
  await save(request, 'collections', id, {
    name: 'Owner gallery',
    deleted: false,
    variantIds: [en],
  });
  await save(
    request,
    'collections',
    id,
    { name: 'Member gallery', deleted: false, variantIds: [ja] },
    friend,
  );
  const ownerLink = await setSharing(request, 'collection', id, true);
  const memberLink = await setSharing(request, 'collection', id, true, friend);
  expect(ownerLink.share.url).not.toBe(memberLink.share.url);
  const ownerPage = await (await request.get(ownerLink.share.url + '/data')).json();
  const memberPage = await (await request.get(memberLink.share.url + '/data')).json();
  expect(ownerPage.title).toBe('Owner gallery');
  expect(ownerPage.cards.map((card) => card.language)).toEqual(['en']);
  expect(memberPage.title).toBe('Member gallery');
  expect(memberPage.cards.map((card) => card.language)).toEqual(['ja']);
  await setSharing(request, 'collection', id, false, friend);
  expect((await request.get(memberLink.share.url)).status()).toBe(404);
  expect((await request.get(ownerLink.share.url)).status()).toBe(200);
});

test('the sharing menu enables and stops a phone-friendly public page with no private API calls', async ({
  page,
  browser,
  request,
}) => {
  const id = await collection(request, 'Phone sharing', [await variant(request)]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#app-save-state')).toHaveText('Saved');
  await page.locator('#open-collections').click();
  await page.locator(`[data-open-collection="${id}"]`).click();
  await page.locator('#library-share').click();
  await expect(page.locator('#sharing-preview')).toBeVisible();
  await expect(page.locator('#sharing-enable')).toBeEnabled();
  const popupPromise = page.waitForEvent('popup');
  await page.locator('#sharing-preview').click();
  const preview = await popupPromise;
  await expect(preview.locator('.preview-banner')).toBeVisible();
  await preview.close();
  await page.locator('#sharing-enable').click();
  await expect(page.locator('#sharing-url')).not.toHaveValue('');
  const url = await page.locator('#sharing-url').inputValue();
  await page.screenshot({ path: 'test-results/share-controls-phone.png' });
  const guest = await browser.newContext({ viewport: { width: 390, height: 844 } }),
    view = await guest.newPage();
  let privateCalls = 0;
  view.on('request', (r) => {
    if (new URL(r.url()).pathname.startsWith('/api/')) privateCalls++;
  });
  await view.goto(url);
  await expect(view.getByRole('heading', { name: 'Phone sharing', exact: true })).toBeVisible();
  expect(privateCalls).toBe(0);
  await expect(view.locator('.app-nav')).toHaveCount(0);
  for (const width of [320, 390, 768, 1440]) {
    await view.setViewportSize({ width, height: 844 });
    expect(await view.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await view.setViewportSize({ width: 390, height: 844 });
  await view.screenshot({ path: 'test-results/shared-collection-phone.png' });
  await view.locator('[data-enlarge]').first().click();
  await expect(view.locator('#image-viewer')).toBeVisible();
  await view.locator('#close-image').click();
  await page.locator('#sharing-stop').click();
  await expect(page.locator('#sharing-status')).toContainText('Sharing is off');
  await view.reload();
  await expect(
    view.getByRole('heading', { name: 'This shared page is unavailable' }),
  ).toBeVisible();
  await guest.close();
  await page.locator('#sharing-close').click();
  await page.locator('#open-wishlist').click();
  await page.locator('#library-share').click();
  await expect(page.locator('#sharing-panel-title')).toHaveText('Share your wishlist');
  await expect(page.locator('#sharing-url')).not.toHaveValue('');
  const wishlistUrl = await page.locator('#sharing-url').inputValue();
  await page.locator('#sharing-stop').click();
  await expect(page.locator('#sharing-status')).toContainText('Sharing is off');
  expect((await request.get(wishlistUrl)).status()).toBe(404);
});

test('shared pages paginate and filter saved cards without using the external card source', async ({
  request,
}) => {
  const source = JSON.parse(await readFile('tests/fixtures/source-cards.json', 'utf8')).filter(
    (row) => row.card.id !== 'sv03.5-059',
  );
  const ids = [];
  for (const row of source) {
    const card = (
      await (
        await request.get(
          `/api/cards/detail?${new URLSearchParams({ language: row.language, sourceId: row.card.id })}`,
          { headers: await headers(request) },
        )
      ).json()
    ).card;
    const previous = (await sync(request)).inventory.find(
      (record) => record.variantId === card.variants[0].id,
    );
    const response = await request.post('/api/cards/add', {
      headers: await headers(request),
      data: {
        language: card.language,
        sourceId: card.sourceId,
        variantId: card.variants[0].id,
        quantity: 1,
        wanted: false,
        baseRevision: previous?.revision || 0,
        mutationId: randomUUID(),
      },
    });
    expect(response.ok()).toBe(true);
    ids.push(...card.variants.map((v) => v.id));
  }
  expect(ids.length).toBeGreaterThan(24);
  const id = await collection(request, 'A paged collection', ids),
    active = await setSharing(request, 'collection', id, true);
  const first = await (await request.get(active.share.url + '/data')).json(),
    second = await (await request.get(active.share.url + '/data?page=2')).json();
  expect(first.cards).toHaveLength(24);
  expect(first.hasMore).toBe(true);
  expect(second.cards.length).toBe(ids.length - 24);
  expect(second.hasMore).toBe(false);
  const filtered = await (await request.get(active.share.url + '/data?language=ja')).json();
  expect(filtered.cards.every((card) => card.language === 'ja')).toBe(true);
  expect(filtered.matches).toBeGreaterThan(0);
  const owned = await (await request.get(active.share.url + '/data?status=owned')).json();
  expect(owned.cards.every((card) => card.owned)).toBe(true);
});
