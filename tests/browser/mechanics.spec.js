import { test, expect } from '@playwright/test';
import { syncNow } from './helpers.js';
import { randomUUID } from 'node:crypto';

test('large card galleries add another page without replacing existing cards and filters cover every card', async ({
  page,
}) => {
  const cards = Array.from({ length: 63 }, (_, index) => ({
    id: randomUUID(),
    language: index % 2 ? 'ja' : 'en',
    sourceId: `render-fixture-${index}`,
    number: String(index + 1),
    name: `Render fixture ${index}`,
    artist: 'Test artist',
    image: null,
    setId: 'render-set',
    setName: 'Render fixtures',
    pokemonIds: [1],
    variants: [{ id: randomUUID(), type: 'normal', size: 'standard', stamps: [] }],
  }));
  await page.route('**/api/sync?**', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        cursor: 10000,
        reset: false,
        progress: [],
        collections: [],
        inventory: cards.map((card) => ({
          variantId: card.variants[0].id,
          quantity: 1,
          wanted: false,
          revision: 1,
          pokemonIds: [1],
        })),
      }),
    }),
  );
  await page.route('**/api/catalogue?**', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ cards }) }),
  );
  await page.goto('/#/pokemon?pokemon=1');
  await expect(page.locator('.tcg-card')).toHaveCount(48);
  await page.evaluate(() => {
    window.firstGalleryCard = document.querySelector('.tcg-card');
  });
  await page.locator('[data-more-cards]').click();
  await expect(page.locator('.tcg-card')).toHaveCount(63);
  expect(await page.evaluate(() => firstGalleryCard === document.querySelector('.tcg-card'))).toBe(
    true,
  );
  await page.locator('#library-filter-panel > summary').click();
  await page.locator('#card-language').selectOption('ja');
  await expect(page.locator('.tcg-card')).toHaveCount(31);
  await expect(page.locator('[data-more-cards]')).toHaveCount(0);
  await expect(page.locator('#library-sprite')).toBeVisible();
  await page.evaluate(() => (location.hash = '#/wishlist'));
  await expect(page.locator('#library-title')).toHaveText('Wishlist');
  await expect(page.locator('#library-sprite')).toBeHidden();
});

test('the cloud page loads a small Pokémon grid and keeps existing cards when more are shown', async ({
  page,
  request,
}) => {
  const html = await (await request.get('/')).text();
  expect(Buffer.byteLength(html)).toBeLessThan(200000);
  expect(html).not.toContain('data:image/png;base64,');
  await page.goto('/');
  await expect(page.locator('#app-save-state')).toHaveText('Saved');
  const count = await page.locator('.pokemon-card').count();
  expect(count).toBeLessThanOrEqual(96);
  expect(await page.evaluate(() => document.querySelectorAll('*').length)).toBeLessThan(2000);
  await page.evaluate(() => {
    window.firstPokemon = document.querySelector('.pokemon-card');
  });
  await page.locator('#dex-more').click();
  await expect.poll(() => page.locator('.pokemon-card').count()).toBeGreaterThan(count);
  expect(await page.evaluate(() => firstPokemon === document.querySelector('.pokemon-card'))).toBe(
    true,
  );
  await page.locator('#search').fill('1025');
  await expect(page.locator('[data-id="1025"]')).toBeVisible();
  await expect(page.locator('.pokemon-card')).toHaveCount(1);
  const sprite = await page.locator('.sprite').first().getAttribute('src');
  expect(sprite).toMatch(/^\/sprites\/1025-[a-f0-9]+\.png$/);
  expect((await request.get(sprite)).headers()['cache-control']).toContain('immutable');
});

test('the private page loads the stylesheet and all modules from one version', async ({ page }) => {
  const assets = [];
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.hostname === '127.0.0.1' && /\.(js|css)$/.test(url.pathname)) assets.push(url.pathname);
  });
  const document = await page.goto('/');
  await expect(page.locator('.app-header .app-brand')).toHaveText('Collect');
  await expect(page.locator('#app-save-state')).toHaveText('Saved');
  expect(document.headers()['cache-control']).toContain('no-store');
  const [assetPath] = new Set(assets.map((asset) => asset.slice(0, asset.lastIndexOf('/'))));
  expect(assetPath).toMatch(/^\/app\/[a-f0-9]{16}$/);
  expect(assets).toContain(`${assetPath}/cloud.css`);
  expect(assets).toContain(`${assetPath}/cloud.js`);
  expect(assets).toContain(`${assetPath}/shell.js`);
  expect(assets.every((asset) => asset.startsWith(`${assetPath}/`))).toBe(true);
});

test('a saved compact Pokédex view fits the number, card and checkbox on one row', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#app-save-state')).toHaveText('Saved');
  await page.getByRole('button', { name: 'Use compact view' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Use grid view' })).toBeVisible();
  for (const width of [1280, 320]) {
    await page.setViewportSize({ width, height: 800 });
    const row = page.locator('.cards.list [data-card="1"]');
    const bounds = await row.boundingBox();
    expect(bounds.height).toBeLessThan(64);
    const name = await row.locator('.pokemon-open').boundingBox();
    const check = await row.getByRole('checkbox').boundingBox();
    expect(name.x + name.width).toBeLessThan(check.x);
    expect(Math.abs(check.y + check.height / 2 - (bounds.y + bounds.height / 2))).toBeLessThan(2);
  }
});

test('printing includes all selected Pokémon and returns to the existing grid', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#app-save-state')).toHaveText('Saved');
  const count = await page.locator('.pokemon-card').count();
  await page.evaluate(() => {
    window.beforePrintCard = document.querySelector('.pokemon-card');
    dispatchEvent(new Event('beforeprint'));
  });
  await expect(page.locator('.pokemon-card')).toHaveCount(1025);
  await page.evaluate(() => dispatchEvent(new Event('afterprint')));
  await expect(page.locator('.pokemon-card')).toHaveCount(count);
  expect(
    await page.evaluate(() => beforePrintCard === document.querySelector('.pokemon-card')),
  ).toBe(true);
});

