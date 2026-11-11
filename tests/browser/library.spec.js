import { openAccount, syncNow, openOwnedCard } from './helpers.js';
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { emptyBinder } from '../../src/client/binder-model.js';

const origin = 'http://127.0.0.1:8788';
const friend = { 'X-Carddex-Dev-Email': 'friend@example.test' };

async function headers(request, extra = {}) {
  const { user } = await (await request.get('/api/session', { headers: extra })).json();
  return { Origin: origin, ...extra, 'X-Carddex-Account': user.id };
}
async function sync(request, extra = {}, after = 0) {
  const response = await request.get(`/api/sync?after=${after}`, {
    headers: await headers(request, extra),
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
async function catalogue(request, pokemon = 1) {
  return (
    await (
      await request.get(`/api/catalogue?pokemon=${pokemon}`, { headers: await headers(request) })
    ).json()
  ).cards;
}
async function variant(request, language = 'en') {
  return (await catalogue(request))
    .find((c) => c.language === language && c.number === '001')
    .variants.find((v) => v.type === 'normal' && !v.stamps.length).id;
}
async function save(request, kind, id, data, extra = {}) {
  const body = await sync(request, extra);
  const current = body[kind === 'inventory' ? 'inventory' : 'collections'].find(
    (row) => (row.variantId || row.id) === id,
  );
  const payload = { ...data, baseRevision: current?.revision || 0, mutationId: randomUUID() };
  const response = await request.put(`/api/${kind}/${id}`, {
    headers: await headers(request, extra),
    data: payload,
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return { body: await response.json(), payload };
}
async function legacy(request, id, owned) {
  const current = (await sync(request)).progress.find((p) => p.pokemonId === id);
  const response = await request.put(`/api/pokedex/${id}`, {
    headers: await headers(request),
    data: { owned, baseRevision: current?.revision || 0, mutationId: randomUUID() },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

test('a Pokémon card read can be limited to the requested saved variants', async ({ request }) => {
  const card = (await catalogue(request)).find(
    (card) => card.language === 'en' && card.sourceId === 'sv03.5-001',
  );
  const response = await request.get(`/api/catalogue?pokemon=1&variants=${card.variants[0].id}`, {
    headers: await headers(request),
  });
  expect((await response.json()).cards.map((card) => card.sourceId)).toEqual(['sv03.5-001']);
  expect(
    (
      await request.get('/api/catalogue?pokemon=1&variants=invalid', {
        headers: await headers(request),
      })
    ).status(),
  ).toBe(400);
});

test('sync returns only later changes and keeps account cursors separate', async ({ request }) => {
  const before = await sync(request);
  const noChange = await sync(request, {}, before.cursor);
  expect(noChange.progress).toEqual([]);
  expect(noChange.inventory).toEqual([]);
  expect(noChange.collections).toEqual([]);
  const id = await variant(request);
  await save(request, 'inventory', id, { quantity: 2, wanted: false });
  const next = await sync(request, {}, before.cursor);
  expect(next.cursor).toBeGreaterThan(before.cursor);
  expect(next.inventory).toHaveLength(1);
  expect(next.inventory[0].variantId).toBe(id);
  const again = await sync(request, {}, next.cursor);
  expect(again.inventory).toEqual([]);
  expect(again.progress).toEqual([]);
  const other = await sync(request, friend);
  expect(other.inventory.find((r) => r.variantId === id)?.quantity || 0).toBe(0);
  expect(
    (await request.get('/api/sync?after=-1', { headers: await headers(request) })).status(),
  ).toBe(400);
});

test('languages have separate ownership; removing the last exact card preserves only old checkmarks', async ({
  request,
}) => {
  const en = await variant(request),
    ja = await variant(request, 'ja');
  await legacy(request, 1, false);
  await save(request, 'inventory', en, { quantity: 0, wanted: false });
  await save(request, 'inventory', ja, { quantity: 0, wanted: false });
  await save(request, 'inventory', en, { quantity: 2, wanted: false });
  expect((await sync(request)).progress.find((p) => p.pokemonId === 1).owned).toBe(true);
  await save(request, 'inventory', ja, { quantity: 1, wanted: false });
  await save(request, 'inventory', en, { quantity: 0, wanted: false });
  expect((await sync(request)).progress.find((p) => p.pokemonId === 1).owned).toBe(true);
  await save(request, 'inventory', ja, { quantity: 0, wanted: false });
  expect((await sync(request)).progress.find((p) => p.pokemonId === 1).owned).toBe(false);
  await legacy(request, 1, true);
  await save(request, 'inventory', en, { quantity: 1, wanted: false });
  await save(request, 'inventory', en, { quantity: 0, wanted: false });
  expect((await sync(request)).progress.find((p) => p.pokemonId === 1)).toMatchObject({
    owned: true,
    legacyOwned: true,
  });
  const card = (await catalogue(request, 25)).find((c) => c.sourceId === 'svp-500');
  await save(request, 'inventory', card.variants[0].id, { quantity: 1, wanted: false });
  const result = await sync(request);
  for (const id of card.pokemonIds)
    expect(result.progress.find((p) => p.pokemonId === id)?.owned).toBe(true);
});

test('card and collection writes refuse stale changes, reused IDs, and unknown cards', async ({
  request,
}) => {
  const id = await variant(request);
  const first = await save(request, 'inventory', id, { quantity: 3, wanted: true });
  const h = await headers(request);
  const retry = await request.put(`/api/inventory/${id}`, { headers: h, data: first.payload });
  expect((await retry.json()).state.revision).toBe(first.body.state.revision);
  const stale = await request.put(`/api/inventory/${id}`, {
    headers: h,
    data: { ...first.payload, mutationId: randomUUID() },
  });
  expect(stale.status()).toBe(409);
  const reused = await request.put(`/api/inventory/${id}`, {
    headers: h,
    data: { ...first.payload, quantity: 4 },
  });
  expect(reused.status()).toBe(409);
  expect((await reused.json()).code).toBe('mutation_reused');
  expect(
    (
      await request.put(`/api/inventory/${randomUUID()}`, {
        headers: h,
        data: { ...first.payload, mutationId: randomUUID() },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await request.put(`/api/inventory/${id}`, {
        headers: { ...h, Origin: 'https://other.test' },
        data: first.payload,
      })
    ).status(),
  ).toBe(403);
  const group = randomUUID();
  const created = await save(request, 'collections', group, {
    name: 'One card',
    variantIds: [id],
    deleted: false,
  });
  await save(request, 'collections', group, { name: 'Changed', variantIds: [], deleted: false });
  // A delayed retry of the first write must not restore its old membership.
  expect(
    (await request.put(`/api/collections/${group}`, { headers: h, data: created.payload })).ok(),
  ).toBeTruthy();
  expect((await sync(request)).collections.find((c) => c.id === group)).toMatchObject({
    name: 'Changed',
    variantIds: [],
  });
  expect(
    (
      await request.put(`/api/collections/${group}`, {
        headers: h,
        data: { ...created.payload, mutationId: randomUUID(), variantIds: [randomUUID()] },
      })
    ).status(),
  ).toBe(400);
});

test('collections share ownership and remain private; deleting a goal keeps the cards', async ({
  request,
}) => {
  const id = await variant(request),
    a = randomUUID(),
    b = randomUUID();
  await save(request, 'inventory', id, { quantity: 1, wanted: false });
  for (const group of [a, b])
    await save(request, 'collections', group, {
      name: 'Artwork goal',
      variantIds: [id],
      deleted: false,
    });
  const member = await sync(request, friend);
  expect(member.collections.some((c) => c.id === a)).toBe(false);
  const forged = await request.put(`/api/collections/${a}`, {
    headers: await headers(request, friend),
    data: {
      name: 'Other account',
      variantIds: [],
      deleted: false,
      baseRevision: 1,
      mutationId: randomUUID(),
    },
  });
  expect(forged.status()).toBe(409);
  await save(request, 'collections', a, { name: 'Artwork goal', variantIds: [id], deleted: true });
  const result = await sync(request);
  expect(result.inventory.find((r) => r.variantId === id).quantity).toBe(1);
  expect(result.collections.find((c) => c.id === b).variantIds).toEqual([id]);
  expect(result.collections.find((c) => c.id === a).deleted).toBe(true);
});

test('binder writes check membership and revisions and keep gaps when a card leaves', async ({
  request,
}) => {
  const en = await variant(request),
    ja = await variant(request, 'ja'),
    group = randomUUID();
  const name = 'Binder membership check';
  const created = await save(request, 'collections', group, {
    name,
    variantIds: [en, ja],
    deleted: false,
  });
  const binder = emptyBinder();
  binder.layouts[9][1] = en;
  binder.layouts[9][3] = ja;
  const placed = await save(request, 'collections', group, { binder });
  expect(placed.body.state.binder).toEqual(binder);
  const h = await headers(request);
  const url = `/api/collections/${group}`;
  const put = (data) =>
    request.put(url, { headers: h, data: { mutationId: randomUUID(), ...data } });
  expect((await put({ binder, baseRevision: created.body.state.revision })).status()).toBe(409);
  const renamed = await save(request, 'collections', group, {
    name: 'Renamed binder',
    variantIds: [ja, en],
    deleted: false,
  });
  expect(renamed.body.state.binder).toEqual(binder);
  const removed = await save(request, 'collections', group, {
    name,
    variantIds: [ja],
    deleted: false,
  });
  expect(removed.body.state.binder.layouts[9].slice(0, 4)).toEqual([null, null, null, ja]);
  expect((await put({ binder, baseRevision: removed.body.state.revision })).status()).toBe(400);
  expect((await put(placed.payload)).ok()).toBe(true);
  const added = await save(request, 'collections', group, {
    name,
    variantIds: [en, ja],
    deleted: false,
  });
  expect(added.body.state.binder).toEqual(removed.body.state.binder);
  expect((await sync(request, friend)).collections.some((c) => c.id === group)).toBe(false);
});

test('collection binder places and swaps cards and syncs separate layouts after offline edits', async ({
  page,
  context,
  request,
}) => {
  const en = await variant(request),
    ja = await variant(request, 'ja'),
    group = randomUUID();
  await save(request, 'inventory', en, { quantity: 1, wanted: false });
  await save(request, 'inventory', ja, { quantity: 0, wanted: false });
  await save(request, 'collections', group, {
    name: 'Binder interaction check',
    variantIds: [en, ja],
    deleted: false,
  });
  await page.goto(`/#/collection?collection=${group}`);
  const search = page.getByRole('searchbox', { name: 'Search cards by name' });
  await expect(page.locator('#library-results')).toHaveText('2 cards in view');
  await search.fill('Bulbasaur');
  await expect(page.locator('#library-results')).toHaveText('1 card in view');
  await page.getByRole('button', { name: 'Binder', exact: true }).click();
  await expect(search).toBeHidden();
  const slot = (index) => page.locator(`#binder-slot-${index}`);
  const unplaced = (id) => page.locator(`#binder-card-${id}`);
  const pocketSize = (size) => page.locator(`button[data-binder-size="${size}"]`);
  await expect(page.locator('.binder-pocket')).toHaveCount(18);
  await expect(unplaced(en)).toHaveAccessibleName(/Bulbasaur/);
  await expect(unplaced(en)).toBeEnabled();
  await unplaced(en).dragTo(slot(0));
  await expect(slot(0)).toHaveAttribute('data-binder-card', en);
  await unplaced(ja).focus();
  await page.keyboard.press('Enter');
  await expect(slot(0)).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(slot(1)).toHaveAttribute('data-binder-card', ja);
  await expect(slot(1)).toHaveAccessibleName(/missing/);
  await expect(slot(1).getByText('Missing', { exact: true })).toHaveCount(0);
  await slot(1).dragTo(slot(0));
  await expect(slot(0)).toHaveAttribute('data-binder-card', ja);
  await slot(0).dragTo(slot(1));
  await expect(slot(0)).toHaveAttribute('data-binder-card', en);
  const manage = page.locator('#binder-manage summary');
  await expect(manage).toHaveAccessibleName('Manage binder');
  const missingColor = page.getByRole('button', { name: 'Show missing cards in color' });
  const missingArt = slot(1).locator('.tcg-picture');
  await expect(missingColor).toHaveAttribute('aria-pressed', 'false');
  await expect(missingArt).toHaveCSS('filter', /grayscale/);
  await missingColor.click();
  await expect(missingColor).toHaveAttribute('aria-pressed', 'true');
  await expect(missingArt).toHaveCSS('filter', 'none');
  await missingColor.click();
  await expect(missingArt).toHaveCSS('filter', /grayscale/);
  await manage.click();
  const removePages = page.getByRole('button', { name: 'Remove current pages', exact: true });
  await expect(removePages).toBeDisabled();
  await page.getByRole('button', { name: 'Add pages' }).click();
  await expect(page.locator('#binder-page-count')).toHaveText('Pages 3–4 of 4');
  await page.getByRole('button', { name: 'Previous pages' }).click();
  await manage.click();
  await removePages.click();
  await expect(page.locator('#binder-page-count')).toHaveText('Pages 1–2 of 2');
  await expect(unplaced(en)).toBeVisible();
  await expect(unplaced(ja)).toBeVisible();
  await unplaced(en).dragTo(slot(0));
  await unplaced(ja).dragTo(slot(1));
  await expect(slot(0)).toHaveAttribute('data-binder-card', en);
  await expect(slot(1)).toHaveAttribute('data-binder-card', ja);
  await expect(page.locator('#app-save-state')).toHaveText('Saved');
  await context.setOffline(true);
  await manage.click();
  await pocketSize(4).click();
  await expect(page.locator('.binder-pocket')).toHaveCount(8);
  await unplaced(ja).click();
  await slot(3).click();
  await expect(slot(3)).toHaveAttribute('data-binder-card', ja);
  await context.setOffline(false);
  await syncNow(page);
  await expect
    .poll(async () => (await sync(request)).collections.find((c) => c.id === group)?.binder)
    .toMatchObject({ size: 4, layouts: { 4: [null, null, null, ja, null, null, null, null] } });
  await page.reload();
  await expect(slot(3)).toHaveAttribute('data-binder-card', ja);
  await page.setViewportSize({ width: 320, height: 740 });
  await expect(page.locator('.binder-pocket')).toHaveCount(4);
  await manage.click();
  await pocketSize(9).click();
  await expect(page.locator('.binder-pocket')).toHaveCount(9);
  await expect(slot(0)).toHaveAttribute('data-binder-card', en);
  await expect(slot(1)).toHaveAttribute('data-binder-card', ja);
  const expand = page.getByRole('button', { name: 'Enlarge binder' });
  const next = page.getByRole('button', { name: 'Next page', exact: true });
  const binderPageBox = await page.locator('.binder-page').first().boundingBox();
  const expandBox = await expand.boundingBox();
  const colorBox = await missingColor.boundingBox();
  const manageBox = await manage.boundingBox();
  const nextBox = await next.boundingBox();
  expect(expandBox.y).toBe(binderPageBox.y);
  expect(colorBox.x).toBe(expandBox.x);
  expect(manageBox.x).toBe(expandBox.x);
  expect(colorBox.y).toBeGreaterThan(expandBox.y + expandBox.height);
  expect(manageBox.y).toBeGreaterThan(colorBox.y + colorBox.height);
  expect(manageBox.y + manageBox.height).toBeLessThanOrEqual(nextBox.y);
  const enlarged = page.getByRole('dialog', { name: 'Enlarged binder' });
  await expand.click();
  await expect(enlarged.getByRole('button', { name: 'Close enlarged binder' })).toBeFocused();
  await enlarged.getByRole('button', { name: 'Show missing cards in color' }).click();
  await expect(missingArt).toHaveCSS('filter', 'none');
  await manage.click();
  await expect(removePages).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(removePages).toBeHidden();
  await expect(enlarged).toBeVisible();
  await enlarged.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(enlarged.locator('#binder-page-count')).toHaveText('Page 2 of 2');
  await page.keyboard.press('Escape');
  await expect(enlarged).toBeHidden();
  await expect(expand).toBeFocused();
  await expect(missingColor).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#binder-page-count')).toHaveText('Page 2 of 2');
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await expect(page.locator('#library-content')).toBeVisible();
  await expect(page.locator('#collection-binder')).toBeHidden();
  await expect(search).toBeVisible();
});

test('card galleries, finishes, wanted cards, quantities, and collection membership work together', async ({
  page,
  request,
}) => {
  const id = await variant(request),
    ja = await variant(request, 'ja');
  await save(request, 'inventory', id, { quantity: 0, wanted: true });
  await save(request, 'inventory', ja, { quantity: 0, wanted: true });
  await page.goto('/');
  await expect(page.locator('#cloud-status')).toHaveText('All changes saved online.');
  await page.locator('#open-collections').click();
  await page.locator('#new-collection').click();
  await page.locator('#collection-name').fill('My Bulbasaur artwork');
  await page.getByRole('button', { name: 'Save collection', exact: true }).click();
  await expect(page.locator('#library-title')).toHaveText('My Bulbasaur artwork');
  await page.locator('#open-pokedex').click();
  await page.getByRole('button', { name: 'View cards for Bulbasaur', exact: true }).click();
  await page.locator('#library-filter-toggle').click();
  await page.locator('#card-language').selectOption('ja');
  await expect(page.locator('.tcg-language').first()).toHaveText('Japanese');
  await page.locator('#card-language').selectOption('en');
  await openOwnedCard(page, 'en', 'sv03.5-001', id);
  await expect(
    page.getByRole('button', { name: 'Remove from wishlist', exact: true }),
  ).toBeVisible();
  const group = (await sync(request)).collections.find(
    (c) => c.name === 'My Bulbasaur artwork' && !c.deleted,
  );
  await page.locator('#detail-collections > summary').click();
  await page.locator(`#member-${group.id}`).check();
  await expect
    .poll(async () => (await sync(request)).collections.find((c) => c.id === group.id).variantIds)
    .toContain(id);
  await page.locator('#detail-quantity').fill('2');
  await page.locator('#detail-quantity').press('Tab');
  await expect
    .poll(async () => (await sync(request)).inventory.find((r) => r.variantId === id)?.quantity)
    .toBe(2);
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav.locator('#open-pokedex + .nav-divider + #open-cards')).toBeVisible();
  await expect(nav.locator('#open-cards + #open-collections + #open-wishlist')).toBeVisible();
  await nav.locator('#open-cards').click();
  await expect(page).toHaveURL(/#\/cards$/);
  await expect(page.locator('#app-title')).toHaveText('Cards');
  const ownedCard = page.locator('[data-open-card="en:sv03.5-001"]');
  await expect(ownedCard.locator('.owned-badge')).toHaveText('2 owned');
  await expect(ownedCard.getByText('Wanted', { exact: true })).toHaveCount(0);
  await expect(page.locator('[data-open-card="ja:SV2a-001"]')).toHaveCount(0);
  await ownedCard.click();
  await expect(nav.locator('#open-cards')).toHaveAttribute('aria-current', 'page');
  await page.locator('#app-back').click();
  await expect(ownedCard).toBeVisible();
  await page.locator('#open-pokedex').click();
  await expect(page.locator('[data-id="1"]')).toBeChecked();
  await page.locator('#open-wishlist').click();
  await page.locator('#library-filter-toggle').click();
  await page.locator('#wishlist-collection').selectOption(group.id);
  await expect(page.locator(`[data-variant="${id}"]`)).toBeVisible();
  await page.locator('#open-collections').click();
  await page.locator(`[data-open-collection="${group.id}"]`).click();
  await expect(page.locator('#library-summary')).toHaveText('1 of 1 owned · 100%');
  await page.screenshot({ path: 'test-results/card-collection-desktop.png', fullPage: false });
});

test('offline card edits survive a reload and show a conflict instead of overwriting another device', async ({
  page,
  context,
  request,
}) => {
  const id = await variant(request, 'ja');
  await save(request, 'inventory', id, { quantity: 0, wanted: true });
  await page.goto('/');
  await expect(page.locator('#cloud-status')).toHaveText('All changes saved online.');
  await page.getByRole('button', { name: 'View cards for Bulbasaur', exact: true }).click();
  await openOwnedCard(page, 'ja', 'SV2a-001', id);
  const input = page.locator('#detail-quantity');
  await expect(input).toBeVisible();
  await context.setOffline(true);
  await input.fill('2');
  await input.press('Tab');
  await expect(page.locator('#cloud-status')).toContainText('Pending changes stay on this device.');
  await expect(page.locator('[data-id="1"]')).toBeChecked();
  await page.route('**/api/inventory/*', (route) => route.abort());
  await context.setOffline(false);
  await page.reload();
  await expect(page.locator('#cloud-status')).toContainText('Pending changes stay on this device.');
  await save(request, 'inventory', id, { quantity: 4, wanted: false });
  await page.unroute('**/api/inventory/*');
  await syncNow(page);
  await openAccount(page);
  await expect(page.locator('#cloud-conflicts')).toBeVisible();
  await page.locator('#cloud-conflicts').click();
  await expect(page.locator('#cloud-review-items')).toContainText('This device: 2 owned');
  await page.getByRole('button', { name: 'Use online record', exact: true }).click();
  await page.locator('#open-pokedex').click();
  await page.getByRole('button', { name: 'View cards for Bulbasaur', exact: true }).click();
  await openOwnedCard(page, 'ja', 'SV2a-001', id);
  await expect(page.locator('#detail-quantity')).toHaveValue('4');
});

test('phone card view has no horizontal overflow and shows an image placeholder', async ({
  page,
  request,
}) => {
  const card = (await catalogue(request, 25)).find((c) => c.sourceId === 'svp-085');
  await save(request, 'inventory', card.variants[0].id, { quantity: 0, wanted: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#cloud-status')).toHaveText('All changes saved online.');
  await page.getByRole('button', { name: 'View cards for Pikachu', exact: true }).click();
  await expect(page.locator('#library-title')).toHaveText('Pikachu');
  await expect(
    page.locator('.tcg-picture').filter({ hasText: 'Image unavailable' }).first(),
  ).toBeVisible();
  expect(
    await page.locator('#card-library').evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.screenshot({ path: 'test-results/card-collection-phone.png', fullPage: false });
});

test('backups include exact cards and collections and can be restored into a separate account', async ({
  page,
  context,
  request,
}) => {
  const id = await variant(request),
    group = randomUUID();
  const binder = emptyBinder();
  binder.layouts[9][4] = id;
  await save(request, 'inventory', id, { quantity: 5, wanted: true });
  await save(request, 'collections', group, {
    name: 'Backup goal',
    variantIds: [id],
    deleted: false,
    binder,
  });
  await page.goto('/');
  await expect(page.locator('#cloud-status')).toHaveText('All changes saved online.');
  const downloadPromise = page.waitForEvent('download');
  await openAccount(page);
  await page.locator('#app-backup').click();
  const downloaded = await downloadPromise;
  const data = JSON.parse(await readFile(await downloaded.path(), 'utf8'));
  expect(data.version).toBe(3);
  expect(data.inventory.find((r) => r.variantId === id).quantity).toBe(5);
  expect(data.collections.find((c) => c.id === group).variantIds).toEqual([id]);
  expect(data.collections.find((c) => c.id === group).binder).toEqual(binder);
  await context.setExtraHTTPHeaders(friend);
  await page.reload();
  await expect(page.locator('#cloud-account')).toContainText('friend@example.test');
  await page.locator('#import-file').setInputFiles({
    name: 'carddex-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(data)),
  });
  await page.locator('#restore-review-confirm').click();
  await expect
    .poll(async () => (await sync(request, friend)).collections.find((c) => c.id === group))
    .toMatchObject({ name: 'Backup goal', binder });
  await expect
    .poll(
      async () => (await sync(request, friend)).inventory.find((r) => r.variantId === id)?.quantity,
    )
    .toBe(5);
});
