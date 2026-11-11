import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

async function headers(request, friend = false) {
  const extra = friend ? { 'X-Carddex-Dev-Email': 'friend@example.test' } : {};
  const { user } = await (await request.get('/api/session', { headers: extra })).json();
  return { ...extra, Origin: 'http://127.0.0.1:8788', 'X-Carddex-Account': user.id };
}
async function details(request, id) {
  const r = await request.get(`/api/cards/detail?language=en&sourceId=${id}`, {
    headers: await headers(request),
  });
  expect(r.ok(), await r.text()).toBeTruthy();
  return (await r.json()).card;
}
async function known(request, pokemon) {
  const r = await request.get(`/api/catalogue?pokemon=${pokemon}`, {
    headers: await headers(request),
  });
  return (await r.json()).cards;
}

test('set and printed collector number identify one card in saved and external searches', async ({
  request,
}) => {
  const h = await headers(request);
  for (const number of ['001', '1', '001/165']) {
    for (const path of [
      `/api/cards/search?language=en&q=Bulbasaur&set=sv03.5&number=${encodeURIComponent(number)}`,
      `/api/catalogue?language=en&search=Bulbasaur&set=sv03.5&number=${encodeURIComponent(number)}`,
    ]) {
      const response = await request.get(path, { headers: h });
      expect(response.ok(), await response.text()).toBeTruthy();
      expect((await response.json()).cards.map((c) => c.sourceId)).toEqual(['sv03.5-001']);
    }
  }
});

test('search and preview stay temporary; adding a card saves one shared record and private ownership', async ({
  request,
}) => {
  expect((await known(request, 4)).some((c) => c.sourceId === 'sv03.5-004')).toBe(false);
  const found = await request.get('/api/cards/search?language=en&pokemon=4', {
    headers: await headers(request),
  });
  expect((await found.json()).cards.some((c) => c.sourceId === 'sv03.5-004')).toBe(true);
  const card = await details(request, 'sv03.5-004');
  expect((await known(request, 4)).some((c) => c.sourceId === 'sv03.5-004')).toBe(false);
  const data = {
    language: 'en',
    sourceId: card.sourceId,
    variantId: card.variants[0].id,
    quantity: 1,
    wanted: false,
    baseRevision: 0,
    mutationId: randomUUID(),
  };
  const h = await headers(request);
  expect(
    (await request.post('/api/cards/add', { headers: h, data: { ...data, quantity: 0 } })).status(),
  ).toBe(400);
  expect((await known(request, 4)).some((c) => c.sourceId === 'sv03.5-004')).toBe(false);
  const added = await request.post('/api/cards/add', { headers: h, data });
  expect(added.ok(), await added.text()).toBeTruthy();
  const revision = (await added.json()).state.revision;
  const retry = await request.post('/api/cards/add', { headers: h, data });
  expect((await retry.json()).state.revision).toBe(revision);
  expect((await known(request, 4)).filter((c) => c.sourceId === 'sv03.5-004')).toHaveLength(1);
  const friend = await request.get('/api/sync', { headers: await headers(request, true) });
  expect((await friend.json()).inventory.some((r) => r.variantId === data.variantId)).toBe(false);
});

test('the Pokémon view shows personal cards and external search runs only after an explicit action', async ({
  page,
}) => {
  let externalCalls = 0;
  page.on('request', (r) => {
    if (new URL(r.url()).pathname === '/api/cards/search') externalCalls++;
  });
  await page.goto('/');
  await expect(page.locator('#cloud-status')).toHaveText('All changes saved online.');
  await page.getByRole('button', { name: 'View cards for Charmeleon', exact: true }).click();
  await expect(page.locator('#library-content')).toContainText('No cards recorded');
  expect(externalCalls).toBe(0);
  await page.locator('#library-add').click();
  await expect(page.locator('#card-search-status')).toContainText('saved matches');
  expect(externalCalls).toBe(0);
  await page.locator('#search-external').click();
  await expect(page.locator('.search-card[data-source-id="sv03.5-005"]')).toBeVisible();
  expect(externalCalls).toBe(1);
  await page.locator('.search-card[data-source-id="sv03.5-005"]').locator('[data-preview]').click();
  await page.getByRole('button', { name: 'Add to wishlist', exact: true }).click();
  await expect(page.locator('#detail-message')).toContainText('saved as wanted');
  await page.screenshot({ path: 'test-results/demand-search-desktop.png', fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.locator('#card-detail').evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.screenshot({ path: 'test-results/demand-search-phone.png', fullPage: false });
  await page.locator('#app-back').click();
  await page.locator('#app-back').click();
  await expect(page.locator('.tcg-card')).toHaveCount(1);
  await page.locator('#app-back').click();
  await page.getByRole('button', { name: 'View cards for Charmeleon', exact: true }).click();
  await expect(page.locator('.tcg-card')).toHaveCount(1);
  expect(externalCalls).toBe(1);
});

test('two accounts can add the same new card without duplicate shared records', async ({
  request,
}) => {
  const card = await details(request, 'sv03.5-006'),
    variantId = card.variants[0].id;
  const replies = await Promise.all(
    [false, true].map(async (friend) =>
      request.post('/api/cards/add', {
        headers: await headers(request, friend),
        data: {
          language: 'en',
          sourceId: card.sourceId,
          variantId,
          quantity: friend ? 0 : 1,
          wanted: friend,
          baseRevision: 0,
          mutationId: randomUUID(),
        },
      }),
    ),
  );
  for (const reply of replies) expect(reply.ok(), await reply.text()).toBeTruthy();
  expect((await known(request, 6)).filter((c) => c.sourceId === 'sv03.5-006')).toHaveLength(1);
  const owner = await (await request.get('/api/sync', { headers: await headers(request) })).json();
  const friend = await (
    await request.get('/api/sync', { headers: await headers(request, true) })
  ).json();
  expect(owner.inventory.find((r) => r.variantId === variantId)).toMatchObject({
    quantity: 1,
    wanted: false,
  });
  expect(friend.inventory.find((r) => r.variantId === variantId)).toMatchObject({
    quantity: 0,
    wanted: true,
  });
});

test('a backup restores only its referenced missing cards without a catalogue preload', async ({
  page,
  request,
}) => {
  const card = await details(request, 'sv03.5-007'),
    variantId = card.variants[0].id;
  expect((await known(request, 7)).some((c) => c.sourceId === card.sourceId)).toBe(false);
  const data = {
    app: 'carddex',
    version: 2,
    legacyOwned: [],
    inventory: [{ variantId, quantity: 2, wanted: false }],
    collections: [{ id: randomUUID(), name: 'Restored goal', variantIds: [variantId] }],
    sources: [{ variantId, language: 'en', sourceId: card.sourceId }],
  };
  await page.goto('/');
  await expect(page.locator('#cloud-status')).toHaveText('All changes saved online.');
  await page.locator('#import-file').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(data)),
  });
  await page.locator('#restore-review-confirm').click();
  await expect
    .poll(async () => {
      const result = await (
        await request.get('/api/sync', { headers: await headers(request) })
      ).json();
      return result.inventory.find((r) => r.variantId === variantId)?.quantity;
    })
    .toBe(2);
  await expect(page.locator('#cloud-status')).toHaveText('All changes saved online.');
  expect((await known(request, 7)).filter((c) => c.sourceId === card.sourceId)).toHaveLength(1);
});