test('saved results update as you type while set details are still loading', async ({ page }) => {
  let release,
    externalCalls = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/cards/search') externalCalls++;
  });
  const held = new Promise((resolve) => {
    release = resolve;
  });
  await page.route('**/api/catalogue/sets?**', async (route) => {
    await held;
    await route.continue();
  });
  try {
    await page.goto('/#/search');
    await expect(page.locator('#app-save-state')).toHaveText('Saved');
    await page.getByRole('searchbox', { name: 'Filter saved cards' }).fill('Bulbasaur');
    await expect(page.locator('.search-card').first()).toContainText('Bulbasaur');
    await expect(page.locator('#card-search')).not.toHaveAttribute('aria-busy', 'true');
    expect(externalCalls).toBe(0);
  } finally {
    release();
  }
});

test('changing a pending search cancels its read and clears its busy state', async ({ page }) => {
  let release,
    aborted = false;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  page.on('requestfailed', (request) => {
    if (new URL(request.url()).pathname === '/api/cards/search') aborted = true;
  });
  await page.route('**/api/cards/search?**', async (route) => {
    await held;
    await route
      .fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ cards: [], hasMore: false }),
      })
      .catch(() => {});
  });
  try {
    await page.goto('/#/search');
    await expect(page.locator('#app-save-state')).toHaveText('Saved');
    await page.locator('#card-search-name').fill('Bulbasaur');
    const pending = page.waitForRequest('**/api/cards/search?**');
    await page.locator('#search-external').click();
    await pending;
    await page.locator('#card-search-name').fill('Arcanine');
    await expect(page.locator('#card-search')).not.toHaveAttribute('aria-busy', 'true');
    release();
    await expect.poll(() => aborted).toBe(true);
    await expect(page.locator('.search-card')).toHaveCount(0);
  } finally {
    release();
  }
});

test('search details and the submitted search survive a reload', async ({ page }) => {
  await page.goto(
    '/#/search?term=Bulbasaur&language=en&set=sv03.5&setName=151&number=001&mode=saved&page=1',
  );
  await expect(page.locator('.search-card').first()).toContainText('Bulbasaur');
  await page.reload();
  await expect(page.locator('#card-search-name')).toHaveValue('Bulbasaur');
  await expect(page.locator('#card-search-set')).toHaveValue('sv03.5');
  await expect(page.locator('#card-search-number')).toHaveValue('001');
  await expect(page.locator('.search-card').first()).toBeVisible();
  await page.locator('#card-search-name').fill('Arcanine');
  await page.reload();
  await expect(page.locator('#card-search-name')).toHaveValue('Arcanine');
  await expect(page.locator('.search-card')).toHaveCount(0);
});

test('an unchanged sync writes no account data and keeps the card image and controls', async ({
  page,
}) => {
  await page.goto('/#/card?language=en&sourceId=base1-44');
  await expect(page.locator('#detail-title')).toHaveText('Bulbasaur');
  await expect(page.locator('#app-save-state')).toHaveText('Saved');
  await page.evaluate(() => {
    window.accountWrites = 0;
    window.retainedImage = document.querySelector('#detail-image img');
    window.retainedQuantity = document.querySelector('#detail-quantity');
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'accounts') accountWrites++;
      return original.apply(this, args);
    };
  });
  await syncNow(page);
  await expect(page.locator('#app-save-state')).toHaveText('Saved');
  expect(await page.evaluate(() => accountWrites)).toBe(0);
  expect(
    await page.evaluate(
      () =>
        retainedImage === document.querySelector('#detail-image img') &&
        retainedQuantity === document.querySelector('#detail-quantity'),
    ),
  ).toBe(true);
});

test('a personal Pokémon lookup uses only the signed account records', async ({ request }) => {
  const owner = (await (await request.get('/api/session')).json()).user;
  for (const extra of [{}, { 'X-Carddex-Dev-Email': 'friend@example.test' }]) {
    const user = (await (await request.get('/api/session', { headers: extra })).json()).user;
    const headers = { ...extra, 'X-Carddex-Account': user.id };
    const state = await (await request.get('/api/sync', { headers })).json();
    const allowed = new Set([
      ...state.inventory.filter((row) => row.quantity || row.wanted).map((row) => row.variantId),
      ...state.collections.filter((group) => !group.deleted).flatMap((group) => group.variantIds),
    ]);
    const all = await (await request.get('/api/catalogue?pokemon=1', { headers })).json();
    const personal = await (
      await request.get(`/api/catalogue?pokemon=1&personal=1&user=${owner.id}`, { headers })
    ).json();
    expect(personal.cards.map((card) => card.id).sort()).toEqual(
      all.cards
        .filter((card) => card.variants.some((variant) => allowed.has(variant.id)))
        .map((card) => card.id)
        .sort(),
    );
  }
});