test('physical Trainers and Energy can enter collections without adding Pokédex progress', async ({
  page,
  request,
}) => {
  const h = await headers(request);
  const sync = async () => (await request.get('/api/sync', { headers: h })).json();
  const progress = (await sync()).progress;
  const cards = async (path) => {
    const response = await request.get(path, { headers: h });
    expect(response.ok(), await response.text()).toBeTruthy();
    return (await response.json()).cards;
  };
  expect(await cards('/api/catalogue?language=en&category=Trainer&search=Erika')).toEqual([]);
  expect(await cards('/api/cards/search?language=en&q=Erika')).toEqual([
    expect.objectContaining({ sourceId: 'sv03.5-160' }),
  ]);
  const energy = await cards('/api/cards/search?language=ja&category=Energy&set=SV2P&number=071');
  expect(energy).toEqual([
    expect.objectContaining({ sourceId: 'SV2P-071', category: 'Energy', energyType: 'Special' }),
  ]);

  await page.goto('/#/collections');
  await expect(page.locator('#cloud-status')).toHaveText('All changes saved online.');
  await page.locator('#new-collection').click();
  await page.locator('#collection-name').fill('Physical card types');
  await page.getByRole('button', { name: 'Save collection' }).click();
  await expect(page.locator('#library-title')).toHaveText('Physical card types');
  await page.locator('#library-add').click();
  await page.getByRole('button', { name: 'Trainer', exact: true }).click();
  await page.locator('#card-search-name').fill('Erika');
  await page.locator('#search-external').click();
  await page.locator('[data-source-id="sv03.5-160"] button').click();
  await expect(page.locator('.detail-record')).toContainText('Trainer · Supporter');
  await page.locator('#detail-finish').selectOption({ label: 'Reverse holo' });
  await page.getByRole('button', { name: 'Add one owned copy' }).click();
  await expect(page.locator('#detail-message')).toContainText('saved as owned');
  const saved = await cards('/api/catalogue?language=en&category=Trainer&search=Erika');
  expect(saved).toEqual([
    expect.objectContaining({ sourceId: 'sv03.5-160', trainerType: 'Supporter', pokemonIds: [] }),
  ]);
  expect(await cards('/api/catalogue?language=en&category=Pokemon&search=Erika')).toEqual([]);

  const snapshot = await sync();
  const collection = snapshot.collections.find((item) => item.name === 'Physical card types');
  const energyPreview = await (
    await request.get('/api/cards/detail?language=ja&sourceId=SV2P-071', { headers: h })
  ).json();
  expect(energyPreview).toMatchObject({ saved: false, card: { pokemonIds: [] } });
  const variantId = energyPreview.card.variants[0].id;
  const added = await request.post('/api/cards/add', {
    headers: h,
    data: {
      language: 'ja',
      sourceId: 'SV2P-071',
      variantId,
      quantity: 0,
      wanted: false,
      baseRevision: 0,
      mutationId: randomUUID(),
      collectionId: collection.id,
      collectionRevision: collection.revision,
      goalOnly: true,
    },
  });
  expect(added.ok(), await added.text()).toBeTruthy();
  expect((await added.json()).collection.variantIds).toEqual(
    expect.arrayContaining([...collection.variantIds, variantId]),
  );
  expect((await sync()).progress).toEqual(progress);
});
